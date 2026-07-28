// lib/cron/report.js
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ========== CONSTANTS & UTILS ==========
const VN_OFFSET = 7 * 3600 * 1000;

const getTodayVN = () => new Date(Date.now() + VN_OFFSET).toISOString().split('T')[0];

const capitalizeName = (name) => {
    if (!name) return name;
    return name
        .trim()
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
};

/** Tính số phút idle giữa 2 mốc thời gian (đã trừ giờ nghỉ trưa) */
const calcIdleBetweenLogs = (lastMs, currMs, breakStartMs, breakEndMs) => {
    if (lastMs === 0 || currMs <= lastMs) return 0;
    let idleMs = currMs - lastMs;
    if (breakStartMs && breakEndMs && lastMs < breakEndMs && currMs > breakStartMs) {
        const overlapStart = Math.max(lastMs, breakStartMs);
        const overlapEnd = Math.min(currMs, breakEndMs);
        if (overlapEnd > overlapStart) idleMs -= (overlapEnd - overlapStart);
    }
    return Math.max(0, Math.floor(idleMs / 60000));
};

/** Lấy cấu hình từ DB, fallback nếu lỗi */
const getConfig = async () => {
    const { data, error } = await supabase
        .from('qc_alert_config')
        .select('*')
        .eq('id', 1)
        .single();

    if (error || !data) {
        return {
            work_start_hour: 8, work_start_min: 0,
            work_end_hour: 17, work_end_min: 0,
            break_start_hour: 12, break_start_min: 0,
            break_end_hour: 13, break_end_min: 0,
            excluded_emails: [],
        };
    }
    return data;
};

// ========== CACHE ==========
const getCachedReport = async (type, dateKey) => {
    try {
        const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
        const { data } = await supabase
            .from('qc_reports')
            .select('data, created_at')
            .eq('report_type', type)
            .eq('report_date', dateKey)
            .gt('created_at', oneHourAgo)
            .single();
        return data?.data || null;
    } catch (e) {
        console.error('Cache read error:', e);
        return null;
    }
};

const saveCachedReport = async (type, dateKey, data) => {
    try {
        await supabase.from('qc_reports').upsert({
            report_type: type,
            report_date: dateKey,
            data,
            updated_at: new Date().toISOString(),
        });
    } catch (e) {
        console.error('Cache save error:', e);
    }
};

// ========== BÁO CÁO NGÀY ==========
/**
 * Tạo báo cáo chi tiết cho một ngày.
 * @returns {object} report
 */
