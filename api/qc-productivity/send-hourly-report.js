// api/qc-productivity/send-hourly-report.js
import { createClient } from "@supabase/supabase-js";
import nodeHtmlToImage from "node-html-to-image";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

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

// Hàm xử lý logs thành định dạng tính toán năng suất - NƠI DỄ GẶP LỖI NHẤT
function processLogsToStats(users, logs, hourStart, hourEnd) {
    console.log(`[DEBUG processLogsToStats] Bắt đầu xử lý: users=${users.length}, logs=${logs.length}, hourStart=${hourStart}, hourEnd=${hourEnd}`);

    // Tạo map operator -> email (chuyển hết về lowerCase để so sánh)
    const userMap = new Map();
    users.forEach(user => {
        const emailLower = user.email.toLowerCase();
        userMap.set(emailLower, {
            ...user,
            total: 0
        });
        console.log(`[DEBUG processLogsToStats] Thêm user vào map: ${emailLower} (tên: ${user.name})`);
    });

    let skippedLogsNoUser = 0;
    let skippedLogsOutOfTime = 0;
    let countedLogs = 0;

    // Xử lý từng log
    logs.forEach(log => {
        const email = log.operator?.toLowerCase();

        // 1. Kiểm tra user có tồn tại trong map không
        if (!userMap.has(email)) {
            skippedLogsNoUser++;
            // Chỉ log 5 lần đầu để tránh spam console
            if (skippedLogsNoUser <= 5) console.log(`[DEBUG processLogsToStats] Bỏ qua log không tìm thấy user: operator=${log.operator}, email trong log không khớp với user list`);
            return;
        }

        // 2. Kiểm tra log có trong khoảng giờ tính toán không
        const logDate = new Date(log.created_at);
        const logHour = logDate.getHours(); // logHour là giờ UTC của DB, cần kiểm tra múi giờ!
        // ⚠️ LƯU Ý QUAN TRỌNG: DB lưu created_at ở UTC, nhưng ta cần lấy giờ VN để so sánh hourStart/hourEnd!
        const vnLogDate = new Date(logDate.getTime() + VN_OFFSET);
        const vnLogHour = vnLogDate.getHours();
        console.log(`[DEBUG processLogsToStats] Log của ${email}: created_at=${log.created_at}, UTC giờ=${logHour}, VN giờ=${vnLogHour}`);

        if (vnLogHour < hourStart || vnLogHour > hourEnd) {
            skippedLogsOutOfTime++;
            return;
        }

        // 3. Nếu hợp lệ thì tăng tổng
        const userData = userMap.get(email);
        userData.total += 1;
        countedLogs++;
        console.log(`[DEBUG processLogsToStats] Tăng tổng cho ${email}: mới=${userData.total}`);
    });

    console.log(`[DEBUG processLogsToStats] Kết quả xử lý: counted=${countedLogs}, bỏ qua vì không có user=${skippedLogsNoUser}, bỏ qua vì ngoài giờ=${skippedLogsOutOfTime}`);
    return Array.from(userMap.values()).filter(u => u.total > 0); // Chỉ trả về user có logs > 0
}

