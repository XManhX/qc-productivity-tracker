// api/qc-productivity/send-hourly-report.js
import { createClient } from "@supabase/supabase-js";
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
);

// Dùng service role để upload storage bypass RLS
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const CRON_SECRET = process.env.CRON_SECRET;

// Cache cấu hình trong 5 phút
let cachedConfig = null;
let lastConfigFetch = 0;

async function getReportConfig() {
    const now = Date.now();
    if (cachedConfig && now - lastConfigFetch < 300_000) {
        return cachedConfig;
    }

    const { data, error } = await supabase
        .from("qc_alert_config")
        .select("*")
        .eq("id", 1)
        .single();

    if (error) throw new Error(`Lấy cấu hình báo cáo lỗi: ${error.message}`);

    cachedConfig = data;
    lastConfigFetch = now;
    return data;
}

// Lấy ngày hôm nay theo múi giờ VN (UTC+7)
function getTodayVN() {
    const now = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
    return now.toISOString().split("T")[0];
}

// Kiểm tra có phải ngày làm việc không - Đã sửa để gửi tất cả các ngày
function isWorkdayVN() {
    // Luôn trả về true để gửi báo cáo tất cả các ngày trong tuần
    return true;
}

// Hàm xử lý logs thành định dạng heatmap giống client
function processLogsToHeatmapFormat(users, logs, hourStart, hourEnd) {
    // Tạo map operator -> email
    const userMap = new Map();
    users.forEach(user => {
        userMap.set(user.email.toLowerCase(), {
            ...user,
            total: 0,
            hourly: {},
            low_threshold: user.low_threshold || 10,
            medium_threshold: user.medium_threshold || 16
        });

        // Khởi tạo hourly với 0
        for (let h = hourStart; h <= hourEnd; h++) {
            userMap.get(user.email.toLowerCase()).hourly[h] = 0;
        }
    });

    // Xử lý logs
    logs.forEach(log => {
        const email = log.operator?.toLowerCase();
        if (!userMap.has(email)) return;

        const logDate = new Date(log.created_at);
        const logHour = logDate.getHours();

        // Chỉ đếm nếu trong khoảng giờ báo cáo
        if (logHour >= hourStart && logHour <= hourEnd) {
            const userData = userMap.get(email);
            userData.hourly[logHour] = (userData.hourly[logHour] || 0) + 1;
            userData.total += 1;
        }
    });

    return Array.from(userMap.values());
}

// Tạo HTML bảng heatmap (tái sử dụng 100% logic từ client-side exportToImage)
function generateHeatmapHTML(data, hourStart, hourEnd, reportDate) {
    let html = `<html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Inter', sans-serif; background: #ffffff; padding: 20px; }
        .report-header { margin-bottom: 16px; }
        .report-title { font-size: 18px; font-weight: 700; color: #1e293b; }
        .report-time { font-size: 14px; color: #64748b; margin-top: 4px; }
      </style>
    </head>
    <body>
      <div class="report-header">
        <div class="report-title">Báo cáo Năng suất QC Hàng giờ</div>
        <div class="report-time">Ngày: ${reportDate} | Giờ làm việc: ${hourStart}h - ${hourEnd}h</div>
      </div>
      <table style="border-collapse: collapse; width: auto; font-size: 13px;">`;

    // Header bảng
    html += `<thead><tr style="background: #f1f5f9; font-weight: 600; text-align: center;">`;
    html += `<th style="border: 1px solid #cbd5e1; padding: 8px 12px; min-width: 200px; text-align: left;">Nhân viên</th>`;
    html += `<th style="border: 1px solid #cbd5e1; padding: 8px 12px; min-width: 80px; text-align: left;">Role</th>`;
    html += `<th style="border: 1px solid #cbd5e1; padding: 8px 12px; min-width: 80px; background: #ecfdf5; font-weight: 700;">Tổng</th>`;

    for (let h = hourStart; h <= hourEnd; h++) {
        html += `<th style="border: 1px solid #cbd5e1; padding: 8px 12px; min-width: 55px;">${h}h</th>`;
    }
    html += `</tr></thead><tbody>`;

    // Dữ liệu từng dòng
    const workingHours = hourEnd - hourStart + 1;
    data.forEach((user) => {
        const lowTotal = (user.low_threshold || 10) * workingHours;
        const highTotal = (user.medium_threshold || 16) * workingHours;
        const total = user.total || 0;

        // Màu nền cột Tổng
        let totalBg = "#f8fafc";
        if (total > 0) {
            if (total < lowTotal) totalBg = "#fee2e2";
            else if (total < highTotal) totalBg = "#fef9c3";
            else totalBg = "#dcfce7";
        }

        html += `<tr>`;
        // Cột Nhân viên
        const name = user.name || user.email;
        const email = user.name ? user.email : "";
        html += `<td style="border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left;">
            <div style="font-weight: 500;">${name}</div>
            ${email ? `<div style="font-size: 11px; color: #64748b;">${email}</div>` : ""}
          </td>`;
        // Cột Role
        html += `<td style="border: 1px solid #e2e8f0; padding: 8px 12px;">${user.display_name || user.role_key || "-"}</td>`;
        // Cột Tổng
        html += `<td style="border: 1px solid #e2e8f0; padding: 8px 12px; text-align: center; font-weight: bold; background: ${totalBg};">${total}</td>`;

        // Các cột giờ
        for (let h = hourStart; h <= hourEnd; h++) {
            const count = user.hourly?.[h] || 0;
            let bg = "#f8fafc";
            let color = "#94a3b8";
            if (count > 0) {
                const lt = user.low_threshold || 10;
                const mt = user.medium_threshold || 16;
                if (count < lt) {
                    bg = "#fee2e2";
                    color = "#991b1b";
                } else if (count < mt) {
                    bg = "#fef9c3";
                    color = "#854d0e";
                } else {
                    bg = "#dcfce7";
                    color = "#166534";
                }
            }
            html += `<td style="border: 1px solid #e2e8f0; padding: 8px 12px; text-align: center; background: ${bg}; color: ${color};">
                ${count === 0 ? "-" : count}
              </td>`;
        }
        html += `</tr>`;
    });

    html += `</tbody></table></body></html>`;
    return html;
}

