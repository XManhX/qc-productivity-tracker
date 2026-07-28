// lib/cron/helpers.js

/**
 * Các hàm tiện ích dùng chung cho các cron job: alert, report, hourlyReport.
 * Lưu ý: Một số hàm nhận tham số supabase client để linh hoạt (dùng anon key hoặc service role key).
 */

const VN_OFFSET = 7 * 60 * 60 * 1000;

// ==================== DATE / TIME ====================

export function getTodayVN() {
    const now = new Date(Date.now() + VN_OFFSET);
    return now.toISOString().split('T')[0];
}

export function createVNTimestamp(hour, min, nowMs = Date.now()) {
    const vnDate = new Date(nowMs + VN_OFFSET);
    vnDate.setHours(hour, min, 0, 0);
    return vnDate.getTime() - VN_OFFSET;
}

export function getWorkTimestamps(nowMs, config) {
    return {
        workStartMs: createVNTimestamp(
            config.work_start_hour,
            config.work_start_min - (config.work_start_buffer_minutes || 0),
            nowMs
        ),
        workEndMs: createVNTimestamp(
            config.work_end_hour,
            config.work_end_min + (config.work_end_buffer_minutes || 0),
            nowMs
        ),
    };
}

export function getBreakTimestamps(nowMs, config) {
    return {
        breakStartMs: createVNTimestamp(
            config.break_start_hour,
            config.break_start_min,
            nowMs
        ),
        breakEndMs: createVNTimestamp(
            config.break_end_hour,
            config.break_end_min,
            nowMs
        ),
    };
}

export function getPeriodOfDay() {
    const vnHour = new Date(Date.now() + VN_OFFSET).getHours();
    return vnHour < 12 ? 'morning' : 'afternoon';
}

// ==================== STRING ====================

