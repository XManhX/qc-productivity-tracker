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

// Hàm processLogsToStats đã bị loại bỏ vì không còn sử dụng (tối ưu dùng get_dashboard_stats SQL function)

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

// Hàm tạo ảnh báo cáo - Tạo ảnh chứa toàn bộ bảng dữ liệu giống như exportToImage
async function generateReportImage(data, reportDate, hourStart, hourEnd) {
    // Sắp xếp dữ liệu giảm dần theo tổng sản lượng (như trên dashboard)
    const sortedData = [...data].sort((a, b) => b.total - a.total);

    const htmlContent = `
        <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                        background-color: #f8fafc; 
                        padding: 30px; 
                    }
                    .container { 
                        background-color: white; 
                        border-radius: 12px; 
                        padding: 30px; 
                        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); 
                        max-width: 900px;
                        margin: 0 auto;
                    }
                    h1 { 
                        color: #1e40af; 
                        font-size: 28px; 
                        margin-top: 0;
                    }
                    .subtitle {
                        color: #64748b;
                        font-size: 16px;
                        margin-bottom: 30px;
                    }
                    .stats {
                        display: flex;
                        gap: 30px;
                        margin-bottom: 30px;
                        flex-wrap: wrap;
                    }
                    .stat-item {
                        background-color: #f1f5f9;
                        padding: 15px 25px;
                        border-radius: 8px;
                    }
                    .stat-label {
                        color: #64748b;
                        font-size: 14px;
                    }
                    .stat-value {
                        color: #0f172a;
                        font-size: 24px;
                        font-weight: bold;
                    }
                    table { 
                        width: 100%; 
                        border-collapse: collapse; 
                        margin-top: 20px;
                    }
                    th, td { 
                        padding: 14px; 
                        text-align: left; 
                        border-bottom: 1px solid #e2e8f0; 
                    }
                    th { 
                        background-color: #f1f5f9; 
                        color: #334155;
                        font-weight: 600;
                    }
                    tr:hover {
                        background-color: #f8fafc;
                    }
                    .user-info {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                    }
                    .user-avatar {
                        width: 36px;
                        height: 36px;
                        border-radius: 50%;
                        background-color: #e2e8f0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 12px;
                        font-weight: bold;
                        color: #475569;
                    }
                    .total-green {
                        background-color: #dcfce7;
                        color: #166534;
                        font-weight: bold;
                        text-align: center;
                    }
                    .total-yellow {
                        background-color: #fef9c3;
                        color: #854d0e;
                        font-weight: bold;
                        text-align: center;
                    }
                    .total-red {
                        background-color: #fee2e2;
                        color: #991b1b;
                        font-weight: bold;
                        text-align: center;
                        text-align: center;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>📊 Báo cáo năng suất QC - ${reportDate}</h1>
                    <p class="subtitle">Thống kê sản lượng làm việc của toàn bộ nhân viên</p>
                    <div class="stats">
                        <div class="stat-item">
                            <div class="stat-label">Tổng nhân viên</div>
                            <div class="stat-value">${sortedData.length}</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-label">Giờ làm việc</div>
                            <div class="stat-value">${hourStart}h - ${hourEnd}h</div>
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>STT</th>
                                <th>Nhân viên</th>
                                <th>Role</th>
                                <th>Tổng sản lượng</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedData.map((user, index) => {
        // Tính toán màu sắc dựa trên ngưỡng (giống như trong HeatmapTable)
        const workingHours = hourEnd - hourStart + 1;
        const lowTotal = (user.low_threshold || 10) * workingHours;
        const highTotal = (user.medium_threshold || 16) * workingHours;
        const total = user.total || 0;
        let cellClass = '';
        if (total >= highTotal) cellClass = 'total-green';
        else if (total >= lowTotal) cellClass = 'total-yellow';
        else cellClass = 'total-red';

        return `
                            <tr>
                                <td>${index + 1}</td>
                                <td>
                                    <div class="user-info">
                                        <div class="user-avatar">
                                            ${(user.name || user.email).substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <div style="font-weight: 600; color: #1e293b;">${capitalizeName(user.name) || user.email}</div>
                                            <div style="font-size: 12px; color: #64748b;">${user.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td>${user.display_name || user.role_key || '-'}</td>
                                <td class="${cellClass}">${total}</td>
                            </tr>
                                `;
    }).join('')}
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

// Hàm chuyển file ảnh thành Base64 string để nhúng trực tiếp vào SeaTalk card
async function convertImageToBase64(filePath) {
    const fileBuffer = await fs.readFile(filePath);
    const base64 = fileBuffer.toString('base64');
    return `data:image/png;base64,${base64}`;
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

        // ====================== BƯỚC 5: Tạo ảnh báo cáo và tải lên Supabase ======================
        let reportImageUrl = null;
        let tempImagePath = null;

        if (reportableData.length > 0) {
            try {
                // Tạo file ảnh từ HTML
                tempImagePath = await generateReportImage(reportableData, reportDate, hourStart, hourEnd);
                console.log(`[DEBUG] Đã tạo file ảnh tạm tại: ${tempImagePath}`);

                // Tải ảnh lên Supabase Storage
                reportImageUrl = await uploadImageToSupabase(tempImagePath);
                console.log(`[DEBUG] Ảnh báo cáo đã được tải lên: ${reportImageUrl}`);

                // Xóa file ảnh tạm trên máy
                await fs.unlink(tempImagePath);
                console.log("[DEBUG] Đã xóa file ảnh tạm");
            } catch (imageError) {
                console.error("[DEBUG] Lỗi khi xử lý ảnh báo cáo:", imageError);
            }
        }

        // ====================== BƯỚC 6: Tạo nội dung card để gửi qua SeaTalk ======================
        // Luôn thêm ảnh báo cáo chi tiết vào tin nhắn (yêu cầu: chỉ gửi ảnh toàn bộ dữ liệu)
        const cardElements = [
            {
                tag: "div",
                text: {
                    tag: "lark_md",
                    content: `👥 **Tổng số nhân viên hoạt động:** ${reportableData.length}\\n⏰ **Giờ làm việc:** ${hourStart}h - ${hourEnd}h`
                }
            }
        ];

        // Thêm ảnh báo cáo chi tiết vào card
        if (reportImageUrl) {
            cardElements.push({
                tag: "img",
                image_url: reportImageUrl,
                alt: {
                    tag: "plain_text",
                    content: "Bảng báo cáo năng suất chi tiết toàn bộ nhân viên"
                }
            });
        } else {
            // Trường hợp xui rủi không thể tạo ảnh, ghi chú vào tin nhắn
            cardElements.push({
                tag: "div",
                text: {
                    tag: "lark_md",
                    content: `⚠️ **Lưu ý:** Không thể tạo ảnh báo cáo chi tiết trong lần chạy này, vui lòng kiểm tra dashboard để xem thông tin đầy đủ.`
                }
            });
        }

        // Thêm footer và link xem chi tiết
        cardElements.push(
            { tag: "hr" },
            {
                tag: "note",
                elements: [{
                    tag: "plain_text",
                    content: `🔗 Xem chi tiết tại: https://qc-productivity-tracker.vercel.app`
                }]
            }
        );

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
            elements: cardElements
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