const getDailyReport = async (dateStr, skipCache = false) => {
    if (!skipCache) {
        const cached = await getCachedReport('daily', dateStr);
        if (cached) return cached;
    }

    try {
        const startISO = `${dateStr}T00:00:00+07:00`;
        const endISO = `${dateStr}T23:59:59+07:00`;

        // Lấy logs và users song song
        const [logsRes, usersRes, config] = await Promise.all([
            supabase.from('qc_logs').select('operator, created_at, page')
                .gte('created_at', startISO).lte('created_at', endISO)
                .order('created_at', { ascending: true }),
            supabase.from('qc_users').select('email, name, is_active'),
            getConfig(),
        ]);

        const logs = logsRes.data || [];
        const users = usersRes.data || [];
        const excluded = config.excluded_emails || [];
        const activeUsers = users.filter(u => u.is_active && !excluded.includes(u.email));

        // Khởi tạo user stats
        const userMap = new Map();
        activeUsers.forEach(u => userMap.set(u.email, {
            name: u.name || u.email,
            email: u.email,
            total_idle_minutes: 0,
            log_count: 0,
            actual_work_minutes: 0,
            short_idle: 0,
            medium_idle: 0,
            long_idle: 0,
            qc_count: 0,
        }));

        // Gom log theo user
        const logsByUser = new Map();
        logs.forEach(log => {
            if (!userMap.has(log.operator)) return;
            if (!logsByUser.has(log.operator)) logsByUser.set(log.operator, []);
            logsByUser.get(log.operator).push({
                ts: new Date(log.created_at).getTime(),
                page: log.page || '',
            });
        });

        // Mốc thời gian
        const dateBase = new Date(`${dateStr}T00:00:00+07:00`).getTime();
        const breakStart = dateBase + config.break_start_hour * 3600000 + config.break_start_min * 60000;
        const breakEnd = dateBase + config.break_end_hour * 3600000 + config.break_end_min * 60000;

        let totalActualMinutes = 0;
        let totalIdleMinutes = 0;
        let longIdleEvents = 0;
        let totalQcCount = 0;

        for (const [email, stats] of userMap) {
            const entries = logsByUser.get(email) || [];
            stats.log_count = entries.length;

            // Tính thời gian làm việc thực tế (log đầu -> log cuối, trừ break)
            if (entries.length >= 2) {
                const times = entries.map(e => e.ts);
                const first = times[0], last = times[times.length - 1];
                let sessionMs = last - first;
                if (first < breakEnd && last > breakStart) {
                    const overlapStart = Math.max(first, breakStart);
                    const overlapEnd = Math.min(last, breakEnd);
                    if (overlapEnd > overlapStart) sessionMs -= (overlapEnd - overlapStart);
                }
                stats.actual_work_minutes = Math.max(0, Math.floor(sessionMs / 60000));
            }
            totalActualMinutes += stats.actual_work_minutes;

            // Đếm sản lượng QC (page='qc')
            entries.forEach(e => {
                if (e.page === 'qc') stats.qc_count++;
            });
            totalQcCount += stats.qc_count;

            // Tính idle giữa các cặp log liên tiếp
            if (entries.length >= 2) {
                const times = entries.map(e => e.ts);
                for (let i = 1; i < times.length; i++) {
                    const idle = calcIdleBetweenLogs(times[i - 1], times[i], breakStart, breakEnd);
                    if (idle > 0) {
                        stats.total_idle_minutes += idle;
                        if (idle < 15) stats.short_idle++;
                        else if (idle < 30) stats.medium_idle++;
                        else {
                            stats.long_idle++;
                            longIdleEvents++;
                        }
                    }
                }
            }
            totalIdleMinutes += stats.total_idle_minutes;
        }

        const userDetails = Array.from(userMap.values());
        const activeCount = userDetails.filter(u => u.log_count > 0).length;

        // Giờ cao điểm hoạt động
        const hourCounts = new Array(24).fill(0);
        logs.forEach(log => {
            if (userMap.has(log.operator)) hourCounts[new Date(log.created_at).getHours()]++;
        });
        const peakHours = hourCounts
            .map((count, hour) => ({ hour, log_count: count }))
            .sort((a, b) => b.log_count - a.log_count)
            .slice(0, 3);

        const report = {
            summary: {
                report_date: dateStr,
                total_qc: activeUsers.length,
                active_count: activeCount,
                percent_active: activeUsers.length ? Math.round((activeCount / activeUsers.length) * 100) : 0,
                total_work_hours: Math.round((totalActualMinutes / 60) * 10) / 10,
                total_idle_hours: Math.round((totalIdleMinutes / 60) * 10) / 10,
                idle_percent: totalActualMinutes ? Math.round((totalIdleMinutes / totalActualMinutes) * 100) : 0,
                avg_idle_per_person: activeCount ? Math.round(totalIdleMinutes / activeCount) : 0,
                long_idle_events: longIdleEvents,
                total_qc_count: totalQcCount,
            },
            idle_breakdown: {
                short_idle: userDetails.reduce((s, u) => s + u.short_idle, 0),
                medium_idle: userDetails.reduce((s, u) => s + u.medium_idle, 0),
                long_idle: userDetails.reduce((s, u) => s + u.long_idle, 0),
            },
            peak_activity_hours: peakHours,
            user_details: userDetails,
            top_performers: userDetails.sort((a, b) => a.total_idle_minutes - b.total_idle_minutes).slice(0, 3),
            needs_attention: userDetails.sort((a, b) => b.total_idle_minutes - a.total_idle_minutes).slice(0, 3),
        };

        await saveCachedReport('daily', dateStr, report);
        return report;
    } catch (err) {
        console.error('getDailyReport error:', err);
        // fallback empty
        return {
            summary: {
                report_date: dateStr, total_qc: 0, active_count: 0, percent_active: 0,
                total_work_hours: 0, total_idle_hours: 0, idle_percent: 0,
                avg_idle_per_person: 0, long_idle_events: 0, total_qc_count: 0,
            },
            idle_breakdown: { short_idle: 0, medium_idle: 0, long_idle: 0 },
            peak_activity_hours: [],
            user_details: [],
            top_performers: [],
            needs_attention: [],
        };
    }
};