export function capitalizeName(name) {
    if (!name) return '';
    return name
        .trim()
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

// ==================== IDLE CALC ====================

/**
 * Tính idle cho CẢNH BÁO (từ log cuối đến hiện tại)
 */
export function calcIdleMinutes(
    lastLogMs,
    nowMs,
    workStartMs,
    workEndMs,
    breakStartMs,
    breakEndMs
) {
    // Ngoài giờ làm hoặc đang trong giờ nghỉ trưa -> không tính
    if (nowMs < workStartMs || nowMs >= workEndMs) return 0;
    if (nowMs >= breakStartMs && nowMs < breakEndMs) return 0;

    // Mốc bắt đầu: từ log cuối (nhưng không sớm hơn giờ bắt đầu làm)
    const start = Math.max(lastLogMs, workStartMs);
    // Mốc kết thúc: hiện tại (không vượt quá giờ kết thúc)
    const end = Math.min(nowMs, workEndMs);

    if (end <= start) return 0;

    let idleMs = end - start;

    // Trừ đi thời gian nghỉ trưa nếu khoảng [start, end] bao phủ break
    if (start < breakEndMs && end > breakStartMs) {
        const overlapStart = Math.max(start, breakStartMs);
        const overlapEnd = Math.min(end, breakEndMs);
        if (overlapEnd > overlapStart) {
            idleMs -= overlapEnd - overlapStart;
        }
    }

    return Math.max(0, Math.floor(idleMs / 60000));
}

/**
 * Tính idle cho BÁO CÁO (giữa 2 lần log liên tiếp, trừ giờ nghỉ trưa)
 */
export function calcIdleBetweenLogs(
    lastLogMs,
    currentLogMs,
    workStartMs,
    workEndMs,
    breakStartMs,
    breakEndMs
) {
    if (lastLogMs === 0 || currentLogMs <= lastLogMs) return 0;
    let idleMs = currentLogMs - lastLogMs;
    if (
        breakStartMs &&
        breakEndMs &&
        lastLogMs < breakEndMs &&
        currentLogMs > breakStartMs
    ) {
        const overlapStart = Math.max(lastLogMs, breakStartMs);
        const overlapEnd = Math.min(currentLogMs, breakEndMs);
        if (overlapEnd > overlapStart) idleMs -= overlapEnd - overlapStart;
    }
    return Math.max(0, Math.floor(idleMs / 60000));
}

// ==================== CONFIG ====================

/**
 * Lấy cấu hình alert từ DB. Nhận tham số supabase client (có thể là anon hoặc service role).
 */
export async function getAlertConfig(supabase) {
    const { data, error } = await supabase
        .from('qc_alert_config')
        .select('*')
        .eq('id', 1)
        .single();
    if (error || !data) {
        // Fallback config
        return {
            work_start_hour: 8,
            work_start_min: 0,
            work_start_buffer_minutes: 0,
            work_end_hour: 17,
            work_end_min: 0,
            work_end_buffer_minutes: 0,
            break_start_hour: 12,
            break_start_min: 0,
            break_end_hour: 13,
            break_end_min: 0,
            idle_threshold_minutes: 15,
            cooldown_minutes: 30,
            max_users_per_message: 10,
            seatalk_webhook_url: null,
            report_seatalk_webhook_url: null,
            report_enabled: true,
            report_hour_start: 8,
            report_hour_end: 20,
            report_minute: 10,
            report_only_workdays: true,
        };
    }
    return data;
}

// ==================== DATA FETCH ====================

export async function fetchActiveUsers(supabase) {
    const { data, error } = await supabase
        .from('qc_users')
        .select(
            'email, name, is_active, role_id, qc_roles!inner(role_key, display_name)'
        )
        .eq('is_active', true);

    if (error) throw new Error(`Lỗi lấy users: ${error.message}`);
    if (!data?.length) return { userMap: new Map(), roleKeys: new Set() };

    const userMap = new Map();
    const roleKeys = new Set();
    data.forEach(u => {
        userMap.set(u.email, {
            email: u.email,
            name: u.name || '',
            role_key: u.qc_roles.role_key,
            display_name: u.qc_roles.display_name,
            total: 0,
            hourly: {},
        });
        roleKeys.add(u.qc_roles.role_key);
    });
    return { userMap, roleKeys };
}

export async function fetchRoleDetails(supabase, roleKeys) {
    const { data, error } = await supabase
        .from('qc_roles')
        .select(
            'role_key, display_name, qc_productivity_targets(low_threshold, medium_threshold)'
        )
        .in('role_key', [...roleKeys]);

    if (error) throw new Error(`Lỗi lấy role: ${error.message}`);

    const map = new Map();
    (data || []).forEach(r => {
        const t = r.qc_productivity_targets?.[0] || {};
        map.set(r.role_key, {
            display_name: r.display_name || r.role_key,
            low_threshold: t.low_threshold ?? 10,
            medium_threshold: t.medium_threshold ?? 16,
        });
    });
    roleKeys.forEach(k => {
        if (!map.has(k))
            map.set(k, {
                display_name: k,
                low_threshold: 10,
                medium_threshold: 16,
            });
    });
    return map;
}

export async function mergeStats(supabase, targetDate, userMap) {
    const emails = [...userMap.keys()];
    if (emails.length === 0) return;

    const { data, error } = await supabase.rpc('get_dashboard_stats', {
        target_date: targetDate,
        user_emails: emails,
    });
    if (error) throw new Error(`Lỗi thống kê: ${error.message}`);

    (data || []).forEach(row => {
        const user = userMap.get(row.email);
        if (!user) return;
        user.total = row.total || 0;
        if (row.hourly) {
            const hObj = {};
            Object.entries(row.hourly).forEach(([h, c]) => {
                const hour = parseInt(h, 10);
                if (hour >= 0 && hour < 24) hObj[hour] = c;
            });
            user.hourly = hObj;
        }
    });
}

// ==================== MESSAGES ====================

const GREETINGS_GENERAL = [
    '🤗 Xin chào cả nhà yêu quý!',
    '💖 Cả nhà thân mến, cùng giúp nhau giữ vững tinh thần nhé!',
    '✨ Một ngày mới, một cơ hội mới, đừng để thời gian trôi qua lãng phí!',
    '🌱 Hãy cùng nhau vun đắp cho buổi làm việc thêm xanh tươi!',
    '🍃 Cùng hít thở thật sâu và quay lại công việc thôi nào!',
    '🕊️ Nhẹ nhàng như làn gió, mình nhắc nhau cùng cố gắng!',
    '🏵️ Xin chào những con ong chăm chỉ của tổ QC!',
    '🍀 Chào team, chúc mọi người một buổi làm việc hiệu quả!',
    '🧋 Trà sữa thì ngọt, nhưng công việc còn ngọt hơn, cùng làm nào!',
    '💎 Mỗi bạn là một viên ngọc, hãy tỏa sáng trong công việc!',
    '🌠 Cùng hướng tới những vì sao, bắt đầu bằng việc tập trung nhé!',
    '🎪 Chào mừng đến với rạp xiếc QC, tiết mục hôm nay: quay lại làm việc!',
    '🥁 Trống điểm danh, ai đang online giơ tay lên!',
    '😊 Hế lô cả team, chúc mọi người một buổi làm việc thật suôn sẻ!',
    '💐 Gửi ngàn lời chúc tốt đẹp nhất đến team mình!',
    '🚀 Nào, cùng tăng tốc cho một buổi làm việc năng suất!',
    '🍂 Một lời nhắc nhỏ xinh từ hệ thống, đừng giận nhé!',
    '🎈 Cùng kiểm tra nhịp độ làm việc một chút nha cả nhà!',
    '🌼 Dù nắng hay mưa, chúng ta vẫn làm việc hết mình!',
    '🎋 Chúc team một buổi làm việc nhiều may mắn và ít bug!',
    '🍀 Một lời nhắc nhẹ nhàng cho buổi làm việc hiệu quả!',
    '🌈 Cùng nhau giữ vững phong độ nào các chiến binh QC!',
    '🎯 Tập trung cao độ – thành công sẽ đến!',
];

const GREETINGS_MORNING = [
    '☀️ Chúc mọi người một buổi sáng tràn đầy năng lượng!',
    '🌞 Chào buổi sáng, hy vọng mọi người đầy nhiệt huyết!',
    '🌻 Chào buổi sáng, cùng nhau giữ nhịp làm việc nào!',
    '☕ Buổi sáng tốt lành, một ngày làm việc hiệu quả bắt đầu từ đây!',
    '🥐 Ăn sáng no nê chưa nào? Vào guồng công việc thôi!',
    '🌅 Mặt trời đã lên cao, tập trung làm việc nào các bạn!',
    '🍳 Một bữa sáng ngon lành, một ngày làm việc tuyệt vời!',
    '🧃 Sẵn sàng cho một buổi sáng bùng nổ nào!',
];

const GREETINGS_AFTERNOON = [
    '⏰ Điểm danh sự tập trung buổi chiều!',
    '🌞 Chào buổi chiều, hy vọng mọi người vẫn đầy nhiệt huyết!',
    '🍭 Nhẹ nhàng như que kẹo, mình nhắc nhau cùng tập trung nào!',
    '🍃 Buổi chiều mát mẻ, làm việc thật hăng say nhé!',
    '🌇 Chiều tà buông xuống, đừng để công việc trôi theo mây!',
    '🧉 Một ly trà đá buổi chiều cho tỉnh táo, rồi làm tiếp nào!',
    '☀️ Nắng chiều vẫn rực rỡ, tinh thần mình cũng phải rực rỡ theo!',
    '🌆 Hoàng hôn sắp đến, nhưng deadline thì không chờ, cố lên!',
    '🍪 Bánh quy buổi chiều ai mua nào? Nhớ quay lại làm việc nha!',
];

const MAIN_MESSAGES = [
    'Cùng điểm qua một vài bạn đã rời bàn phím hơi lâu nhé:',
    'Danh sách những bạn cần quay lại guồng quay công việc nè:',
    'Các bạn sau đây có vẻ đã thả lỏng hơi lâu, mình cùng nhắc nhẹ nhé:',
    'Điểm danh những chiến binh đang offline hơi lâu nè:',
    'Những bạn dưới đây cần nhanh chóng trở lại để không bỏ lỡ nhịp độ chung:',
    'Team mình có vài bạn đang “lạc trôi”, cùng gọi họ về nhé:',
    'Đừng để bản thân bị bỏ lại, các bạn sau cần hồi sinh ngay:',
    'Một vài cái tên đã vắng bóng trên hệ thống một lúc rồi:',
    'Tập trung nào các bạn ơi, đừng để “idle” chiến thắng:',
    'List những bạn đang có dấu hiệu “mất kết nối” với công việc:',
    'Cùng điểm danh những người cần tăng tốc ngay bây giờ:',
    'Hỡi những linh hồn đang bay bổng, hãy quay về với QC team!',
    'Nhẹ nhàng nhắc nhở một vài bạn đang nghỉ tay hơi lâu:',
    'Có ai đó quên mất bàn phím của mình rồi, xem danh sách nè:',
    'Chú ý, chú ý! Những bạn sau cần quay lại trận địa ngay:',
    'Đừng để đồng nghiệp phải chờ, các bạn sau cần vào việc gấp:',
    'Ơ kìa, ai đang “thả hồn theo mây” thế này?',
    'Cùng gọi tên những người đang thư giãn hơi lâu:',
    'Hãy nhìn vào danh sách và tự hỏi: “Mình có đang ở đây không?”',
    'Điểm danh những “ca sĩ” đang tạm rời sân khấu:',
    'Đừng biến bàn làm việc thành giường ngủ, quay lại thôi!',
    'Danh sách những bạn cần F5 bản thân ngay lập tức:',
    'Cùng xem ai đang cần reset tinh thần làm việc:',
    'Hệ thống báo động: một số bạn đã rời khỏi trận địa!',
    'Mất tích tạm thời, tìm ngay những bạn sau:',
    'Báo cáo tình hình: có người đang “ngủ đông” giữa ca làm!',
];

const CLOSINGS = [
    '💪 Cố gắng duy trì sự tập trung nhé, mọi người!',
    '🌸 Cảm ơn cả nhà đã luôn nỗ lực, cùng cố lên nào!',
    '🚀 Hi vọng chúng ta sẽ sớm bắt kịp tiến độ, cảm ơn mọi người!',
    '✨ Mình biết mọi người đã rất chăm chỉ, chỉ là một chút lơ là thôi, cùng quay lại nào!',
    '💖 Cả nhà mình cùng hỗ trợ nhau để hoàn thành công việc thật tốt nhé!',
    '🍃 Một chút gió nhẹ nhắc nhở, không có gì nghiêm trọng, chỉ cần quay lại là ổn thôi!',
    '🏆 Cùng giữ vững phong độ để đạt kết quả tốt nhất nha!',
    '🎯 Tập trung lại nào, chúng ta làm được mà!',
    '🌈 Sau cơn mưa trời lại sáng, quay lại làm việc thôi!',
    '🌷 Chúc mọi người một buổi làm việc còn lại thật hiệu quả!',
    '🍀 Đừng lo lắng, chỉ cần trở lại đúng lúc là mọi thứ vẫn ổn!',
    '🌟 Mỗi phút giây đều quý giá, hãy cùng tận dụng thật tốt!',
    '🔥 Hãy để sự chuyên nghiệp dẫn lối, quay trở lại công việc nào!',
    '💎 Các bạn là những viên ngọc sáng, đừng để bụi thời gian che phủ!',
    '🎈 Nhẹ nhàng thôi, nhưng hãy hành động ngay nhé!',
    '🍭 Một chút nhắc nhở ngọt ngào, mong mọi người quay lại!',
    '🎀 Đừng để thành tích của team bị ảnh hưởng chỉ vì vài phút lơ là!',
    '💪 Cùng thắt chặt dây an toàn, chuẩn bị tăng tốc!',
    '🛎️ Chuông đã reo, mời mọi người trở lại vị trí!',
    '🍀 Chúc team luôn giữ được nhịp làm việc ổn định!',
    '🏅 Cùng hướng đến danh hiệu “Team chăm chỉ nhất”!',
    '🧠 Tập trung là sức mạnh, đừng lãng phí nó!',
    '🌊 Hãy như sóng biển, luôn tiến về phía trước!',
];

const CLOSING_FOOTER = [
    '\n\n🙏 Cảm ơn sự cố gắng của tất cả mọi người!',
    '\n\n💞 Cùng nhau tiến bước, không ai bị bỏ lại phía sau!',
    '\n\n🌟 Tin rằng buổi làm việc còn lại sẽ tuyệt vời hơn!',
    '\n\n🔥 Cảm ơn team, tiếp tục chiến thôi!',
    '\n\n🌸 Chúc team một ngày làm việc vui vẻ và hiệu quả!',
    '\n\n🍀 Cùng nhau giữ lửa nhiệt huyết nhé!',
    '\n\n✨ Cảm ơn mọi người đã lắng nghe, quay lại thôi nào!',
    '\n\n🎯 Hẹn gặp lại ở những báo cáo thành công!',
    '\n\n💖 Teamwork makes the dream work! Cùng cố gắng nhé!',
    '\n\n🚀 Cùng bay cao nào các chiến binh!',
    '\n\n🌻 Mỗi người một tay, việc gì cũng xong!',
    '\n\n🍂 Thư giãn xong rồi, quay lại và tỏa sáng thôi!',
    '\n\n💐 Chúc team buổi chiều nhiều niềm vui và ít lỗi!',
    '\n\n🍀 Cảm ơn vì đã luôn bên nhau, cùng tiến lên!',
    '\n\n🎈 Hãy biến những phút giây còn lại thành vàng!',
    '\n\n☕ Nhấp một ngụm trà/cà phê, rồi làm việc thôi!',
    '\n\n🕊️ Bình yên trong tâm hồn, hiệu quả trong công việc!',
    '',
];

const SMALL_NOTES = [
    '💡 Mẹo nhỏ: Đặt chuông nhắc 30 phút một lần để giữ nhịp làm việc.',
    '☕ Một tách cà phê có thể giúp bạn tỉnh táo hơn, nhưng đừng quên quay lại nhé!',
    '🎵 Nghe một bản nhạc yêu thích rồi quay lại làm việc hiệu quả hơn!',
    '🧘 Đứng lên vươn vai vài phút rồi trở lại, đừng để idle quá lâu!',
    '📌 Hãy nhớ rằng mỗi phút trôi qua đều ảnh hưởng đến mục tiêu chung.',
    '⌨️ Bàn phím đang chờ bạn, đừng để nó cô đơn quá lâu!',
    '📈 Chỉ cần tập trung thêm chút nữa, kết quả sẽ bất ngờ!',
    '🏃 Dậy đi lại một chút cho khỏe, nhưng nhớ quay về với công việc nha!',
    '💬 Rủ đồng nghiệp cùng làm việc để tăng động lực!',
    '🎯 Mục tiêu hôm nay đã đạt được bao nhiêu phần trăm rồi?',
    '🍀 Một chút nghỉ ngơi là tốt, nhưng đừng quên deadline nhé!',
    '🧩 Mỗi phút làm việc là một mảnh ghép thành công.',
    '🖱️ Chuột và bàn phím đang chờ bạn trở lại!',
    '🏆 Hãy giữ danh hiệu “Nhân viên chăm chỉ” của bạn!',
    '⏳ Thời gian không chờ đợi ai, hãy quay lại ngay!',
    '🍫 Thưởng cho mình một thanh socola rồi làm việc tiếp nào!',
];

function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function buildFriendlyMessage(displayUsers, eligibleUsers, config) {
    const nowStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const period = getPeriodOfDay();
    const periodGreetings = period === 'morning' ? GREETINGS_MORNING : GREETINGS_AFTERNOON;
    const allGreetings = [...GREETINGS_GENERAL, ...periodGreetings];
    const greeting = randomItem(allGreetings);

    const mainMsg = randomItem(MAIN_MESSAGES);
    const closing = randomItem(CLOSINGS);
    const footer = randomItem(CLOSING_FOOTER);
    const note = Math.random() < 0.35 ? `\n\n${randomItem(SMALL_NOTES)}` : '';

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