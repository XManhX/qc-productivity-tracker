// api/qc-productivity/send-hourly-report.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
);

const CRON_SECRET = process.env.CRON_SECRET;
const VN_OFFSET = 7 * 3600 * 1000; // UTC+7 tính bằng ms (nhất quán với toàn project)

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

/**
 * Hàm format tên in hoa chữ đầu mỗi từ (nhất quán với send-idle-alert.js)
 */
const capitalizeName = (name) => {
    if (!name) return name;
    return name
        .trim() // Xóa khoảng trắng thừa đầu/cuối
        .split(/\s+/) // Tách tất cả khoảng trắng thừa giữa các từ
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
};

// Lấy ngày hôm nay theo múi giờ VN (UTC+7) - nhất quán với toàn project
function getTodayVN() {
    const now = new Date(Date.now() + VN_OFFSET);
    return now.toISOString().split("T")[0];
}

// Kiểm tra có phải ngày làm việc không
function isWorkdayVN() {
    return true; // Luôn gửi báo cáo tất cả các ngày
}

// Hàm xử lý logs thành định dạng tính toán năng suất
function processLogsToStats(users, logs, hourStart, hourEnd) {
    // Tạo map operator -> email
    const userMap = new Map();
    users.forEach(user => {
        userMap.set(user.email.toLowerCase(), {
            ...user,
            total: 0
        });
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
            userData.total += 1;
        }
    });

    return Array.from(userMap.values());
}

// Gửi webhook text đến SeaTalk
async function sendSeaTalkTextWebhook(webhookUrl, content) {
    if (!webhookUrl) throw new Error("Thiếu SeaTalk webhook URL trong cấu hình");

    const payload = {
        tag: "text",
        text: {
            format: 1,
            content: content
        }
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

export default async function handler(req, res) {
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

        // 4. Xử lý dữ liệu thành thống kê năng suất
        const processedData = processLogsToStats(users, logs, hourStart, hourEnd);
        // Sắp xếp theo tổng giảm dần
        processedData.sort((a, b) => b.total - a.total);

        // 5. Tạo nội dung text báo cáo để gửi qua SeaTalk
        let reportContent = `📊 **BÁO CÁO NĂNG SUẤT QC - ${reportDate}**\n\n`;
        reportContent += `👥 Tổng số nhân viên hoạt động: ${processedData.length}\n`;
        reportContent += `⏰ Giờ làm việc: ${hourStart}h - ${hourEnd}h\n\n`;
        reportContent += `📋 **Top 10 nhân viên năng suất cao nhất:**\n`;
        reportContent += "```\n";
        reportContent += `${"STT".padEnd(5)}${"Tên".padEnd(25)}${"Tổng".padEnd(8)}\n`;
        reportContent += `${"-".repeat(40)}\n`;

        // Chỉ lấy top 10 để gửi
        processedData.slice(0, 10).forEach((user, index) => {
            const displayName = user.name ? capitalizeName(user.name) : user.email;
            const name = displayName.substring(0, 22);
            reportContent += `${(index + 1).toString().padEnd(5)}${name.padEnd(25)}${(user.total || 0).toString().padEnd(8)}\n`;
        });
        reportContent += "```\n";
        reportContent += `\n🔗 Xem chi tiết tại: https://qc-productivity-tracker.vercel.app`;

        // Gửi báo cáo đến SeaTalk
        const webhookUrl = config.report_seatalk_webhook_url || config.seatalk_webhook_url;
        if (webhookUrl) {
            await sendSeaTalkTextWebhook(webhookUrl, reportContent);
            console.log("Đã gửi báo cáo text thành công đến SeaTalk!");
        } else {
            console.log("Không có webhook URL cấu hình, bỏ qua gửi SeaTalk");
        }

        // Ghi log thành công (bỏ qua lỗi nếu bảng chưa tồn tại)
        await supabase.from("qc_report_logs").insert({
            report_type: "hourly_text",
            content_text: reportContent,
            sent_at: new Date().toISOString(),
            status: "success"
        }).catch(logErr => console.warn("Không thể ghi log thành công:", logErr.message));

        return res.json({
            success: true,
            message: "Báo cáo đã được xử lý và gửi thành công đến SeaTalk",
            reportDate,
            totalUsers: processedData.length
        });

    } catch (error) {
        console.error("[send-hourly-report] Lỗi:", error);

        // Ghi log lỗi
        await supabase.from("qc_report_logs").insert({
            report_type: "hourly_text",
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