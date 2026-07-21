import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);

const SEATALK_WEBHOOK_URL = process.env.SEATALK_ALERT_WEBHOOK_URL;
const CRON_SECRET = process.env.CRON_SECRET;

const IDLE_THRESHOLD_MINUTES = 10;
const REMINDER_COOLDOWN_MINUTES = 30;
const MAX_USERS_PER_MESSAGE = 50;
const ACTIVE_WINDOW_HOURS = 2;

// Giờ nghỉ trưa cố định (theo giờ Việt Nam)
const BREAK_START_HOUR = 12;
const BREAK_START_MIN = 30;
const BREAK_END_HOUR = 13;
const BREAK_END_MIN = 30;

/**
 * Tính timestamp bắt đầu và kết thúc giờ nghỉ trưa trong ngày hiện tại (theo múi giờ VN)
 */
function getBreakTimestamps(nowMs) {
  const now = new Date(nowMs);
  // Chuyển sang giờ Việt Nam để lấy ngày chính xác
  const vnNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }),
  );
  const breakStart = new Date(vnNow);
  breakStart.setHours(BREAK_START_HOUR, BREAK_START_MIN, 0, 0);
  const breakEnd = new Date(vnNow);
  breakEnd.setHours(BREAK_END_HOUR, BREAK_END_MIN, 0, 0);
  return {
    breakStart: breakStart.getTime(),
    breakEnd: breakEnd.getTime(),
  };
}

/**
 * Tính idle thực tế (milliseconds) đã loại bỏ thời gian nghỉ trưa nếu có
 */
function calcEffectiveIdle(lastLogMs, nowMs, breakStart, breakEnd) {
  if (nowMs <= lastLogMs) return 0;

  // Nếu toàn bộ thời gian idle nằm trước giờ nghỉ
  if (nowMs <= breakStart) {
    return nowMs - lastLogMs;
  }
  // Nếu toàn bộ thời gian idle nằm sau giờ nghỉ
  if (lastLogMs >= breakEnd) {
    return nowMs - lastLogMs;
  }
  // Có giao với giờ nghỉ -> trừ đi khoảng giao
  const overlapStart = Math.max(lastLogMs, breakStart);
  const overlapEnd = Math.min(nowMs, breakEnd);
  const overlap = Math.max(0, overlapEnd - overlapStart);
  return nowMs - lastLogMs - overlap;
}

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
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const now = Date.now();
    const { breakStart, breakEnd } = getBreakTimestamps(now);

    // Trong giờ nghỉ trưa: không gửi bất kỳ cảnh báo nào
    if (now >= breakStart && now < breakEnd) {
      return res
        .status(200)
        .json({ message: "Đang trong giờ nghỉ trưa, tạm dừng cảnh báo." });
    }

    const activeSince = new Date(
      now - ACTIVE_WINDOW_HOURS * 60 * 60 * 1000,
    ).toISOString();
    const alertCooldown = now - REMINDER_COOLDOWN_MINUTES * 60 * 1000;

    // 1. Lấy user active
    const { data: activeUsers, error: userError } = await supabase
      .from("qc_users")
      .select("email, idle_alert_sent_at")
      .eq("is_active", true);

    if (userError) throw userError;
    if (!activeUsers || activeUsers.length === 0) {
      return res.status(200).json({ message: "No active users" });
    }

    // 2. Lấy log gần đây
    const lastLogMap = await getLastLogTimes(activeSince);

    // 3. Xác định idle users (đã trừ giờ nghỉ)
    const allIdleUsers = [];
    for (const user of activeUsers) {
      const email = user.email;
      const lastLogTime = lastLogMap.get(email);
      if (!lastLogTime) continue;

      const lastLogMs = new Date(lastLogTime).getTime();
      const effectiveIdleMs = calcEffectiveIdle(
        lastLogMs,
        now,
        breakStart,
        breakEnd,
      );
      const idleMinutes = Math.floor(effectiveIdleMs / 60000);

      if (idleMinutes < IDLE_THRESHOLD_MINUTES) continue;

      allIdleUsers.push({
        email,
        idle: idleMinutes,
        lastActivityTime: new Date(lastLogMs).toLocaleTimeString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
        }),
        lastAlertSent: user.idle_alert_sent_at || 0,
      });
    }

    if (allIdleUsers.length === 0) {
      return res.status(200).json({ message: "No idle users to alert" });
    }

    // 4. Lọc user không trong cooldown
    const eligibleUsers = allIdleUsers.filter(
      (u) => u.lastAlertSent <= alertCooldown,
    );
    if (eligibleUsers.length === 0) {
      return res
        .status(200)
        .json({ message: "All idle users are in cooldown" });
    }

    // 5. Sắp xếp, giới hạn hiển thị
    eligibleUsers.sort((a, b) => b.idle - a.idle);
    const displayUsers = eligibleUsers.slice(0, MAX_USERS_PER_MESSAGE);

    // 6. Tạo tin nhắn
    const nowStr = new Date().toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
    });
    let message = `⚠️ **Danh sách QC idle > ${IDLE_THRESHOLD_MINUTES} phút** (${nowStr})\n\n`;
    displayUsers.forEach((u, i) => {
      message += `${i + 1}. **${u.email}** - idle ${u.idle} phút (hoạt động cuối: ${u.lastActivityTime})\n`;
    });
    if (eligibleUsers.length > MAX_USERS_PER_MESSAGE) {
      message += `... và ${eligibleUsers.length - MAX_USERS_PER_MESSAGE} người khác.`;
    }
    message += `\nTổng số user idle (đủ điều kiện): **${eligibleUsers.length}** người.`;

    // 7. Gửi webhook
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
      if (!sent)
        console.error("Seatalk webhook failed:", await webhookRes.text());
    } else {
      console.warn(
        "SEATALK_ALERT_WEBHOOK_URL not configured, would send:",
        message,
      );
      sent = true;
    }

    // 8. Chỉ đánh dấu cooldown cho những user thực sự được hiển thị
    if (sent && displayUsers.length > 0) {
      const emailsToUpdate = displayUsers.map((u) => u.email);
      const { error: updateError } = await supabase
        .from("qc_users")
        .update({ idle_alert_sent_at: now })
        .in("email", emailsToUpdate);

      if (updateError) {
        console.error("Failed to update idle_alert_sent_at:", updateError);
      }
    }

    return res.status(200).json({
      sent,
      totalIdle: allIdleUsers.length,
      eligible: eligibleUsers.length,
      displayed: displayUsers.length,
    });
  } catch (err) {
    console.error("send-idle-alert error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
