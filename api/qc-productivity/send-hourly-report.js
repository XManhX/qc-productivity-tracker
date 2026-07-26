import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
);

const CRON_SECRET = process.env.CRON_SECRET;
const VN_OFFSET = 7 * 3600 * 1000;

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

const capitalizeName = (name) => {
    if (!name) return name;
    return name
        .trim()
        .split(/\s+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
};

function getTodayVN() {
    const now = new Date(Date.now() + VN_OFFSET);
    return now.toISOString().split("T")[0];
}

// Gửi text message (Markdown) qua webhook System Account
async function sendSeaTalkTextMessage(webhookUrl, markdownContent) {
    if (!webhookUrl) throw new Error("Thiếu SeaTalk webhook URL trong cấu hình");

    const payload = {
        tag: "text",
        text: {
            format: 1, // Markdown
            content: markdownContent,
        },
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

    try {
        console.log("[DEBUG] Bắt đầu chạy send-hourly-report...");

        const config = await getReportConfig();
        if (!config) throw new Error("Không tìm thấy cấu hình báo cáo trong qc_alert_config");
        if (!config.report_enabled) {
            console.log("[DEBUG] Báo cáo bị tắt, thoát");
            return res.json({ success: false, reason: "Báo cáo đã bị tắt" });
        }

        const hourStart = config.report_hour_start || 9;
        const hourEnd = config.report_hour_end || 18;
        const reportDate = getTodayVN();

        // Lấy danh sách user active
        const { data: users, error: usersError } = await supabase
            .from("qc_users")
            .select(`email, name, is_active, role_id, qc_roles!inner(role_key, display_name), low_threshold, medium_threshold`)
            .eq("is_active", true);

        if (usersError) throw new Error(`Lấy users lỗi: ${usersError.message}`);
        if (!users || users.length === 0) {
            return res.json({ success: false, reason: "Không có users active" });
        }

        // Gọi SQL function tính năng suất
        const targetDate = getTodayVN();
        const userEmails = users.map(u => u.email);
        const { data: stats, error: statsError } = await supabase.rpc(
            "get_dashboard_stats",
            { target_date: targetDate, user_emails: userEmails }
        );
        if (statsError) throw new Error(`Lỗi tính thống kê: ${statsError.message}`);

        // Merge dữ liệu
        const reportMap = new Map();
        users.forEach(u => reportMap.set(u.email, { ...u, total: 0 }));
        (stats || []).forEach(row => {
            const entry = reportMap.get(row.email);
            if (entry) entry.total = row.total || 0;
        });

        let processedData = Array.from(reportMap.values())
            .filter(u => u.total > 0)
            .sort((a, b) => b.total - a.total);

        // Lọc tài khoản hệ thống (nếu có)
        const systemAccountEmails = []; // thêm email cần bỏ qua nếu muốn
        const reportableData = processedData.filter(
            user => !systemAccountEmails.includes(user.email.toLowerCase())
        );

        // ========== TẠO BẢNG MARKDOWN ==========
        let tableMarkdown = `📊 **BÁO CÁO NĂNG SUẤT QC - ${reportDate}**\n\n`;
        tableMarkdown += `👥 **Tổng số nhân viên có dữ liệu:** ${reportableData.length}\n`;
        tableMarkdown += `⏰ **Giờ làm việc:** ${hourStart}h - ${hourEnd}h\n\n`;

        if (reportableData.length > 0) {
            tableMarkdown += `| STT | Nhân viên | Role | Tổng SL |\n|---|---|---|---|\n`;
            reportableData.forEach((user, index) => {
                const displayName = capitalizeName(user.name) || user.email;
                const role = user.display_name || user.role_key || '-';
                const total = user.total;
                tableMarkdown += `| ${index + 1} | ${displayName} | ${role} | ${total} |\n`;
            });
        } else {
            tableMarkdown += `⚠️ Không có dữ liệu năng suất nào trong khung giờ này.`;
        }

        // Giới hạn 4096 ký tự (nếu dài quá thì cắt bớt, nhưng có thể để ý sau)
        if (tableMarkdown.length > 4096) {
            tableMarkdown = tableMarkdown.substring(0, 4000) + "\n\n... (đã cắt bớt do quá dài)";
        }

        // ========== GỬI WEBHOOK ==========
        const webhookUrl = config.report_seatalk_webhook_url || config.seatalk_webhook_url;
        if (webhookUrl) {
            await sendSeaTalkTextMessage(webhookUrl, tableMarkdown);
            console.log("Đã gửi báo cáo text message thành công!");
        } else {
            console.log("Không có webhook URL, bỏ qua gửi SeaTalk");
        }

        // Ghi log
        await supabase.from("qc_report_logs").insert({
            report_type: "hourly_text",
            content_text: tableMarkdown,
            sent_at: new Date().toISOString(),
            status: "success"
        }).catch(logErr => console.warn("Không thể ghi log:", logErr.message));

        return res.json({
            success: true,
            message: "Báo cáo đã được gửi thành công dưới dạng text message.",
            reportDate,
            totalUsers: reportableData.length
        });

    } catch (error) {
        console.error("[send-hourly-report] Lỗi:", error);

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