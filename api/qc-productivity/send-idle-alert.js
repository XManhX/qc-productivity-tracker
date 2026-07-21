import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);
const SEATALK_WEBHOOK_URL = process.env.SEATALK_ALERT_WEBHOOK_URL;
const CRON_SECRET = process.env.CRON_SECRET;

const IDLE_THRESHOLD_MINUTES = 10; // idle > 10 phút mới cảnh báo
const REMINDER_COOLDOWN_MINUTES = 30; // 30 phút không spam lại cùng một user
const MAX_USERS_PER_MESSAGE = 50;

export default async function handler(req, res) {
  // Bảo vệ: chỉ cho phép cron gọi với secret
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const now = Date.now();
    const idleCutoff = now - IDLE_THRESHOLD_MINUTES * 60 * 1000;
    const alertCooldown = now - REMINDER_COOLDOWN_MINUTES * 60 * 1000;

    // 1. Lấy danh sách user active (dùng qc_users để lọc)
    const { data: activeUsers, error: userError } = await supabase
      .from("qc_users")
      .select("email, idle_alert_sent_at")
      .eq("is_active", true);

    if (userError) throw userError;
    if (!activeUsers || activeUsers.length === 0) {
      return res.status(200).json({ message: "No active users" });
    }

    const emails = activeUsers.map((u) => u.email);
    const alertSentMap = {};
    activeUsers.forEach((u) => {
      alertSentMap[u.email] = u.idle_alert_sent_at || 0;
    });

    // 2. Lấy trạng thái idle của những user này từ bảng qc_user_idle_status
    const { data: idleStatuses, error: statusError } = await supabase
      .from("qc_user_idle_status")
      .select("email, current_qc, last_activity_ts, idle_minutes")
      .in("email", emails);

    if (statusError) throw statusError;

    // 3. Lọc những user thoả mãn: idle > ngưỡng VÀ chưa bị cảnh báo trong cooldown
    const idleUsers = [];
    const statusMap = {};
    (idleStatuses || []).forEach((s) => {
      statusMap[s.email] = s;
    });

    for (const email of emails) {
      const status = statusMap[email];
      if (!status) continue; // chưa có báo cáo nào -> không cảnh báo

      const idleMs = now - status.last_activity_ts;
      const idleMinutes = Math.floor(idleMs / 60000);
      if (idleMinutes < IDLE_THRESHOLD_MINUTES) continue;

      const lastAlertSent = alertSentMap[email] || 0;
      if (lastAlertSent > alertCooldown) continue; // đã cảnh báo gần đây

      idleUsers.push({
        email,
        idle: idleMinutes,
        qc: status.current_qc || "?",
        lastActivityTime: new Date(status.last_activity_ts).toLocaleTimeString(
          "vi-VN",
          {
            timeZone: "Asia/Ho_Chi_Minh",
          },
        ),
      });
    }

    if (idleUsers.length === 0) {
      return res.status(200).json({ message: "No idle users to alert" });
    }

    // 4. Sắp xếp, giới hạn số lượng hiển thị
    idleUsers.sort((a, b) => b.idle - a.idle);
    const displayUsers = idleUsers.slice(0, MAX_USERS_PER_MESSAGE);

    // 5. Tạo nội dung tin nhắn
    let message = `⚠️ **Danh sách QC idle > ${IDLE_THRESHOLD_MINUTES} phút** (${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })})\n\n`;
    displayUsers.forEach((u, i) => {
      message += `${i + 1}. **${u.email}** - idle ${u.idle} phút (QC: ${u.qc}, lúc ${u.lastActivityTime})\n`;
    });
    if (idleUsers.length > MAX_USERS_PER_MESSAGE) {
      message += `... và ${idleUsers.length - MAX_USERS_PER_MESSAGE} người khác.`;
    }
    message += `\nTổng: **${idleUsers.length}** người.`;

    // 6. Gửi Seatalk
    let sent = false;
    if (SEATALK_WEBHOOK_URL && !SEATALK_WEBHOOK_URL.includes("xxx")) {
      const webhookRes = await fetch(SEATALK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tag: "text",
          text: { format: 1, content: message },
        }),
      });
      if (webhookRes.ok) {
        sent = true;
        console.log(`Sent idle alert for ${idleUsers.length} users`);
      } else {
        console.error("Seatalk webhook failed:", await webhookRes.text());
      }
    } else {
      console.warn(
        "SEATALK_ALERT_WEBHOOK_URL not configured, would send:",
        message,
      );
      sent = true; // mô phỏng gửi thành công để cập nhật alert_sent_at
    }

    // 7. Cập nhật idle_alert_sent_at cho những user đã được gửi cảnh báo
    if (sent && idleUsers.length > 0) {
      const emailsToUpdate = idleUsers.map((u) => u.email);
      const { error: updateError } = await supabase
        .from("qc_users")
        .update({ idle_alert_sent_at: now })
        .in("email", emailsToUpdate);

      if (updateError) {
        console.error("Failed to update idle_alert_sent_at:", updateError);
      }
    }

    res.status(200).json({ sent, idleCount: idleUsers.length });
  } catch (err) {
    console.error("send-idle-alert error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
