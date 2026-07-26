import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";

// ===== INIT SUPABASE =====
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY   // dùng service key để đủ quyền
);

// ===== COMMON UTILS =====
const VN_OFFSET = 7 * 3600 * 1000;

function getTodayVN() {
    const now = new Date(Date.now() + VN_OFFSET);
    return now.toISOString().split("T")[0];
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

function capitalizeName(name) {
    if (!name) return name;
    return name
        .trim()
        .split(/\s+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
}

function getPeriodOfDay() {
    const vnHour = new Date(Date.now() + VN_OFFSET).getHours();
    return vnHour < 12 ? "morning" : "afternoon";
}

// Hàm tính idle dùng cho alert (từ lastLog đến now, loại bỏ giờ nghỉ trưa)
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

// Hàm tính idle giữa hai log liên tiếp (dùng cho báo cáo)
function calcIdleBetweenLogs(lastLogMs, currentLogMs, workStartMs, workEndMs, breakStartMs, breakEndMs) {
    if (lastLogMs === 0 || currentLogMs <= lastLogMs) return 0;

    let idleMs = currentLogMs - lastLogMs;
    // trừ thời gian nghỉ trưa nếu overlap
    if (breakStartMs && breakEndMs && lastLogMs < breakEndMs && currentLogMs > breakStartMs) {
        const overlapStart = Math.max(lastLogMs, breakStartMs);
        const overlapEnd = Math.min(currentLogMs, breakEndMs);
        idleMs -= (overlapEnd - overlapStart);
    }
    return Math.max(0, Math.floor(idleMs / 60000));
}

// ===== ALERT FUNCTIONS =====
let cachedConfig = null;
let lastConfigFetch = 0;

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

// Thư viện câu từ
const GREETINGS_GENERAL = [
    "🤗 Xin chào cả nhà yêu quý!",
    "💖 Cả nhà thân mến, cùng giúp nhau giữ vững tinh thần nhé!",
    "✨ Một ngày mới, một cơ hội mới, đừng để thời gian trôi qua lãng phí!",
    "🌱 Hãy cùng nhau vun đắp cho buổi làm việc thêm xanh tươi!",
    "🍃 Cùng hít thở thật sâu và quay lại công việc thôi nào!",
    "🕊️ Nhẹ nhàng như làn gió, mình nhắc nhau cùng cố gắng!",
    "🏵️ Xin chào những con ong chăm chỉ của tổ QC!",
    "🍀 Chào team, chúc mọi người một buổi làm việc hiệu quả!",
    "🧋 Trà sữa thì ngọt, nhưng công việc còn ngọt hơn, cùng làm nào!",
    "💎 Mỗi bạn là một viên ngọc, hãy tỏa sáng trong công việc!",
    "🌠 Cùng hướng tới những vì sao, bắt đầu bằng việc tập trung nhé!",
    "🎪 Chào mừng đến với rạp xiếc QC, tiết mục hôm nay: quay lại làm việc!",
    "🥁 Trống điểm danh, ai đang online giơ tay lên!",
    "😊 Hế lô cả team, chúc mọi người một buổi làm việc thật suôn sẻ!",
    "💐 Gửi ngàn lời chúc tốt đẹp nhất đến team mình!",
    "🚀 Nào, cùng tăng tốc cho một buổi làm việc năng suất!",
    "🍂 Một lời nhắc nhỏ xinh từ hệ thống, đừng giận nhé!",
    "🎈 Cùng kiểm tra nhịp độ làm việc một chút nha cả nhà!",
    "🌼 Dù nắng hay mưa, chúng ta vẫn làm việc hết mình!",
    "🎋 Chúc team một buổi làm việc nhiều may mắn và ít bug!",
    "🍀 Một lời nhắc nhẹ nhàng cho buổi làm việc hiệu quả!",
    "🌈 Cùng nhau giữ vững phong độ nào các chiến binh QC!",
    "🎯 Tập trung cao độ – thành công sẽ đến!",
];
const GREETINGS_MORNING = [
    "☀️ Chúc mọi người một buổi sáng tràn đầy năng lượng!",
    "🌞 Chào buổi sáng, hy vọng mọi người đầy nhiệt huyết!",
    "🌻 Chào buổi sáng, cùng nhau giữ nhịp làm việc nào!",
    "☕ Buổi sáng tốt lành, một ngày làm việc hiệu quả bắt đầu từ đây!",
    "🥐 Ăn sáng no nê chưa nào? Vào guồng công việc thôi!",
    "🌅 Mặt trời đã lên cao, tập trung làm việc nào các bạn!",
    "🍳 Một bữa sáng ngon lành, một ngày làm việc tuyệt vời!",
    "🧃 Sẵn sàng cho một buổi sáng bùng nổ nào!",
];
const GREETINGS_AFTERNOON = [
    "⏰ Điểm danh sự tập trung buổi chiều!",
    "🌞 Chào buổi chiều, hy vọng mọi người vẫn đầy nhiệt huyết!",
    "🍭 Nhẹ nhàng như que kẹo, mình nhắc nhau cùng tập trung nào!",
    "🍃 Buổi chiều mát mẻ, làm việc thật hăng say nhé!",
    "🌇 Chiều tà buông xuống, đừng để công việc trôi theo mây!",
    "🧉 Một ly trà đá buổi chiều cho tỉnh táo, rồi làm tiếp nào!",
    "☀️ Nắng chiều vẫn rực rỡ, tinh thần mình cũng phải rực rỡ theo!",
    "🌆 Hoàng hôn sắp đến, nhưng deadline thì không chờ, cố lên!",
    "🍪 Bánh quy buổi chiều ai mua nào? Nhớ quay lại làm việc nha!",
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
    "Ơ kìa, ai đang “thả hồn theo mây” thế này?",
    "Cùng gọi tên những người đang thư giãn hơi lâu:",
    "Hãy nhìn vào danh sách và tự hỏi: “Mình có đang ở đây không?”",
    "Điểm danh những “ca sĩ” đang tạm rời sân khấu:",
    "Đừng biến bàn làm việc thành giường ngủ, quay lại thôi!",
    "Danh sách những bạn cần F5 bản thân ngay lập tức:",
    "Cùng xem ai đang cần reset tinh thần làm việc:",
    "Hệ thống báo động: một số bạn đã rời khỏi trận địa!",
    "Mất tích tạm thời, tìm ngay những bạn sau:",
    "Báo cáo tình hình: có người đang “ngủ đông” giữa ca làm!",
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
    "🍭 Một chút nhắc nhở ngọt ngào, mong mọi người quay lại!",
    "🎀 Đừng để thành tích của team bị ảnh hưởng chỉ vì vài phút lơ là!",
    "💪 Cùng thắt chặt dây an toàn, chuẩn bị tăng tốc!",
    "🛎️ Chuông đã reo, mời mọi người trở lại vị trí!",
    "🍀 Chúc team luôn giữ được nhịp làm việc ổn định!",
    "🏅 Cùng hướng đến danh hiệu “Team chăm chỉ nhất”!",
    "🧠 Tập trung là sức mạnh, đừng lãng phí nó!",
    "🌊 Hãy như sóng biển, luôn tiến về phía trước!",
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
    "\n\n🌻 Mỗi người một tay, việc gì cũng xong!",
    "\n\n🍂 Thư giãn xong rồi, quay lại và tỏa sáng thôi!",
    "\n\n💐 Chúc team buổi chiều nhiều niềm vui và ít lỗi!",
    "\n\n🍀 Cảm ơn vì đã luôn bên nhau, cùng tiến lên!",
    "\n\n🎈 Hãy biến những phút giây còn lại thành vàng!",
    "\n\n☕ Nhấp một ngụm trà/cà phê, rồi làm việc thôi!",
    "\n\n🕊️ Bình yên trong tâm hồn, hiệu quả trong công việc!",
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
    "💬 Rủ đồng nghiệp cùng làm việc để tăng động lực!",
    "🎯 Mục tiêu hôm nay đã đạt được bao nhiêu phần trăm rồi?",
    "🍀 Một chút nghỉ ngơi là tốt, nhưng đừng quên deadline nhé!",
    "🧩 Mỗi phút làm việc là một mảnh ghép thành công.",
    "🖱️ Chuột và bàn phím đang chờ bạn trở lại!",
    "🏆 Hãy giữ danh hiệu “Nhân viên chăm chỉ” của bạn!",
    "⏳ Thời gian không chờ đợi ai, hãy quay lại ngay!",
    "🍫 Thưởng cho mình một thanh socola rồi làm việc tiếp nào!",
];

function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function buildFriendlyMessage(displayUsers, eligibleUsers, config) {
    const nowStr = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    const period = getPeriodOfDay();
    const periodGreetings = period === "morning" ? GREETINGS_MORNING : GREETINGS_AFTERNOON;
    const allGreetings = [...GREETINGS_GENERAL, ...periodGreetings];
    const greeting = randomItem(allGreetings);

    const mainMsg = randomItem(MAIN_MESSAGES);
    const closing = randomItem(CLOSINGS);
    const footer = randomItem(CLOSING_FOOTER);
    const note = Math.random() < 0.35 ? `\n\n${randomItem(SMALL_NOTES)}` : "";

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

// ===== REPORT FUNCTIONS =====
async function getCachedReport(type, reportDate) {
    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data } = await supabase
            .from("qc_reports")
            .select("data, created_at")
            .eq("report_type", type)
            .eq("report_date", reportDate)
            .gt("created_at", oneHourAgo)
            .single();
        return data?.data || null;
    } catch (error) {
        console.error("Cache read error:", error);
        return null;
    }
}

async function saveCachedReport(type, reportDate, reportData) {
    try {
        await supabase.from("qc_reports").upsert({
            report_type: type,
            report_date: reportDate,
            data: reportData,
            updated_at: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Cache save error:", error);
    }
}

function generateExcelBuffer(reportData, reportType) {
    const wb = XLSX.utils.book_new();

    const summaryWS = XLSX.utils.json_to_sheet([
        { "Chỉ số": "Tổng số QC", "Giá trị": reportData.summary.total_qc },
        // ... giữ nguyên các dòng
    ]);
    XLSX.utils.book_append_sheet(wb, summaryWS, "Tổng quan");

    const idleBreakdownWS = XLSX.utils.json_to_sheet([
        { "Loại idle": "Dưới 15 phút", "Số lần": reportData.idle_breakdown.short_idle },
        { "Loại idle": "15-30 phút", "Số lần": reportData.idle_breakdown.medium_idle },
        { "Loại idle": "Hơn 30 phút", "Số lần": reportData.idle_breakdown.long_idle },
    ]);
    XLSX.utils.book_append_sheet(wb, idleBreakdownWS, "Phân loại idle");

    const userDetailWS = XLSX.utils.json_to_sheet(reportData.user_details);
    XLSX.utils.book_append_sheet(wb, userDetailWS, "Chi tiết QC");

    if (reportType === "weekly" || reportType === "monthly") {
        const rankingWS = XLSX.utils.json_to_sheet(reportData.ranking || reportData.top_performers);
        XLSX.utils.book_append_sheet(wb, rankingWS, "Xếp hạng");
    }
    return wb;
}

async function getDailyReport(dateStr, skipCache = false) {
    // ... logic từ file report, nhưng sử dụng calcIdleBetweenLogs thay vì calcIdleMinutes cũ
    // Lưu ý sửa các chỗ gọi calcIdleMinutes cũ thành calcIdleBetweenLogs
}

async function getDailyReportForPeriod(startDateStr, endDateStr) {
    // ... giữ nguyên
}

async function getWeeklyReport(endDateStr, skipCache = false) {
    // ... giữ nguyên
}

async function getMonthlyReport(year, month, skipCache = false) {
    // ... giữ nguyên
}

// ===== MAIN HANDLER =====
export default async function handler(req, res) {
    const { action = "alert" } = req.query; // mặc định là alert

    if (action === "alert") {
        // ========== XỬ LÝ CẢNH BÁO ==========
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
            if (!activeUsers?.length) {
                return res.status(200).json({ message: "No active users" });
            }

            const lastLogMap = await getLastLogTimes(sinceISO);
            const idleUsers = [];

            for (const user of activeUsers) {
                const lastLogTime = lastLogMap.get(user.email);
                if (!lastLogTime) continue;

                const lastLogMs = new Date(lastLogTime).getTime();
                const idleMinutes = calcIdleMinutes(
                    lastLogMs, now, workStartMs, workEndMs, breakStartMs, breakEndMs
                );
                if (idleMinutes < config.idle_threshold_minutes) continue;

                let lastAlertSent = user.idle_alert_sent_at || 0;
                if (lastAlertSent > 0 && lastLogMs > lastAlertSent) lastAlertSent = 0;

                const idleStartMs = (lastLogMs >= breakEndMs)
                    ? Math.max(lastLogMs, workStartMs)
                    : Math.max(workStartMs, breakEndMs);
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

            if (!idleUsers.length) {
                return res.status(200).json({ message: "No idle users to alert" });
            }

            const eligibleUsers = idleUsers.filter(u => u.lastAlertSent <= alertCooldown);
            if (!eligibleUsers.length) {
                return res.status(200).json({ message: "All idle users are in cooldown or recently reset" });
            }

            eligibleUsers.sort((a, b) => b.idle - a.idle);
            const displayUsers = eligibleUsers.slice(0, config.max_users_per_message);
            const message = buildFriendlyMessage(displayUsers, eligibleUsers, config);

            let sent = false;
            const webhookUrl = config.seatalk_webhook_url || process.env.SEATALK_ALERT_WEBHOOK_URL;
            if (webhookUrl && !webhookUrl.includes("xxx")) {
                const webhookRes = await fetch(webhookUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tag: "text", text: { format: 1, content: message } }),
                });
                sent = webhookRes.ok;
                if (!sent) console.error("Seatalk webhook failed:", await webhookRes.text());
            } else {
                console.warn("Webhook not configured, would send:", message);
                sent = true;
            }

            if (sent && displayUsers.length > 0) {
                await supabase
                    .from("qc_users")
                    .update({ idle_alert_sent_at: now })
                    .in("email", displayUsers.map(u => u.email));
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

    else if (action === "report") {
        // ========== XỬ LÝ BÁO CÁO ==========
        try {
            const { date, year, month, type = "daily", force = "false", export_excel = "false" } = req.query;
            const skipCache = force === "true";

            let report;
            let fileName;

            if (type === "daily") {
                const targetDate = date || getTodayVN();
                report = await getDailyReport(targetDate, skipCache);
                fileName = `qc-daily-report-${targetDate}.xlsx`;
            } else if (type === "weekly") {
                const endDate = date || getTodayVN();
                report = await getWeeklyReport(endDate, skipCache);
                fileName = `qc-weekly-report-${endDate}.xlsx`;
            } else if (type === "monthly") {
                const currentYear = year ? parseInt(year) : new Date().getFullYear();
                const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;
                report = await getMonthlyReport(currentYear, currentMonth, skipCache);
                fileName = `qc-monthly-report-${currentYear}-${currentMonth.toString().padStart(2, "0")}.xlsx`;
            }

            if (export_excel === "true") {
                const wb = generateExcelBuffer(report, type);
                const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
                res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
                res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
                return res.send(buf);
            }

            return res.status(200).json({
                success: true,
                report_type: type,
                generated_at: new Date().toISOString(),
                data: report,
            });
        } catch (error) {
            console.error("Report generation error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    else {
        return res.status(400).json({ error: "Invalid action. Use ?action=alert or ?action=report" });
    }
}