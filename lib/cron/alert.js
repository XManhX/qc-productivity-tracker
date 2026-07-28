// lib/cron/alert.js
import { createClient } from '@supabase/supabase-js';
import {
    getTodayVN,
    getWorkTimestamps,
    getBreakTimestamps,
    calcIdleMinutes,
    getAlertConfig,
    buildFriendlyMessage,
} from './helpers.js';

// Dùng service role key để cập nhật idle_alert_sent_at
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Handler cho job alert (cảnh báo idle)
 * Được gọi từ /api/cron/alert
 */
export default async function handler(req, res) {
    try {
        const now = Date.now();
        const config = await getAlertConfig(supabase);
        const { workStartMs, workEndMs } = getWorkTimestamps(now, config);
        const { breakStartMs, breakEndMs } = getBreakTimestamps(now, config);

        // Ngoài giờ làm việc hoặc đang nghỉ trưa -> không cảnh báo
        if (now < workStartMs || now >= workEndMs) {
            return res.status(200).json({ message: 'Ngoài giờ làm việc, tạm dừng cảnh báo.' });
        }
        if (now >= breakStartMs && now < breakEndMs) {
            return res.status(200).json({ message: 'Đang trong giờ nghỉ trưa, tạm dừng cảnh báo.' });
        }

        const todayVN = getTodayVN();
        const sinceISO = new Date(`${todayVN}T00:00:00+07:00`).toISOString();
        const cooldownMinutes = config.cooldown_minutes || 0;
        const alertCooldown = now - cooldownMinutes * 60 * 1000;

        // Lấy danh sách user active
        const { data: activeUsers, error: userError } = await supabase
            .from('qc_users')
            .select('email, name, idle_alert_sent_at')
            .eq('is_active', true);

        if (userError) throw userError;
        if (!activeUsers?.length) {
            return res.status(200).json({ message: 'No active users' });
        }

        // --- LOẠI TRỪ DANH SÁCH NGOẠI LỆ ---
        const excludedEmails = config.excluded_emails || [];
        const filteredUsers = activeUsers.filter(
            user => !excludedEmails.includes(user.email)
        );

        if (!filteredUsers.length) {
            return res.status(200).json({ message: 'No active users after exclusion' });
        }

        // Lấy log cuối cùng của hôm nay (dùng cách đơn giản, khi lượng log lớn có thể
        // thay bằng RPC/aggregate để giảm dữ liệu truyền về)
        const { data: logs } = await supabase
            .from('qc_logs')
            .select('operator, created_at')
            .gte('created_at', sinceISO)
            .order('created_at', { ascending: false });

        const lastLogMap = new Map();
        (logs || []).forEach(log => {
            if (!lastLogMap.has(log.operator)) {
                lastLogMap.set(log.operator, new Date(log.created_at).getTime());
            }
        });

        // Danh sách user đã có log hôm nay (để kiểm tra “không còn ai làm”)
        const usersWithLogs = filteredUsers.filter(u => lastLogMap.has(u.email));

        // Nếu không ai có log hôm nay thì không có ai làm việc -> bỏ qua
        if (usersWithLogs.length === 0) {
            return res.status(200).json({ message: 'No user has logged today, skip alert.' });
        }

        // Tính idle cho từng user đã có log
        const idleUsers = [];
        for (const user of usersWithLogs) {
            const lastLogMs = lastLogMap.get(user.email);

            const idleMinutes = calcIdleMinutes(
                lastLogMs,
                now,
                workStartMs,
                workEndMs,
                breakStartMs,
                breakEndMs
            );
            if (idleMinutes < config.idle_threshold_minutes) continue;

            // Xử lý cooldown: nếu đã có log mới sau cảnh báo trước thì reset trạng thái
            let lastAlertSent = user.idle_alert_sent_at || 0;
            if (lastAlertSent > 0 && lastLogMs > lastAlertSent) {
                lastAlertSent = 0;
            }

            // Dùng chính thời điểm log cuối làm “bắt đầu rảnh” (đã trừ break qua calcIdleMinutes)
            const idleStartTime = new Date(lastLogMs).toLocaleTimeString('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
            });

            idleUsers.push({
                email: user.email,
                name: user.name,
                idle: idleMinutes,
                idleStartTime,
                lastAlertSent,
            });
        }

        // QUAN TRỌNG: Nếu toàn bộ người đã log hôm nay đều idle → không còn ai làm → ngừng cảnh báo
        if (idleUsers.length > 0 && idleUsers.length === usersWithLogs.length) {
            return res.status(200).json({
                message: 'Tất cả nhân viên đã đăng nhập hôm nay đều đang rảnh, tạm ngừng cảnh báo.',
                totalIdle: idleUsers.length,
            });
        }

        if (idleUsers.length === 0) {
            return res.status(200).json({ message: 'No idle users to alert' });
        }

        // Lọc những user chưa trong cooldown
        const eligibleUsers = idleUsers.filter(u => u.lastAlertSent <= alertCooldown);
        if (!eligibleUsers.length) {
            return res.status(200).json({ message: 'All idle users are in cooldown or recently reset' });
        }

        eligibleUsers.sort((a, b) => b.idle - a.idle);
        const displayUsers = eligibleUsers.slice(0, config.max_users_per_message);
        const message = buildFriendlyMessage(displayUsers, eligibleUsers, config);

        // Gửi webhook Seatalk
        let sent = false;
        const webhookUrl = config.seatalk_webhook_url;
        if (webhookUrl && !webhookUrl.includes('xxx')) {
            const webhookRes = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tag: 'text',
                    text: { format: 1, content: message },
                }),
            });
            sent = webhookRes.ok;
            if (!sent) console.error('Seatalk webhook failed:', await webhookRes.text());
        } else {
            console.warn('Webhook not configured, would send:', message);
            sent = true; // coi như đã gửi nếu không có webhook (môi trường test)
        }

        // Cập nhật thời gian gửi cảnh báo cho những user đã hiển thị
        if (sent && displayUsers.length > 0) {
            await supabase
                .from('qc_users')
                .update({ idle_alert_sent_at: new Date(now).toISOString() })
                .in('email', displayUsers.map(u => u.email));
        }

        return res.status(200).json({
            sent,
            totalIdle: idleUsers.length,
            eligible: eligibleUsers.length,
            displayed: displayUsers.length,
        });
    } catch (err) {
        console.error('send-idle-alert error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}