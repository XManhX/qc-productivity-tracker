import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const CRON_SECRET = process.env.CRON_SECRET;
const VN_OFFSET = 7 * 3600 * 1000; // UTC+7 in ms

// Cache config for 1 minute to avoid DB queries on every cron run
let cachedConfig = null;
let lastConfigFetch = 0;

/**
 * Get today's date in Vietnam timezone (consistent with dashboard.js)
 */
function getTodayVN() {
  const now = new Date(Date.now() + VN_OFFSET);
  return now.toISOString().split("T")[0];
}

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

function createVNTimestamp(hour, min, nowMs = Date.now()) {
  const vnDate = new Date(nowMs + VN_OFFSET);
  vnDate.setHours(hour, min, 0, 0);
  return vnDate.getTime() - VN_OFFSET; // Convert back to UTC timestamp
}

function getWorkTimestamps(nowMs, config) {
  return {
    workStartMs: createVNTimestamp(
      config.work_start_hour,
      config.work_start_min - config.work_start_buffer_minutes,
      nowMs
    ),
    workEndMs: createVNTimestamp(
      config.work_end_hour,
      config.work_end_min + config.work_end_buffer_minutes,
      nowMs
    ),
  };
}

function getBreakTimestamps(nowMs, config) {
  return {
    breakStartMs: createVNTimestamp(config.break_start_hour, config.break_start_min, nowMs),
    breakEndMs: createVNTimestamp(config.break_end_hour, config.break_end_min, nowMs),
  };
}

/**
 * Calculate idle minutes in a clear and realistic way:
 * - Only count time within working hours, excluding break.
 * - If last activity was before the end of break, idle starts from break end.
 * - If last activity was after break, idle starts from that activity.
 */
function calcIdleMinutes(lastLogMs, nowMs, workStartMs, workEndMs, breakStartMs, breakEndMs) {
  // Not in working hours or currently on break -> no idle alert
  if (nowMs < workStartMs || nowMs >= workEndMs) return 0;
  if (nowMs >= breakStartMs && nowMs < breakEndMs) return 0;

  let idleStartMs;
  if (lastLogMs >= breakEndMs) {
    // Last activity after break: idle starts from that moment (but not before work start)
    idleStartMs = Math.max(lastLogMs, workStartMs);
  } else {
    // Last activity before or during break: idle starts when break ends
    idleStartMs = Math.max(workStartMs, breakEndMs);
  }

  const effectiveNow = Math.min(nowMs, workEndMs);
  const idleMs = effectiveNow - idleStartMs;
  return Math.max(0, Math.floor(idleMs / 60000));
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

// Helper to capitalize names
function capitalizeName(name) {
  if (!name) return name;
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export default async function handler(req, res) {
  // You can uncomment the following lines to enable cron secret authentication
  // if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
  //   return res.status(401).json({ success: false, error: "Unauthorized" });
  // }

  try {
    const now = Date.now();
    const config = await getAlertConfig();
    const { workStartMs, workEndMs } = getWorkTimestamps(now, config);
    const { breakStartMs, breakEndMs } = getBreakTimestamps(now, config);

    // Outside working hours
    if (now < workStartMs || now >= workEndMs) {
      return res.status(200).json({ message: "Ngoài giờ làm việc, tạm dừng cảnh báo." });
    }

    // During break time
    if (now >= breakStartMs && now < breakEndMs) {
      return res.status(200).json({ message: "Đang trong giờ nghỉ trưa, tạm dừng cảnh báo." });
    }

    const todayVN = getTodayVN();
    const sinceISO = new Date(`${todayVN}T00:00:00+07:00`).toISOString();
    const alertCooldown = now - config.cooldown_minutes * 60 * 1000;

    // Get active users
    const { data: activeUsers, error: userError } = await supabase
      .from("qc_users")
      .select("email, name, idle_alert_sent_at")
      .eq("is_active", true);

    if (userError) throw userError;
    if (!activeUsers || activeUsers.length === 0) {
      return res.status(200).json({ message: "No active users" });
    }

    const lastLogMap = await getLastLogTimes(sinceISO);
    const idleUsers = [];

    for (const user of activeUsers) {
      const lastLogTime = lastLogMap.get(user.email);
      if (!lastLogTime) continue;

      const lastLogMs = new Date(lastLogTime).getTime();
      const idleMinutes = calcIdleMinutes(
        lastLogMs,
        now,
        workStartMs,
        workEndMs,
        breakStartMs,
        breakEndMs
      );

      if (idleMinutes < config.idle_threshold_minutes) continue;

      let lastAlertSent = user.idle_alert_sent_at || 0;
      // Reset cooldown if user has a new activity after last alert
      if (lastAlertSent > 0 && lastLogMs > lastAlertSent) {
        lastAlertSent = 0;
      }

      // Determine the idle start time for display
      let idleStartMs;
      if (lastLogMs >= breakEndMs) {
        idleStartMs = Math.max(lastLogMs, workStartMs);
      } else {
        idleStartMs = Math.max(workStartMs, breakEndMs);
      }
      const idleStartTime = new Date(idleStartMs).toLocaleTimeString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
      });

      idleUsers.push({
        email: user.email,
        name: user.name,
        idle: idleMinutes,
        idleStartTime,
        lastAlertSent,
      });
    }

    if (idleUsers.length === 0) {
      return res.status(200).json({ message: "No idle users to alert" });
    }

    // Filter users not in cooldown
    const eligibleUsers = idleUsers.filter(
      (u) => u.lastAlertSent <= alertCooldown
    );
    if (eligibleUsers.length === 0) {
      return res.status(200).json({
        message: "All idle users are in cooldown or recently reset",
      });
    }

    // Sort by idle time descending and limit displayed users
    eligibleUsers.sort((a, b) => b.idle - a.idle);
    const displayUsers = eligibleUsers.slice(0, config.max_users_per_message);

    // Build notification message
    const nowStr = new Date().toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
    });
    let message = `⚠️ **Danh sách QC idle > ${config.idle_threshold_minutes} phút** (${nowStr})\n\n`;
    displayUsers.forEach((u, i) => {
      const displayName = u.name ? capitalizeName(u.name) : u.email;
      message += `${i + 1}. **${displayName}** - vắng ${u.idle} phút (tính từ ${u.idleStartTime})\n`;
    });
    if (eligibleUsers.length > config.max_users_per_message) {
      message += `... và ${eligibleUsers.length - config.max_users_per_message} người khác.`;
    }
    message += `\nTổng số user idle (đủ điều kiện): **${eligibleUsers.length}** người.`;

    // Send webhook
    let sent = false;
    const webhookUrl =
      config.seatalk_webhook_url || process.env.SEATALK_ALERT_WEBHOOK_URL;
    if (webhookUrl && !webhookUrl.includes("xxx")) {
      try {
        const webhookRes = await fetch(webhookUrl, {
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
      } catch (webhookErr) {
        console.error("Seatalk webhook error:", webhookErr);
      }
    } else {
      console.warn(
        "SEATALK_ALERT_WEBHOOK_URL not configured, would send:",
        message
      );
      sent = true; // simulate success for testing
    }

    // Update cooldown for displayed users
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
      totalIdle: idleUsers.length,
      eligible: eligibleUsers.length,
      displayed: displayUsers.length,
    });
  } catch (err) {
    console.error("send-idle-alert error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}