// ========== TỔNG HỢP NHIỀU NGÀY ==========
/**
 * Tổng hợp dữ liệu từ startDate đến endDate.
 * Chỉ gọi getDailyReport một lần mỗi ngày, sau đó gộp summary và user_details.
 */
const getPeriodReport = async (startStr, endStr) => {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const dailyReports = []; // Lưu toàn bộ report để tránh gọi lại

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const dayReport = await getDailyReport(dateStr, true);
        dailyReports.push({ date: dateStr, report: dayReport });
    }

    // Gộp summary
    const totalSummary = dailyReports.reduce((acc, { report }) => {
        const s = report.summary;
        return {
            total_work_hours: acc.total_work_hours + (s.total_work_hours || 0),
            total_idle_hours: acc.total_idle_hours + (s.total_idle_hours || 0),
            long_idle_events: acc.long_idle_events + (s.long_idle_events || 0),
            total_qc_count: acc.total_qc_count + (s.total_qc_count || 0),
        };
    }, { total_work_hours: 0, total_idle_hours: 0, long_idle_events: 0, total_qc_count: 0 });

    totalSummary.idle_percent = totalSummary.total_work_hours
        ? Math.round((totalSummary.total_idle_hours / totalSummary.total_work_hours) * 100) : 0;

    // Gộp user_details
    const userMap = new Map();
    dailyReports.forEach(({ report }) => {
        (report.user_details || []).forEach(u => {
            const existing = userMap.get(u.email);
            if (!existing) {
                userMap.set(u.email, {
                    name: u.name,
                    email: u.email,
                    total_idle_minutes: u.total_idle_minutes || 0,
                    log_count: u.log_count || 0,
                    actual_work_minutes: u.actual_work_minutes || 0,
                    short_idle: u.short_idle || 0,
                    medium_idle: u.medium_idle || 0,
                    long_idle: u.long_idle || 0,
                    qc_count: u.qc_count || 0,
                });
            } else {
                existing.total_idle_minutes += u.total_idle_minutes || 0;
                existing.log_count += u.log_count || 0;
                existing.actual_work_minutes += u.actual_work_minutes || 0;
                existing.short_idle += u.short_idle || 0;
                existing.medium_idle += u.medium_idle || 0;
                existing.long_idle += u.long_idle || 0;
                existing.qc_count += u.qc_count || 0;
            }
        });
    });

    const daysSummary = dailyReports.map(({ date, report }) => ({ date, ...report.summary }));

    return {
        summary: totalSummary,
        daily_breakdown: daysSummary,
        user_details: Array.from(userMap.values()),
    };
};

