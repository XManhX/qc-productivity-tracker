import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);

const SEATALK_WEBHOOK_URL = process.env.SEATALK_ALERT_WEBHOOK_URL;
const CRON_SECRET = process.env.CRON_SECRET;

const IDLE_THRESHOLD_MINUTES = 10; // idle > 10 phút mới cảnh báo
const REMINDER_COOLDOWN_MINUTES = 30; // không gửi lại cho cùng user trong 30 phút
const MAX_USERS_PER_MESSAGE = 50;
const ACTIVE_WINDOW_HOURS = 2; // chỉ coi là đang trong ca nếu có log trong 2h qua

/**
 * Hàm lấy log mới nhất của tất cả user trong khoảng thời gian active window.
 * Trả về Map { email -> lastLogTime (ISO string) }
 */
async function getLastLogTimes(sinceISO) {
  const { data, error } = await supabase
    .from("qc_logs")
    .select("operator, created_at")
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const lastLogMap = new Map();
  (data || []).forEach((log) => {
    if (!lastLogMap.has(log.operator)) {
      lastLogMap.set(log.operator, log.created_at);
    }
  });
  return lastLogMap;
}

export default async function handler(req, res) {
  // Bảo vệ endpoint chỉ cho phép cron job gọi
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const now = Date.now();
    const idleDeadline = new Date(
      now - IDLE_THRESHOLD_MINUTES * 60 * 1000,
    ).toISOString();
    const activeSince = new Date(
      now - ACTIVE_WINDOW_HOURS * 60 * 60 * 1000,
    ).toISOString();
    const alertCooldown = now - REMINDER_COOLDOWN_MINUTES * 60 * 1000;

    // 1. Lấy danh sách user active cùng thời điểm cảnh báo cuối
    const { data: activeUsers, error: userError } = await supabase
      .from("qc_users")
      .select("email, idle_alert_sent_at")
      .eq("is_active", true);

    if (userError) throw userError;
    if (!activeUsers || activeUsers.length === 0) {
      return res.status(200).json({ message: "No active users" });
    }

    // 2. Lấy log gần đây nhất của từng operator
    const lastLogMap = await getLastLogTimes(activeSince);

    // 3. Xác định user idle
    const idleUsers = [];
    for (const user of activeUsers) {
      const email = user.email;
      const lastLogTime = lastLogMap.get(email);

      // Bỏ qua nếu không có bất kỳ log nào trong active window (coi như chưa bắt đầu ca)
      if (!lastLogTime) continue;

      const lastLogMs = new Date(lastLogTime).getTime();
      const idleMinutes = Math.floor((now - lastLogMs) / 60000);

      // Chỉ quan tâm nếu idle > ngưỡng
      if (idleMinutes < IDLE_THRESHOLD_MINUTES) continue;

      // Kiểm tra cooldown: đã gửi cảnh báo trong 30 phút qua chưa?
      const lastAlertSent = user.idle_alert_sent_at || 0;
      if (lastAlertSent > alertCooldown) continue;

      idleUsers.push({
        email,
        idle: idleMinutes,
        lastActivityTime: new Date(lastLogMs).toLocaleTimeString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
        }),
      });
    }

    if (idleUsers.length === 0) {
      return res.status(200).json({ message: "No idle users to alert" });
    }

    // 4. Sắp xếp theo thời gian idle giảm dần, giới hạn số lượng hiển thị
    idleUsers.sort((a, b) => b.idle - a.idle);
    const displayUsers = idleUsers.slice(0, MAX_USERS_PER_MESSAGE);

    // 5. Tạo nội dung tin nhắn
    const nowStr = new Date().toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
    });
    let message = `⚠️ **Danh sách QC idle > ${IDLE_THRESHOLD_MINUTES} phút** (${nowStr})\n\n`;
    displayUsers.forEach((u, i) => {
      message += `${i + 1}. **${u.email}** - idle ${u.idle} phút (hoạt động cuối: ${u.lastActivityTime})\n`;
    });
    if (idleUsers.length > MAX_USERS_PER_MESSAGE) {
      message += `... và ${idleUsers.length - MAX_USERS_PER_MESSAGE} người khác.`;
    }
    message += `\nTổng: **${idleUsers.length}** người.`;

    // 6. Gửi webhook Seatalk
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
      sent = webhookRes.ok;
      if (!sent) {
        console.error("Seatalk webhook failed:", await webhookRes.text());
      }
    } else {
      console.warn(
        "SEATALK_ALERT_WEBHOOK_URL not configured, would send:",
        message,
      );
      sent = true; // mô phỏng gửi thành công để cập nhật trạng thái cooldown
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

    return res.status(200).json({ sent, idleCount: idleUsers.length });
  } catch (err) {
    console.error("send-idle-alert error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
