import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);

const CRON_SECRET = process.env.CRON_SECRET;

// Cache cấu hình trong 1 phút để tránh query DB mỗi lần cron chạy
let cachedConfig = null;
let lastConfigFetch = 0;

async function getAlertConfig() {
  const now = Date.now();
  if (cachedConfig && now - lastConfigFetch < 60_000) {
    return cachedConfig;
  }
  const { data, error } = await supabase
    .from("qc_alert_config")
    .select("*")
    .eq("id", 1)
    .single();
  if (error) throw new Error(`Config fetch error: ${error.message}`);
  cachedConfig = data;
  lastConfigFetch = now;
  return data;
}

function getWorkTimestamps(nowMs, config) {
  const vnDate = new Date(nowMs + 7 * 3600000);
  const workStart = new Date(vnDate);
  workStart.setHours(
    config.work_start_hour,
    config.work_start_min - config.work_start_buffer_minutes,
    0,
    0,
  );
  const workEnd = new Date(vnDate);
  workEnd.setHours(
    config.work_end_hour,
    config.work_end_min + config.work_end_buffer_minutes,
    0,
    0,
  );
  return {
    workStartMs: workStart.getTime() - 7 * 3600000,
    workEndMs: workEnd.getTime() - 7 * 3600000,
  };
}

function getBreakTimestamps(nowMs, config) {
  const vnDate = new Date(nowMs + 7 * 3600000);
  const breakStart = new Date(vnDate);
  breakStart.setHours(config.break_start_hour, config.break_start_min, 0, 0);
  const breakEnd = new Date(vnDate);
  breakEnd.setHours(config.break_end_hour, config.break_end_min, 0, 0);
  return {
    breakStartMs: breakStart.getTime() - 7 * 3600000,
    breakEndMs: breakEnd.getTime() - 7 * 3600000,
  };
}

function calcEffectiveIdle(
  lastLogMs,
  nowMs,
  workStartMs,
  workEndMs,
  breakStartMs,
  breakEndMs,
) {
  if (nowMs <= lastLogMs) return 0;
  const effectiveStart = Math.max(lastLogMs, workStartMs);
  const effectiveEnd = Math.min(nowMs, workEndMs);
  if (effectiveStart >= effectiveEnd) return 0;
  let workTime = effectiveEnd - effectiveStart;
  const overlapStart = Math.max(effectiveStart, breakStartMs);
  const overlapEnd = Math.min(effectiveEnd, breakEndMs);
  if (overlapStart < overlapEnd) {
    workTime -= overlapEnd - overlapStart;
  }
  return Math.max(0, workTime);
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
    const config = await getAlertConfig();
    const { workStartMs, workEndMs } = getWorkTimestamps(now, config);
    const { breakStartMs, breakEndMs } = getBreakTimestamps(now, config);

    // Ngoài giờ làm việc -> không gửi
    if (now < workStartMs || now >= workEndMs) {
      return res
        .status(200)
        .json({ message: "Ngoài giờ làm việc, tạm dừng cảnh báo." });
    }

    // Trong giờ nghỉ trưa -> không gửi
    if (now >= breakStartMs && now < breakEndMs) {
      return res
        .status(200)
        .json({ message: "Đang trong giờ nghỉ trưa, tạm dừng cảnh báo." });
    }

    const vnToday = new Date(now + 7 * 3600000);
    vnToday.setHours(0, 0, 0, 0);
    const sinceISO = new Date(vnToday.getTime() - 7 * 3600000).toISOString();
    const alertCooldown = now - config.cooldown_minutes * 60 * 1000;

    // Lấy user active
    const { data: activeUsers, error: userError } = await supabase
      .from("qc_users")
      .select("email, idle_alert_sent_at")
      .eq("is_active", true);

    if (userError) throw userError;
    if (!activeUsers || activeUsers.length === 0) {
      return res.status(200).json({ message: "No active users" });
    }

    const lastLogMap = await getLastLogTimes(sinceISO);

    const allIdleUsers = [];
    for (const user of activeUsers) {
      const email = user.email;
      const lastLogTime = lastLogMap.get(email);
      if (!lastLogTime) continue;

      const lastLogMs = new Date(lastLogTime).getTime();
      const effectiveIdleMs = calcEffectiveIdle(
        lastLogMs,
        now,
        workStartMs,
        workEndMs,
        breakStartMs,
        breakEndMs,
      );
      const idleMinutes = Math.floor(effectiveIdleMs / 60000);
      if (idleMinutes < config.idle_threshold_minutes) continue;

      let lastAlertSent = user.idle_alert_sent_at || 0;
      // Reset cooldown nếu user có hoạt động mới sau lần cảnh báo cuối
      if (lastAlertSent > 0 && lastLogMs > lastAlertSent) {
        lastAlertSent = 0;
      }

      allIdleUsers.push({
        email,
        idle: idleMinutes,
        lastActivityTime: new Date(lastLogMs).toLocaleTimeString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
        }),
        lastAlertSent,
      });
    }

    if (allIdleUsers.length === 0) {
      return res.status(200).json({ message: "No idle users to alert" });
    }

    // Lọc user không trong cooldown
    const eligibleUsers = allIdleUsers.filter(
      (u) => u.lastAlertSent <= alertCooldown,
    );
    if (eligibleUsers.length === 0) {
      return res
        .status(200)
        .json({ message: "All idle users are in cooldown or recently reset" });
    }

    eligibleUsers.sort((a, b) => b.idle - a.idle);
    const displayUsers = eligibleUsers.slice(0, config.max_users_per_message);

    // Tạo tin nhắn
    const nowStr = new Date().toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
    });
    let message = `⚠️ **Danh sách QC idle > ${config.idle_threshold_minutes} phút** (${nowStr})\n\n`;
    displayUsers.forEach((u, i) => {
      message += `${i + 1}. **${u.email}** - idle ${u.idle} phút (hoạt động cuối: ${u.lastActivityTime})\n`;
    });
    if (eligibleUsers.length > config.max_users_per_message) {
      message += `... và ${eligibleUsers.length - config.max_users_per_message} người khác.`;
    }
    message += `\nTổng số user idle (đủ điều kiện): **${eligibleUsers.length}** người.`;

    // Gửi webhook
    let sent = false;
    const webhookUrl = process.env.SEATALK_ALERT_WEBHOOK_URL;
    if (webhookUrl && !webhookUrl.includes("xxx")) {
      const webhookRes = await fetch(webhookUrl, {
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

    // Đánh dấu cooldown cho user được hiển thị
    if (sent && displayUsers.length > 0) {
      const emailsToUpdate = displayUsers.map((u) => u.email);
      const { error: updateError } = await supabase
        .from("qc_users")
        .update({ idle_alert_sent_at: now })
        .in("email", emailsToUpdate);
      if (updateError)
        console.error("Failed to update idle_alert_sent_at:", updateError);
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
