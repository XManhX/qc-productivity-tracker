import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") return res.status(200).end();

    // GET: đọc cấu hình (dùng anon key, có RLS cho phép)
    if (req.method === "GET") {
        try {
            const { data, error } = await supabase
                .from("qc_alert_config")
                .select("*")
                .eq("id", 1)
                .single();
            if (error) throw error;
            return res.status(200).json(data);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // PUT: cập nhật cấu hình (chỉ admin, dùng service role key)
    if (req.method === "PUT") {
        // Kiểm tra quyền admin: có thể kiểm tra Authorization header với secret đặc biệt
        const authHeader = req.headers.authorization;
        if (authHeader !== `Bearer ${process.env.ADMIN_API_SECRET}`) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const body = req.body || {};
        try {
            const { error } = await supabaseAdmin
                .from("qc_alert_config")
                .update({
                    work_start_hour: body.work_start_hour,
                    work_start_min: body.work_start_min,
                    work_end_hour: body.work_end_hour,
                    work_end_min: body.work_end_min,
                    work_start_buffer_minutes: body.work_start_buffer_minutes,
                    work_end_buffer_minutes: body.work_end_buffer_minutes,
                    break_start_hour: body.break_start_hour,
                    break_start_min: body.break_start_min,
                    break_end_hour: body.break_end_hour,
                    break_end_min: body.break_end_min,
                    idle_threshold_minutes: body.idle_threshold_minutes,
                    cooldown_minutes: body.cooldown_minutes,
                    max_users_per_message: body.max_users_per_message,
                    seatalk_webhook_url: body.seatalk_webhook_url || null,
                    report_seatalk_webhook_url: body.report_seatalk_webhook_url || null,
                    report_enabled: body.report_enabled !== undefined ? body.report_enabled : true,
                    report_hour_start: body.report_hour_start || 9,
                    report_hour_end: body.report_hour_end || 18,
                    report_minute: body.report_minute || 10,
                    report_only_workdays: body.report_only_workdays !== undefined ? body.report_only_workdays : true,
                    excluded_emails: body.excluded_emails || null,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", 1);

            if (error) throw error;
            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: "Method not allowed" });
}