// Chụp ảnh từ HTML với Puppeteer
async function htmlToImage(html) {
    let browser;
    // Xử lý môi trường: trên Vercel (production) dùng @sparticuz/chromium, local dùng puppeteer có sẵn
    if (process.env.VERCEL_ENV === "production") {
        browser = await puppeteer.launch({
            args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
            defaultViewport: { width: 1920, height: 1080 }
        });
    } else {
        // Môi trường development local
        browser = await puppeteer.launch({
            headless: true,
            defaultViewport: { width: 1920, height: 1080 }
        });
    }

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    // Chờ bảng render xong
    await new Promise(r => setTimeout(r, 500));

    const table = await page.$('table');
    const screenshot = await table.screenshot({
        type: 'png',
        scale: 2,
        omitBackground: false
    });

    await browser.close();
    return screenshot;
}

// Gửi webhook text đến SeaTalk
async function sendSeaTalkTextWebhook(webhookUrl, content, reportTime) {
    if (!webhookUrl) throw new Error("Thiếu SeaTalk webhook URL trong cấu hình");

    const payload = {
        msg_type: "text",
        content: content
    };

    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gửi webhook SeaTalk lỗi: ${response.status} - ${errorText}`);
    }

    return true;
}

// Hàm cũ gửi ảnh vẫn giữ lại nếu cần dùng sau
// async function sendSeaTalkWebhook(webhookUrl, imageUrl, reportTime) {
//     if (!webhookUrl) throw new Error("Thiếu SeaTalk webhook URL trong cấu hình");
//     const payload = {
//         msg_type: "post",
//         content: {
//             post: {
//                 title: "📊 Báo cáo năng suất QC tự động",
//                 content: [
//                     [{ tag: "text", text: `Báo cáo năng suất được cập nhật lúc: ${reportTime}` }],
//                     [{ tag: "img", image_url: imageUrl }]
//                 ]
//             }
//         }
//     };
//     const response = await fetch(webhookUrl, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify(payload)
//     });
//     if (!response.ok) {
//         const errorText = await response.text();
//         throw new Error(`Gửi webhook SeaTalk lỗi: ${response.status} - ${errorText}`);
//     }
//     return true;
// }

export default async function handler(req, res) {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") return res.status(200).end();

    // Nếu bạn dùng dịch vụ cron ngoài, bạn có thể thêm xác thực khác ở đây
    // Hiện tại bỏ qua xác thực để dễ gọi từ các dịch vụ khác
    // const authHeader = req.headers.authorization;
    // if (authHeader !== `Bearer ${CRON_SECRET}`) {
    //     return res.status(401).json({ success: false, error: "Unauthorized: Invalid CRON_SECRET" });
    // }

    try {
        console.log("Bắt đầu chạy send-hourly-report...");
        // 1. Lấy cấu hình báo cáo
        const config = await getReportConfig();
        console.log("Đã lấy cấu hình:", JSON.stringify(config));

        // Kiểm tra báo cáo có bật không
        if (!config.report_enabled) {
            return res.json({ success: false, reason: "Báo cáo đã bị tắt trong cấu hình" });
        }

        // Kiểm tra ngày làm việc nếu bật chỉ gửi ngày làm việc
        if (config.report_only_workdays && !isWorkdayVN()) {
            return res.json({ success: false, reason: "Hôm nay không phải ngày làm việc, bỏ qua gửi báo cáo" });
        }

        const hourStart = config.report_hour_start || 9;
        const hourEnd = config.report_hour_end || 18;
        const reportDate = getTodayVN();
        const reportTimeVN = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

        // 2. Lấy danh sách users từ DB
        const { data: users, error: usersError } = await supabase
            .from("qc_users")
            .select(`email, name, is_active, role_id, qc_roles!inner(role_key, display_name), low_threshold, medium_threshold`)
            .eq("is_active", true);

        if (usersError) throw new Error(`Lấy users lỗi: ${usersError.message}`);

        // 3. Lấy logs trong 24h qua để tính toán
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: logs, error: logsError } = await supabase
            .from("qc_logs")
            .select("operator, created_at")
            .gte("created_at", oneDayAgo);

        if (logsError) throw new Error(`Lấy logs lỗi: ${logsError.message}`);

        // 4. Xử lý dữ liệu thành định dạng heatmap
        const processedData = processLogsToHeatmapFormat(users, logs, hourStart, hourEnd);
        // Sắp xếp theo tổng giảm dần
        processedData.sort((a, b) => b.total - a.total);

        // 5. Tạo HTML
        const html = generateHeatmapHTML(processedData, hourStart, hourEnd, reportDate);

        // Tạo nội dung text báo cáo để gửi qua SeaTalk (không cần chụp ảnh)
        let reportContent = `📊 **BÁO CÁO NĂNG SUẤT QC - ${reportDate}**\n\n`;
        reportContent += `👥 Tổng số nhân viên hoạt động: ${processedData.length}\n`;
        reportContent += `⏰ Giờ làm việc: ${hourStart}h - ${hourEnd}h\n\n`;
        reportContent += `📋 **Top 10 nhân viên năng suất cao nhất:**\n`;
        reportContent += `` + "```\n";
        reportContent += `${"STT".padEnd(5)}${"Tên".padEnd(25)}${"Tổng".padEnd(8)}\n`;
        reportContent += `${"-".repeat(40)}\n`;

        // Chỉ lấy top 10 để gửi
        processedData.slice(0, 10).forEach((user, index) => {
            const name = (user.name || user.email).substring(0, 22);
            reportContent += `${(index + 1).toString().padEnd(5)}${name.padEnd(25)}${(user.total || 0).toString().padEnd(8)}\n`;
        });
        reportContent += "```\n";
        reportContent += `\n🔗 Xem chi tiết tại: https://qc-productivity-tracker.vercel.app`;

        // Gửi báo cáo đến SeaTalk
        const webhookUrl = config.report_seatalk_webhook_url || config.seatalk_webhook_url;
        if (webhookUrl) {
            await sendSeaTalkTextWebhook(webhookUrl, reportContent, reportTimeVN);
            console.log("Đã gửi báo cáo text thành công đến SeaTalk!");
        } else {
            console.log("Không có webhook URL cấu hình, bỏ qua gửi SeaTalk");
        }

        // Ghi log thành công
        await supabase.from("qc_report_logs").insert({
            report_type: "hourly_text",
            content_text: reportContent,
            sent_at: new Date().toISOString()
        });

        return res.json({
            success: true,
            message: "Báo cáo đã được xử lý và gửi thành công đến SeaTalk",
            reportDate,
            totalUsers: processedData.length
        });

        // Ghi log thành công
        await supabase.from("qc_report_logs").insert({
            report_type: "hourly_heatmap",
            image_url: imageUrl,
            sent_at: new Date().toISOString(),
            status: "success"
        });

        return res.status(200).json({
            success: true,
            message: "Báo cáo đã được gửi thành công đến SeaTalk",
            imageUrl,
            reportTime: reportTimeVN
        });

    } catch (error) {
        console.error("[send-hourly-report] Lỗi:", error);

        // Ghi log lỗi
        await supabase.from("qc_report_logs").insert({
            report_type: "hourly_heatmap",
            error_message: error.message,
            sent_at: new Date().toISOString(),
            status: "failed"
        }).catch(logErr => console.error("Không thể ghi log lỗi:", logErr));

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}