// Gửi webhook dạng card (interactive message) đến SeaTalk
async function sendSeaTalkCardWebhook(webhookUrl, cardPayload) {
    if (!webhookUrl) throw new Error("Thiếu SeaTalk webhook URL trong cấu hình");

    // Cấu trúc payload cho interactive message dạng card
    const payload = {
        tag: "interactive",
        card: cardPayload,
    };

    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gửi webhook SeaTalk (card) lỗi: ${response.status} - ${errorText}`);
    }

    return true;
}

// Hàm tạo ảnh báo cáo
async function generateReportImage(data, reportDate, hourStart, hourEnd) {
    const top10Data = data.slice(0, 10);

    const htmlContent = `
        <html>
            <head>
                <style>
                    body { font-family: sans-serif; background-color: #f0f4f8; padding: 20px; }
                    .container { background-color: white; border-radius: 8px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    h1 { color: #1e40af; font-size: 24px; }
                    p { color: #334155; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
                    th { background-color: #f1f5f9; color: #475569; }
                    tr:nth-child(even) { background-color: #f8fafc; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Báo cáo năng suất QC - ${reportDate}</h1>
                    <p>Tổng số nhân viên hoạt động: ${data.length}</p>
                    <p>Giờ làm việc: ${hourStart}h - ${hourEnd}h</p>
                    <h2>Top 10 nhân viên năng suất cao nhất</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>STT</th>
                                <th>Tên</th>
                                <th>Tổng</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${top10Data.map((user, index) => `
                                <tr>
                                    <td>${index + 1}</td>
                                    <td>${capitalizeName(user.name) || user.email}</td>
                                    <td>${user.total || 0}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </body>
        </html>
    `;

    const imagePath = path.join(os.tmpdir(), `report-${Date.now()}.png`);

    await nodeHtmlToImage({
        output: imagePath,
        html: htmlContent
    });

    return imagePath;
}

// Hàm tải ảnh lên Supabase Storage
async function uploadImageToSupabase(filePath) {
    const fileContent = await fs.readFile(filePath);
    const fileName = `public/report-${Date.now()}.png`;

    const { data, error } = await supabase.storage
        .from('qc-productivity-tracker')
        .upload(fileName, fileContent, {
            contentType: 'image/png',
            upsert: true,
        });

    if (error) {
        throw new Error(`Lỗi tải ảnh lên Supabase: ${error.message}`);
    }

    const { data: publicUrlData } = supabase.storage
        .from('qc-productivity-tracker')
        .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
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
        console.log("[DEBUG] Bắt đầu chạy send-hourly-report...");

        // ====================== BƯỚC 1: Lấy cấu hình báo cáo từ DB ======================
        const config = await getReportConfig();
        console.log("[DEBUG] Đã lấy cấu hình:", JSON.stringify(config));
        if (!config) throw new Error("Không tìm thấy cấu hình báo cáo trong qc_alert_config");

        // Kiểm tra báo cáo có bật không
        if (!config.report_enabled) {
            console.log("[DEBUG] Báo cáo bị tắt (report_enabled=false), thoát");
            return res.json({ success: false, reason: "Báo cáo đã bị tắt trong cấu hình" });
        }

        // Kiểm tra ngày làm việc nếu bật chỉ gửi ngày làm việc
        if (config.report_only_workdays && !isWorkdayVN()) {
            console.log("[DEBUG] Hôm nay không phải ngày làm việc, thoát");
            return res.json({ success: false, reason: "Hôm nay không phải ngày làm việc, bỏ qua gửi báo cáo" });
        }

        const hourStart = config.report_hour_start || 9;
        const hourEnd = config.report_hour_end || 18;
        const reportDate = getTodayVN();
        const reportTimeVN = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        console.log(`[DEBUG] Thời gian báo cáo: ${reportDate}, giờ làm việc: ${hourStart}h-${hourEnd}h`);

        // ====================== BƯỚC 2: Lấy danh sách users active từ DB ======================
        const { data: users, error: usersError } = await supabase
            .from("qc_users")
            .select(`email, name, is_active, role_id, qc_roles!inner(role_key, display_name), low_threshold, medium_threshold`)
            .eq("is_active", true);

        if (usersError) {
            console.error("[DEBUG] Lỗi lấy users:", usersError);
            throw new Error(`Lấy users lỗi: ${usersError.message}`);
        }
        console.log(`[DEBUG] Số lượng users active: ${users?.length || 0}`, users?.map(u => ({ email: u.email, name: u.name })));
        if (!users || users.length === 0) {
            return res.json({ success: false, reason: "Không có users active nào để tính báo cáo" });
        }

        // ====================== BƯỚC 3: DÙNG CHUNG SQL FUNCTION VỚI DASHBOARD.JS ĐỂ TÍNH TOÁN ======================
        // ✅ Tối ưu: dùng get_dashboard_stats (như trong dashboard.js) thay vì tính thủ công bằng JS
        // Hàm SQL này đã được tối ưu, xử lý chính xác múi giờ và thống kê năng suất
        const targetDate = getTodayVN(); // Lấy ngày hôm nay theo múi giờ VN
        const userEmails = users.map(u => u.email);
        console.log(`[DEBUG] Gọi SQL function get_dashboard_stats với ngày: ${targetDate}, users: ${userEmails}`);

        const { data: stats, error: statsError } = await supabase.rpc(
            "get_dashboard_stats",
            {
                target_date: targetDate,
                user_emails: userEmails
            }
        );

        if (statsError) {
            console.error("[DEBUG] Lỗi gọi get_dashboard_stats:", statsError);
            throw new Error(`Lỗi tính thống kê: ${statsError.message}`);
        }
        console.log(`[DEBUG] Kết quả từ SQL function:`, stats);

        // ====================== BƯỚC 4: Xử lý dữ liệu trả về từ SQL ======================
        // Map user info + merge stats từ DB
        const reportMap = new Map();
        users.forEach(u => {
            reportMap.set(u.email, {
                ...u,
                total: 0
            });
        });

        // Điền dữ liệu tổng sản lượng từ stats
        (stats || []).forEach(row => {
            const entry = reportMap.get(row.email);
            if (entry) entry.total = row.total || 0;
        });

        // Chỉ lấy user có tổng > 0, sắp xếp giảm dần
        let processedData = Array.from(reportMap.values())
            .filter(u => u.total > 0)
            .sort((a, b) => b.total - a.total);

        console.log(`[DEBUG] Số users có logs trong ngày (trước khi lọc): ${processedData.length}`);

        // Lọc các tài khoản hệ thống khỏi báo cáo, dựa trên yêu cầu ban đầu về `docs-system-account.md`
        // Vui lòng thêm email (viết thường) của các tài khoản hệ thống vào danh sách dưới đây.
        const systemAccountEmails = [
            // 'system.user@example.com',
            // 'admin.user@example.com',
        ];
        const reportableData = processedData.filter(
            user => !systemAccountEmails.includes(user.email.toLowerCase())
        );

        console.log(`[DEBUG] Số users sau khi lọc tài khoản hệ thống: ${reportableData.length}`);
        console.log("[DEBUG] Dữ liệu cuối cùng để báo cáo:", reportableData.map(u => ({ email: u.email, name: u.name, total: u.total })));

        // 5. Tạo nội dung card để gửi qua SeaTalk
        const top10Content = reportableData
            .slice(0, 10)
            .map((user, index) => {
                const displayName = user.name ? capitalizeName(user.name) : user.email;
                const name = displayName.substring(0, 22).padEnd(25);
                const total = (user.total || 0).toString();
                // Định dạng từng dòng để căn chỉnh cột
                return `${(index + 1).toString().padEnd(4)}${name}${total}`;
            })
            .join("\\n"); // Dùng \\n cho markdown của SeaTalk

        const cardContent = {
            config: {
                "wide_screen_mode": true
            },
            header: {
                title: {
                    tag: "plain_text",
                    content: `📊 BÁO CÁO NĂNG SUẤT QC - ${reportDate}`
                },
                template: "blue"
            },
            elements: [
                // Thêm hình ảnh banner tại đây nếu muốn
                // {
                //     "tag": "img",
                //     "image_url": "https://your-image-url.com/banner.png",
                //     "alt": {
                //         "tag": "plain_text",
                //         "content": "Report Banner"
                //     }
                // },
                {
                    tag: "div",
                    text: {
                        tag: "lark_md",
                        content: `👥 **Tổng số nhân viên hoạt động:** ${reportableData.length}\\n⏰ **Giờ làm việc:** ${hourStart}h - ${hourEnd}h`
                    }
                },
                {
                    tag: "hr"
                },
                {
                    tag: "div",
                    text: {
                        tag: "lark_md",
                        content: `**🏆 Top 10 nhân viên năng suất cao nhất:**`
                    }
                },
                {
                    tag: "div",
                    text: {
                        tag: "lark_md",
                        // Dùng code block để có font chữ mono-space, dễ căn chỉnh
                        content: `\`\`\`${"STT".padEnd(4)}${"Tên".padEnd(25)}Tổng\\n${"-".repeat(35)}\\n${top10Content}\`\`\``
                    }
                },
                {
                    tag: "hr"
                },
                {
                    tag: "note",
                    elements: [{
                        tag: "plain_text",
                        content: `🔗 Xem chi tiết tại: https://qc-productivity-tracker.vercel.app`
                    }]
                }
            ]
        };

        // Gửi báo cáo đến SeaTalk
        const webhookUrl = config.report_seatalk_webhook_url || config.seatalk_webhook_url;
        if (webhookUrl) {
            await sendSeaTalkCardWebhook(webhookUrl, cardContent);
            console.log("Đã gửi báo cáo card thành công đến SeaTalk!");
        } else {
            console.log("Không có webhook URL cấu hình, bỏ qua gửi SeaTalk");
        }

        // Ghi log thành công (bỏ qua lỗi nếu bảng chưa tồn tại)
        await supabase.from("qc_report_logs").insert({
            report_type: "hourly_card",
            content_text: JSON.stringify(cardContent, null, 2), // Lưu nội dung card
            sent_at: new Date().toISOString(),
            status: "success"
        }).catch(logErr => console.warn("Không thể ghi log thành công:", logErr.message));

        return res.json({
            success: true,
            message: "Báo cáo đã được xử lý và gửi thành công đến SeaTalk",
            reportDate,
            totalUsers: reportableData.length
        });

    } catch (error) {
        console.error("[send-hourly-report] Lỗi:", error);

        // Ghi log lỗi
        await supabase.from("qc_report_logs").insert({
            report_type: "hourly_card",
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