// ========== BÁO CÁO TUẦN ==========
const getWeeklyReport = async (endDateStr, skipCache = false) => {
    if (!skipCache) {
        const cached = await getCachedReport('weekly', endDateStr);
        if (cached) return cached;
    }

    try {
        const endDate = new Date(endDateStr);
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 6);
        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        const thisWeek = await getPeriodReport(startStr, endStr);
        const prevStart = new Date(startDate); prevStart.setDate(prevStart.getDate() - 7);
        const prevEnd = new Date(endDate); prevEnd.setDate(prevEnd.getDate() - 7);
        const lastWeek = await getPeriodReport(
            prevStart.toISOString().split('T')[0],
            prevEnd.toISOString().split('T')[0]
        );

        const allUsers = thisWeek.user_details;
        const excellent = allUsers.filter(u => u.total_idle_minutes < 60);
        const needsSupport = allUsers.filter(u => u.total_idle_minutes >= 180);

        const currentIdle = thisWeek.summary.total_idle_hours || 0;
        const lastIdle = lastWeek.summary.total_idle_hours || 0;
        const improvement = lastIdle === 0
            ? (currentIdle === 0 ? '0%' : 'N/A')
            : `${Math.round(((lastIdle - currentIdle) / lastIdle) * 100)}%`;

        const qcsImproved = allUsers.filter(u => {
            const prev = lastWeek.user_details.find(p => p.email === u.email);
            return prev && u.total_idle_minutes < prev.total_idle_minutes;
        }).length;

        const alertReduction = lastWeek.summary.long_idle_events
            ? Math.round(((lastWeek.summary.long_idle_events - thisWeek.summary.long_idle_events) / lastWeek.summary.long_idle_events) * 100)
            : 'N/A';

        const report = {
            summary: {
                week_start: startStr,
                week_end: endStr,
                ...thisWeek.summary,
                improvement_from_last_week: improvement,
                qcs_improved: qcsImproved,
                improvement_rate: allUsers.length ? Math.round((qcsImproved / allUsers.length) * 100) : 0,
                alert_reduction: alertReduction,
            },
            user_classification: {
                excellent_count: excellent.length,
                excellent_percent: allUsers.length ? Math.round((excellent.length / allUsers.length) * 100) : 0,
                needs_improve_count: allUsers.filter(u => u.total_idle_minutes >= 60 && u.total_idle_minutes < 180).length,
                needs_support_count: needsSupport.length,
                support_percent: allUsers.length ? Math.round((needsSupport.length / allUsers.length) * 100) : 0,
            },
            daily_breakdown: thisWeek.daily_breakdown,
            ranking: allUsers.sort((a, b) => a.total_idle_minutes - b.total_idle_minutes).slice(0, 10),
            needs_support_list: needsSupport.map(u => u.name),
        };

        await saveCachedReport('weekly', endStr, report);
        return report;
    } catch (err) {
        console.error('getWeeklyReport error:', err);
        return { summary: {}, daily_breakdown: [], ranking: [] }; // fallback tối thiểu
    }
};

// ========== BÁO CÁO THÁNG ==========
const getMonthlyReport = async (year, month, skipCache = false) => {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (!skipCache) {
        const cached = await getCachedReport('monthly', key);
        if (cached) return cached;
    }

    try {
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        const thisMonth = await getPeriodReport(
            firstDay.toISOString().split('T')[0],
            lastDay.toISOString().split('T')[0]
        );

        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        const prevFirst = new Date(prevYear, prevMonth - 1, 1);
        const prevLast = new Date(prevYear, prevMonth, 0);
        const lastMonth = await getPeriodReport(
            prevFirst.toISOString().split('T')[0],
            prevLast.toISOString().split('T')[0]
        );

        const currentIdleHours = thisMonth.summary.total_idle_hours || 0;
        const lastIdleHours = lastMonth.summary.total_idle_hours || 0;
        const savedHours = Math.round((lastIdleHours - currentIdleHours) * 10) / 10;
        const improvement = lastIdleHours === 0
            ? (currentIdleHours === 0 ? '0%' : 'N/A')
            : `${Math.round(((lastIdleHours - currentIdleHours) / lastIdleHours) * 100)}%`;

        const recommendations = [];
        if (thisMonth.summary.idle_percent > 15) recommendations.push('Giảm idle >30p, họp QC có idle cao');
        if ((thisMonth.user_details?.filter(u => u.total_idle_minutes >= 180).length || 0) > 3) recommendations.push('Tổ chức training cho QC cần hỗ trợ');
        if ((thisMonth.summary.long_idle_events || 0) > (lastMonth.summary.long_idle_events || 0)) recommendations.push('Xem lại cấu hình cảnh báo');
        else recommendations.push('Duy trì hiệu suất, tiếp tục theo dõi');

        const report = {
            summary: {
                year, month,
                month_start: firstDay.toISOString().split('T')[0],
                month_end: lastDay.toISOString().split('T')[0],
                ...thisMonth.summary,
                improvement_over_last_month: improvement,
                saved_hours: savedHours,
                saved_fte: Math.round((savedHours / 160) * 100) / 100,
                estimated_salary_saved_million: Math.round(savedHours * 50),
                target_next_month: thisMonth.summary.idle_percent ? Math.round(thisMonth.summary.idle_percent * 0.8) : 10,
            },
            top_performers: thisMonth.user_details.sort((a, b) => a.total_idle_minutes - b.total_idle_minutes).slice(0, 10),
            needs_support_list: thisMonth.user_details.filter(u => u.total_idle_minutes > 720).map(u => u.name),
            recommendations,
        };

        await saveCachedReport('monthly', key, report);
        return report;
    } catch (err) {
        console.error('getMonthlyReport error:', err);
        return { summary: {}, recommendations: [] };
    }
};

