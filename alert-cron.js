// alert-cron.js
require("dotenv").config(); // nếu dùng file .env
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);

const SEATALK_WEBHOOK_URL = process.env.SEATALK_ALERT_WEBHOOK_URL;

// Cache cấu hình 1 phút
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

async function sendAlert() {
  try {
    const now = Date.now();
    const config = await getAlertConfig();
    const { workStartMs, workEndMs } = getWorkTimestamps(now, config);
    const { breakStartMs, breakEndMs } = getBreakTimestamps(now, config);

    // Ngoài giờ làm việc hoặc trong giờ nghỉ trưa -> bỏ qua
    if (now < workStartMs || now >= workEndMs) {
      console.log("Ngoài giờ làm việc, bỏ qua.");
      return;
    }
    if (now >= breakStartMs && now < breakEndMs) {
      console.log("Đang trong giờ nghỉ trưa, bỏ qua.");
      return;
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
      console.log("Không có user active.");
      return;
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
      console.log("Không có ai idle.");
      return;
    }

    const eligibleUsers = allIdleUsers.filter(
      (u) => u.lastAlertSent <= alertCooldown,
    );
    if (eligibleUsers.length === 0) {
      console.log("Tất cả idle đều trong cooldown.");
      return;
    }

    eligibleUsers.sort((a, b) => b.idle - a.idle);
    const displayUsers = eligibleUsers.slice(0, config.max_users_per_message);

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
    if (SEATALK_WEBHOOK_URL && !SEATALK_WEBHOOK_URL.includes("xxx")) {
      const fetch = (await import("node-fetch")).default;
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
        const text = await webhookRes.text();
        console.error("Seatalk webhook failed:", text);
      }
    } else {
      console.warn("Webhook chưa cấu hình, nội dung tin nhắn:", message);
      sent = true;
    }

    if (sent && displayUsers.length > 0) {
      const emailsToUpdate = displayUsers.map((u) => u.email);
      const { error: updateError } = await supabase
        .from("qc_users")
        .update({ idle_alert_sent_at: now })
        .in("email", emailsToUpdate);
      if (updateError) console.error("Lỗi cập nhật cooldown:", updateError);
    }

    console.log(`Đã gửi cảnh báo cho ${displayUsers.length} user.`);
  } catch (err) {
    console.error("Lỗi khi kiểm tra idle:", err);
  }
}

// Chạy ngay lần đầu, sau đó lặp mỗi 10 phút
sendAlert();
setInterval(sendAlert, 10 * 60 * 1000);

console.log("Alert service started. Kiểm tra mỗi 10 phút.");
