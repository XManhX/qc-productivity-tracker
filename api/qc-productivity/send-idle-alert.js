import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const CRON_SECRET = process.env.CRON_SECRET;
const VN_OFFSET = 7 * 3600 * 1000;

let cachedConfig = null;
let lastConfigFetch = 0;

function getTodayVN() {
  const now = new Date(Date.now() + VN_OFFSET);
  return now.toISOString().split("T")[0];
}

async function getAlertConfig() {
  const now = Date.now();
  if (cachedConfig && now - lastConfigFetch < 60_000) return cachedConfig;
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
  return vnDate.getTime() - VN_OFFSET;
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

function calcIdleMinutes(lastLogMs, nowMs, workStartMs, workEndMs, breakStartMs, breakEndMs) {
  if (nowMs < workStartMs || nowMs >= workEndMs) return 0;
  if (nowMs >= breakStartMs && nowMs < breakEndMs) return 0;

  let idleStartMs;
  if (lastLogMs >= breakEndMs) {
    idleStartMs = Math.max(lastLogMs, workStartMs);
  } else {
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

function capitalizeName(name) {
  if (!name) return name;
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// ========== THƯ VIỆN CÂU TỪ ĐA DẠNG ==========

const GREETINGS = [
  "🤗 Xin chào cả nhà yêu quý!",
  "☀️ Chúc mọi người một buổi làm việc tràn đầy năng lượng!",
  "🌻 Cả nhà ơi, cùng nhau giữ nhịp làm việc nào!",
  "⏰ Điểm danh sự tập trung buổi chiều!",
  "🍀 Một lời nhắc nhẹ nhàng cho buổi làm việc hiệu quả!",
  "🌈 Cùng nhau giữ vững phong độ nào các chiến binh QC!",
  "🎯 Tập trung cao độ – thành công sẽ đến!",
  "😊 Hế lô cả team, chúc mọi người một buổi chiều thật suôn sẻ!",
  "💐 Gửi ngàn lời chúc tốt đẹp nhất đến team mình!",
  "🚀 Nào, cùng tăng tốc cho buổi chiều năng suất!",
  "🍂 Một lời nhắc nhỏ xinh từ hệ thống, đừng giận nhé!",
  "🎈 Cùng kiểm tra nhịp độ làm việc một chút nha cả nhà!",
  "🌞 Chào buổi chiều, hy vọng mọi người vẫn đầy nhiệt huyết!",
  "🍭 Nhẹ nhàng như que kẹo, mình nhắc nhau cùng tập trung nào!",
  "🍀 Chúc team mình một buổi chiều may mắn và hiệu quả!",
  "💖 Cả nhà thân mến, cùng giúp nhau giữ vững tinh thần nhé!",
  "✨ Một ngày mới, một cơ hội mới, đừng để thời gian trôi qua lãng phí!",
  "🌱 Hãy cùng nhau vun đắp cho buổi làm việc thêm xanh tươi!",
];

const MAIN_MESSAGES = [
  "Cùng điểm qua một vài bạn đã rời bàn phím hơi lâu nhé:",
  "Danh sách những bạn cần quay lại guồng quay công việc nè:",
  "Các bạn sau đây có vẻ đã thả lỏng hơi lâu, mình cùng nhắc nhẹ nhé:",
  "Điểm danh những chiến binh đang offline hơi lâu nè:",
  "Những bạn dưới đây cần nhanh chóng trở lại để không bỏ lỡ nhịp độ chung:",
  "Team mình có vài bạn đang “lạc trôi”, cùng gọi họ về nhé:",
  "Đừng để bản thân bị bỏ lại, các bạn sau cần hồi sinh ngay:",
  "Một vài cái tên đã vắng bóng trên hệ thống một lúc rồi:",
  "Tập trung nào các bạn ơi, đừng để “idle” chiến thắng:",
  "List những bạn đang có dấu hiệu “mất kết nối” với công việc:",
  "Cùng điểm danh những người cần tăng tốc ngay bây giờ:",
  "Hỡi những linh hồn đang bay bổng, hãy quay về với QC team!",
  "Nhẹ nhàng nhắc nhở một vài bạn đang nghỉ tay hơi lâu:",
  "Có ai đó quên mất bàn phím của mình rồi, xem danh sách nè:",
  "Chú ý, chú ý! Những bạn sau cần quay lại trận địa ngay:",
  "Đừng để đồng nghiệp phải chờ, các bạn sau cần vào việc gấp:",
];

const CLOSINGS = [
  "💪 Cố gắng duy trì sự tập trung nhé, mọi người!",
  "🌸 Cảm ơn cả nhà đã luôn nỗ lực, cùng cố lên nào!",
  "🚀 Hi vọng chúng ta sẽ sớm bắt kịp tiến độ, cảm ơn mọi người!",
  "✨ Mình biết mọi người đã rất chăm chỉ, chỉ là một chút lơ là thôi, cùng quay lại nào!",
  "💖 Cả nhà mình cùng hỗ trợ nhau để hoàn thành công việc thật tốt nhé!",
  "🍃 Một chút gió nhẹ nhắc nhở, không có gì nghiêm trọng, chỉ cần quay lại là ổn thôi!",
  "🏆 Cùng giữ vững phong độ để đạt kết quả tốt nhất nha!",
  "🎯 Tập trung lại nào, chúng ta làm được mà!",
  "🌈 Sau cơn mưa trời lại sáng, quay lại làm việc thôi!",
  "🌷 Chúc mọi người một buổi làm việc còn lại thật hiệu quả!",
  "🍀 Đừng lo lắng, chỉ cần trở lại đúng lúc là mọi thứ vẫn ổn!",
  "🌟 Mỗi phút giây đều quý giá, hãy cùng tận dụng thật tốt!",
  "🔥 Hãy để sự chuyên nghiệp dẫn lối, quay trở lại công việc nào!",
  "💎 Các bạn là những viên ngọc sáng, đừng để bụi thời gian che phủ!",
  "🎈 Nhẹ nhàng thôi, nhưng hãy hành động ngay nhé!",
];

const CLOSING_FOOTER = [
  "\n\n🙏 Cảm ơn sự cố gắng của tất cả mọi người!",
  "\n\n💞 Cùng nhau tiến bước, không ai bị bỏ lại phía sau!",
  "\n\n🌟 Tin rằng buổi làm việc còn lại sẽ tuyệt vời hơn!",
  "\n\n🔥 Cảm ơn team, tiếp tục chiến thôi!",
  "\n\n🌸 Chúc team một ngày làm việc vui vẻ và hiệu quả!",
  "\n\n🍀 Cùng nhau giữ lửa nhiệt huyết nhé!",
  "\n\n✨ Cảm ơn mọi người đã lắng nghe, quay lại thôi nào!",
  "\n\n🎯 Hẹn gặp lại ở những báo cáo thành công!",
  "\n\n💖 Teamwork makes the dream work! Cùng cố gắng nhé!",
  "\n\n🚀 Cùng bay cao nào các chiến binh!",
  "",
];

const SMALL_NOTES = [
  "💡 Mẹo nhỏ: Đặt chuông nhắc 30 phút một lần để giữ nhịp làm việc.",
  "☕ Một tách cà phê có thể giúp bạn tỉnh táo hơn, nhưng đừng quên quay lại nhé!",
  "🎵 Nghe một bản nhạc yêu thích rồi quay lại làm việc hiệu quả hơn!",
  "🧘 Đứng lên vươn vai vài phút rồi trở lại, đừng để idle quá lâu!",
  "📌 Hãy nhớ rằng mỗi phút trôi qua đều ảnh hưởng đến mục tiêu chung.",
  "⌨️ Bàn phím đang chờ bạn, đừng để nó cô đơn quá lâu!",
  "📈 Chỉ cần tập trung thêm chút nữa, kết quả sẽ bất ngờ!",
  "🏃 Dậy đi lại một chút cho khỏe, nhưng nhớ quay về với công việc nha!",
];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildFriendlyMessage(displayUsers, eligibleUsers, config) {
  const nowStr = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  const greeting = randomItem(GREETINGS);
  const mainMsg = randomItem(MAIN_MESSAGES);
  const closing = randomItem(CLOSINGS);
  const footer = randomItem(CLOSING_FOOTER);
  const note = Math.random() < 0.3 ? `\n\n${randomItem(SMALL_NOTES)}` : ""; // 30% xác suất thêm mẹo nhỏ

  let message = `${greeting}\n`;
  message += `⏰ ${nowStr}\n\n`;
  message += `${mainMsg}\n`;

  displayUsers.forEach((u, i) => {
    const displayName = u.name ? capitalizeName(u.name) : u.email;
    message += `${i + 1}. ${displayName}: đã nghỉ tay ${u.idle} phút (từ ${u.idleStartTime})\n`;
  });

  if (eligibleUsers.length > config.max_users_per_message) {
    message += `\n(Còn ${eligibleUsers.length - config.max_users_per_message} bạn khác cũng đang nghỉ, nhẹ nhàng gọi họ về nhé!)`;
  }

  message += `\n${closing}${footer}${note}`;
  return message;
}

export default async function handler(req, res) {
  // if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
  //   return res.status(401).json({ success: false, error: "Unauthorized" });
  // }

  try {
    const now = Date.now();
    const config = await getAlertConfig();
    const { workStartMs, workEndMs } = getWorkTimestamps(now, config);
    const { breakStartMs, breakEndMs } = getBreakTimestamps(now, config);

    if (now < workStartMs || now >= workEndMs) {
      return res.status(200).json({ message: "Ngoài giờ làm việc, tạm dừng cảnh báo." });
    }
    if (now >= breakStartMs && now < breakEndMs) {
      return res.status(200).json({ message: "Đang trong giờ nghỉ trưa, tạm dừng cảnh báo." });
    }

    const todayVN = getTodayVN();
    const sinceISO = new Date(`${todayVN}T00:00:00+07:00`).toISOString();
    const alertCooldown = now - config.cooldown_minutes * 60 * 1000;

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
      if (lastAlertSent > 0 && lastLogMs > lastAlertSent) {
        lastAlertSent = 0;
      }

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

    const eligibleUsers = idleUsers.filter(
      (u) => u.lastAlertSent <= alertCooldown
    );
    if (eligibleUsers.length === 0) {
      return res.status(200).json({
        message: "All idle users are in cooldown or recently reset",
      });
    }

    eligibleUsers.sort((a, b) => b.idle - a.idle);
    const displayUsers = eligibleUsers.slice(0, config.max_users_per_message);

    const message = buildFriendlyMessage(displayUsers, eligibleUsers, config);

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
      console.warn("SEATALK_ALERT_WEBHOOK_URL not configured, would send:", message);
      sent = true;
    }

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