// ========== GỬI SEATALK ==========
const buildMessage = (report, type) => {
    const s = report.summary || {};
    const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    let msg = '';

    if (type === 'daily') {
        msg += `📊 **BÁO CÁO NGÀY** - ${s.report_date}\n⏰ ${now}\n\n`;
        msg += `👥 QC online: ${s.active_count}/${s.total_qc} (${s.percent_active}%)\n`;
        msg += `⏳ Tổng idle: ${s.total_idle_hours}h (${s.idle_percent}%)\n`;
        msg += `⏱️ Idle >30p: ${s.long_idle_events} lần\n`;
        msg += `🕒 Làm việc: ${s.total_work_hours}h\n`;
        msg += `🔢 Sản lượng QC: ${s.total_qc_count || 0} log\n\n`;
        if (report.needs_attention?.length) {
            msg += `⚠️ Cần chú ý:\n`;
            report.needs_attention.slice(0, 3).forEach((u, i) => {
                msg += `${i + 1}. ${capitalizeName(u.name)} - idle ${u.total_idle_minutes}p (QC: ${u.qc_count})\n`;
            });
        }
    } else if (type === 'weekly') {
        msg += `📈 **BÁO CÁO TUẦN** (${s.week_start} → ${s.week_end})\n⏰ ${now}\n\n`;
        msg += `⏳ Tổng idle: ${s.total_idle_hours}h (${s.idle_percent}%)\n`;
        msg += `📉 Cải thiện: ${s.improvement_from_last_week} vs tuần trước\n`;
        msg += `👥 Xuất sắc (<60p): ${report.user_classification?.excellent_count} (${report.user_classification?.excellent_percent}%)\n`;
        msg += `🆘 Cần hỗ trợ: ${report.user_classification?.needs_support_count}\n`;
        msg += `🔢 Sản lượng QC: ${s.total_qc_count || 0} log\n`;
        if (report.ranking?.length) {
            msg += `\n🏆 Top chăm chỉ:\n`;
            report.ranking.slice(0, 3).forEach((u, i) => {
                msg += `${i + 1}. ${capitalizeName(u.name)} - idle ${u.total_idle_minutes}p (QC: ${u.qc_count})\n`;
            });
        }
    } else if (type === 'monthly') {
        msg += `📅 **BÁO CÁO THÁNG** ${s.month}/${s.year}\n⏰ ${now}\n\n`;
        msg += `⏳ Tổng idle: ${s.total_idle_hours}h (${s.idle_percent}%)\n`;
        msg += `📉 Cải thiện: ${s.improvement_over_last_month} vs tháng trước\n`;
        msg += `💰 Tiết kiệm: ${s.saved_hours}h (~${s.estimated_salary_saved_million}tr)\n`;
        msg += `🎯 Mục tiêu tháng sau: <${s.target_next_month}%\n`;
        msg += `🔢 Sản lượng QC: ${s.total_qc_count || 0} log\n`;
        if (report.top_performers?.length) {
            msg += `\n🌟 Tiêu biểu:\n`;
            report.top_performers.slice(0, 5).forEach((u, i) => {
                msg += `${i + 1}. ${capitalizeName(u.name)} - idle ${u.total_idle_minutes}p (QC: ${u.qc_count})\n`;
            });
        }
        if (report.recommendations?.length) {
            msg += `\n💡 Gợi ý:\n` + report.recommendations.map(r => `• ${r}`).join('\n');
        }
    }

    msg += `\n🤖 QC Monitor`;
    return msg;
};

const sendToSeatalk = async (report, type) => {
    if (!report.summary || report.summary.active_count === 0) {
        console.log('Không có QC hoạt động, bỏ qua gửi báo cáo.');
        return true;
    }

    const { data: config } = await supabase
        .from('qc_alert_config')
        .select('seatalk_webhook_url, report_seatalk_webhook_url')
        .eq('id', 1).single();

    const webhook = config?.report_seatalk_webhook_url || config?.seatalk_webhook_url;
    if (!webhook || webhook.includes('xxx')) {
        console.log('Webhook chưa cấu hình, sẽ gửi:', report.summary);
        return true;
    }

    const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tag: 'text',
            text: { format: 1, content: buildMessage(report, type) },
        }),
    });

    if (!res.ok) console.error('Gửi Seatalk lỗi:', await res.text());
    return res.ok;
};

