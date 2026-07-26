// api/qc-productivity/send-hourly-report.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
);

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

async function sendSeaTalkTextMessage(webhookUrl, markdownContent) {
    if (!webhookUrl) throw new Error("Thiếu SeaTalk webhook URL");

    const payload = {
        tag: "text",
        text: {
            format: 1,
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
        throw new Error(`Gửi webhook thất bại: ${response.status} - ${errorText}`);
    }

    return true;
}

export default async function handler(req, res) {
    if (req.method === "OPTIONS") return res.status(200).end();

    try {
        console.log("[DEBUG] Bắt đầu send-hourly-report...");

        // 1. Lấy cấu hình
        const config = await getReportConfig();
        if (!config) throw new Error("Không tìm thấy cấu hình báo cáo");
        if (!config.report_enabled) {
            console.log("[DEBUG] Báo cáo bị tắt");
            return res.json({ success: false, reason: "Báo cáo đã bị tắt" });
        }

        const hourStart = config.report_hour_start || 9;
        const hourEnd = config.report_hour_end || 18;
        const reportDate = getTodayVN();

        // 2. Lấy danh sách user active
        const { data: users, error: usersError } = await supabase
            .from("qc_users")
            .select(`email, name, is_active, role_id, qc_roles!inner(role_key, display_name), low_threshold, medium_threshold`)
            .eq("is_active", true);

        if (usersError) throw new Error(`Lấy users lỗi: ${usersError.message}`);
        if (!users || users.length === 0) {
            return res.json({ success: false, reason: "Không có user active" });
        }

        // 3. Gọi SQL function tính năng suất
        const userEmails = users.map(u => u.email);
        const { data: stats, error: statsError } = await supabase.rpc(
            "get_dashboard_stats",
            { target_date: reportDate, user_emails: userEmails }
        );

        if (statsError) throw new Error(`Lỗi thống kê: ${statsError.message}`);

        // 4. Tổng hợp dữ liệu
        const reportMap = new Map();
        users.forEach(u => reportMap.set(u.email, { ...u, total: 0 }));
        (stats || []).forEach(row => {
            const entry = reportMap.get(row.email);
            if (entry) entry.total = row.total || 0;
        });

        let processedData = Array.from(reportMap.values())
            .filter(u => u.total > 0)
            .sort((a, b) => b.total - a.total);

        const systemAccountEmails = []; // Thêm email cần ẩn nếu có
        const reportableData = processedData.filter(
            user => !systemAccountEmails.includes(user.email.toLowerCase())
        );

        // 5. Tạo nội dung markdown
        let markdown = `📊 **BÁO CÁO NĂNG SUẤT QC - ${reportDate}**\n\n`;
        markdown += `👥 **Tổng số nhân viên có dữ liệu:** ${reportableData.length}\n`;
        markdown += `⏰ **Giờ làm việc:** ${hourStart}h - ${hourEnd}h\n\n`;

        if (reportableData.length > 0) {
            markdown += `| STT | Nhân viên | Role | Tổng SL |\n|---|---|---|---|\n`;
            reportableData.forEach((user, index) => {
                const displayName = capitalizeName(user.name) || user.email;
                const role = user.display_name || user.role_key || '-';
                markdown += `| ${index + 1} | ${displayName} | ${role} | ${user.total} |\n`;
            });
        } else {
            markdown += `⚠️ Không có dữ liệu năng suất trong khung giờ này.`;
        }

        if (markdown.length > 4096) {
            markdown = markdown.substring(0, 4000) + "\n\n... (đã cắt bớt)";
        }

        // 6. Gửi webhook
        const webhookUrl = config.report_seatalk_webhook_url || config.seatalk_webhook_url;
        if (webhookUrl) {
            await sendSeaTalkTextMessage(webhookUrl, markdown);
            console.log("Đã gửi báo cáo text message thành công");
        } else {
            console.log("Không có webhook URL, bỏ qua gửi");
        }

        // 7. Ghi log thành công (không ảnh hưởng tới response)
        await supabase.from("qc_report_logs").insert({
            report_type: "hourly_text",
            content_text: markdown,
            sent_at: new Date().toISOString(),
            status: "success"
        }).catch(err => console.warn("Ghi log thất bại:", err.message));

        return res.json({
            success: true,
            message: "Báo cáo đã được gửi thành công qua text message.",
            reportDate,
            totalUsers: reportableData.length
        });

    } catch (error) {
        console.error("[send-hourly-report] Lỗi:", error);

        // Ghi log lỗi an toàn
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