// ========== XUẤT EXCEL ==========
const generateExcel = (report, type) => {
    const wb = XLSX.utils.book_new();

    // Sheet Tổng quan
    const summaryData = [
        { 'Chỉ số': 'Tổng số QC', 'Giá trị': report.summary.total_qc },
        { 'Chỉ số': 'QC online', 'Giá trị': report.summary.active_count },
        { 'Chỉ số': 'Tổng giờ làm việc (thực tế)', 'Giá trị': report.summary.total_work_hours },
        { 'Chỉ số': 'Tổng giờ idle', 'Giá trị': report.summary.total_idle_hours },
        { 'Chỉ số': 'Tỷ lệ idle', 'Giá trị': `${report.summary.idle_percent}%` },
        { 'Chỉ số': 'TB idle/QC (phút)', 'Giá trị': report.summary.avg_idle_per_person },
        { 'Chỉ số': 'Idle >30p (lần)', 'Giá trị': report.summary.long_idle_events },
        { 'Chỉ số': 'Sản lượng QC (log)', 'Giá trị': report.summary.total_qc_count || 0 },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Tổng quan');

    // Sheet Phân loại idle
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
        { 'Loại': 'Dưới 15 phút', 'Số lần': report.idle_breakdown.short_idle },
        { 'Loại': '15-30 phút', 'Số lần': report.idle_breakdown.medium_idle },
        { 'Loại': 'Hơn 30 phút', 'Số lần': report.idle_breakdown.long_idle },
    ]), 'Phân loại idle');

    // Sheet Chi tiết QC
    const userRows = (report.user_details || []).map(u => ({
        'Tên': u.name,
        'Email': u.email,
        'Idle (phút)': u.total_idle_minutes,
        'Số log': u.log_count,
        'Thời gian làm việc (phút)': u.actual_work_minutes,
        'Sản lượng QC': u.qc_count || 0,
        'Idle ngắn': u.short_idle,
        'Idle TB': u.medium_idle,
        'Idle dài': u.long_idle,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(userRows), 'Chi tiết QC');

    // Sheet Xếp hạng (tuần/tháng)
    if (type === 'weekly' || type === 'monthly') {
        const rank = report.ranking || report.top_performers || [];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
            rank.map(u => ({
                'Tên': u.name,
                'Email': u.email,
                'Idle (phút)': u.total_idle_minutes,
                'Sản lượng QC': u.qc_count || 0,
            }))
        ), 'Xếp hạng');
    }

    return wb;
};

// ========== MAIN HANDLER ==========
export default async function handler(req, res) {
    try {
        const { date, year, month, type = 'daily', force = 'false', export_excel = 'false', send = 'false' } = req.query;
        const skipCache = force === 'true';
        let report, fileName;

        switch (type) {
            case 'daily': {
                const d = date || getTodayVN();
                report = await getDailyReport(d, skipCache);
                fileName = `qc-daily-${d}.xlsx`;
                break;
            }
            case 'weekly': {
                const end = date || getTodayVN();
                report = await getWeeklyReport(end, skipCache);
                fileName = `qc-weekly-${end}.xlsx`;
                break;
            }
            case 'monthly': {
                const y = year ? parseInt(year) : new Date().getFullYear();
                const m = month ? parseInt(month) : new Date().getMonth() + 1;
                report = await getMonthlyReport(y, m, skipCache);
                fileName = `qc-monthly-${y}-${String(m).padStart(2, '0')}.xlsx`;
                break;
            }
            default:
                return res.status(400).json({ success: false, error: 'Loại báo cáo không hợp lệ' });
        }

        const sent = (send === 'true') ? await sendToSeatalk(report, type) : false;

        if (export_excel === 'true') {
            const wb = generateExcel(report, type);
            const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            return res.send(buf);
        }

        return res.status(200).json({
            success: true,
            report_type: type,
            generated_at: new Date().toISOString(),
            sent_to_seatalk: sent,
            data: report,
        });
    } catch (err) {
        console.error('Report handler error:', err);
        return res.status(500).json({ success: false, error: 'Lỗi máy chủ' });
    }
}