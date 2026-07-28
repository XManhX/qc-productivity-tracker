// lib/cron/report.js
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import {
    getTodayVN,
    capitalizeName,
    calcIdleBetweenLogs,
    calcEdgeIdle,
    getAlertConfig,
    fetchAssignmentsForDate,
} from './helpers.js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ========== CẤU HÌNH MẶC ĐỊNH CHO BÁO CÁO ==========
const DEFAULT_REPORT_CONFIG = {
    short_idle_max: 15,
    medium_idle_max: 30,
    excellent_idle_weekly: 60,
    needs_support_idle_weekly: 180,
    target_idle_percent_monthly: 15,
    salary_per_hour: 50,
    fte_hours_per_month: 160,
};

// ========== CACHE ==========
async function getCachedReport(type, dateKey) {
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
}

async function saveCachedReport(type, dateKey, data) {
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
}

// ========== LẤY CONFIG KẾT HỢP ALERT + REPORT ==========
async function getReportConfig() {
    const alertConfig = await getAlertConfig(supabase);
    return {
        ...DEFAULT_REPORT_CONFIG,
        short_idle_max: alertConfig.report_short_idle_max ?? DEFAULT_REPORT_CONFIG.short_idle_max,
        medium_idle_max: alertConfig.report_medium_idle_max ?? DEFAULT_REPORT_CONFIG.medium_idle_max,
        excellent_idle_weekly: alertConfig.excellent_idle_weekly ?? DEFAULT_REPORT_CONFIG.excellent_idle_weekly,
        needs_support_idle_weekly: alertConfig.needs_support_idle_weekly ?? DEFAULT_REPORT_CONFIG.needs_support_idle_weekly,
        target_idle_percent_monthly: alertConfig.target_idle_percent_monthly ?? DEFAULT_REPORT_CONFIG.target_idle_percent_monthly,
        salary_per_hour: alertConfig.salary_per_hour ?? DEFAULT_REPORT_CONFIG.salary_per_hour,
        fte_hours_per_month: alertConfig.fte_hours_per_month ?? DEFAULT_REPORT_CONFIG.fte_hours_per_month,
        work_start_hour: alertConfig.work_start_hour,
        work_start_min: alertConfig.work_start_min,
        work_end_hour: alertConfig.work_end_hour,
        work_end_min: alertConfig.work_end_min,
        break_start_hour: alertConfig.break_start_hour,
        break_start_min: alertConfig.break_start_min,
        break_end_hour: alertConfig.break_end_hour,
        break_end_min: alertConfig.break_end_min,
        excluded_emails: alertConfig.excluded_emails || [],
        seatalk_webhook_url: alertConfig.seatalk_webhook_url,
        report_seatalk_webhook_url: alertConfig.report_seatalk_webhook_url,
    };
}

// ========== HELPERS ==========
function createEmptyReport(dateStr) {
    return {
        summary: {
            report_date: dateStr,
            total_qc: 0, active_count: 0, percent_active: 0,
            total_work_hours: 0, total_idle_hours: 0, idle_percent: 0,
            avg_idle_per_person: 0, long_idle_events: 0,
            total_qc_count: 0, total_qc_per_hour: 0,
            total_assigned_work_hours: 0,
        },
        idle_breakdown: { short_idle: 0, medium_idle: 0, long_idle: 0 },
        peak_activity_hours: [],
        user_details: [],
        top_performers: [],
        needs_attention: [],
    };
}

function classifyIdle(minutes, stats, shortMax, mediumMax) {
    if (minutes < shortMax) stats.short_idle++;
    else if (minutes < mediumMax) stats.medium_idle++;
    else stats.long_idle++;
}

// ========== BÁO CÁO NGÀY ==========
async function getDailyReport(dateStr, skipCache = false) {
    if (!skipCache) {
        const cached = await getCachedReport('daily', dateStr);
        if (cached) return cached;
    }

    const startISO = `${dateStr}T00:00:00+07:00`;
    const endISO = `${dateStr}T23:59:59+07:00`;

    const [logsRes, usersRes, config] = await Promise.all([
        supabase.from('qc_logs').select('operator, created_at, page')
            .gte('created_at', startISO).lte('created_at', endISO)
            .order('created_at', { ascending: true }),
        supabase.from('qc_users').select('email, name, is_active'),
        getReportConfig(),
    ]);

    const logs = logsRes.data || [];
    const users = usersRes.data || [];
    const excluded = config.excluded_emails || [];
    const activeUsers = users.filter(u => u.is_active && !excluded.includes(u.email));

    if (activeUsers.length === 0) {
        return createEmptyReport(dateStr);
    }

    // Lấy assignments cho ngày này và tất cả active users
    const userEmails = activeUsers.map(u => u.email);
    const assignmentsMap = await fetchAssignmentsForDate(supabase, dateStr, userEmails);

    const dateBase = new Date(`${dateStr}T00:00:00+07:00`).getTime();
    const workStartMs = dateBase + config.work_start_hour * 3600000 + config.work_start_min * 60000;
    const workEndMs = dateBase + config.work_end_hour * 3600000 + config.work_end_min * 60000;
    const breakStartMs = dateBase + config.break_start_hour * 3600000 + config.break_start_min * 60000;
    const breakEndMs = dateBase + config.break_end_hour * 3600000 + config.break_end_min * 60000;

    // Khởi tạo user stats
    const userMap = new Map();
    activeUsers.forEach(u => userMap.set(u.email, {
        name: u.name || u.email,
        email: u.email,
        total_idle_minutes: 0,
        log_count: 0,
        actual_work_minutes: 0,
        assigned_work_minutes: 0,
        short_idle: 0,
        medium_idle: 0,
        long_idle: 0,
        qc_count: 0,
        qc_per_hour: 0,
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

    let totalActualMinutes = 0;
    let totalIdleMinutes = 0;
    let longIdleEvents = 0;
    let totalQcCount = 0;
    let totalAssignedMinutes = 0;

    for (const [email, stats] of userMap) {
        const entries = logsByUser.get(email) || [];
        stats.log_count = entries.length;

        // Lấy assignments của user này
        const assignments = assignmentsMap.get(email) || [];

        // Tính thời gian làm việc thực tế từ log đầu đến log cuối
        let firstLogMs = null, lastLogMs = null;
        if (entries.length >= 2) {
            const timestamps = entries.map(e => e.ts);
            firstLogMs = timestamps[0];
            lastLogMs = timestamps[timestamps.length - 1];
            let sessionMs = lastLogMs - firstLogMs;
            // Trừ break overlap
            if (firstLogMs < breakEndMs && lastLogMs > breakStartMs) {
                const overlapStart = Math.max(firstLogMs, breakStartMs);
                const overlapEnd = Math.min(lastLogMs, breakEndMs);
                if (overlapEnd > overlapStart) sessionMs -= (overlapEnd - overlapStart);
            }
            stats.actual_work_minutes = Math.max(0, Math.floor(sessionMs / 60000));
        } else if (entries.length === 1) {
            firstLogMs = entries[0].ts;
            // Không tính thời gian làm việc nếu chỉ 1 log
        }

        // Tính thời gian được giao việc khác (tổng thời gian assignment)
        let assignedMin = 0;
        assignments.forEach(a => {
            assignedMin += (a.end - a.start) / 60000;
        });
        stats.assigned_work_minutes = Math.round(assignedMin);
        totalAssignedMinutes += stats.assigned_work_minutes;

        totalActualMinutes += stats.actual_work_minutes;

        // Đếm sản lượng QC
        entries.forEach(e => {
            if (e.page === 'qc') stats.qc_count++;
        });
        totalQcCount += stats.qc_count;

        // Tính idle giữa các cặp log
        if (entries.length >= 2) {
            const timestamps = entries.map(e => e.ts);
            for (let i = 1; i < timestamps.length; i++) {
                const idle = calcIdleBetweenLogs(
                    timestamps[i - 1], timestamps[i],
                    workStartMs, workEndMs,
                    breakStartMs, breakEndMs,
                    assignments  // truyền assignments
                );
                if (idle > 0) {
                    stats.total_idle_minutes += idle;
                    classifyIdle(idle, stats, config.short_idle_max, config.medium_idle_max);
                    if (idle >= config.medium_idle_max) longIdleEvents++;
                }
            }
        }

        // Idle đầu/cuối ca (có trừ assignment)
        const edgeIdle = calcEdgeIdle(firstLogMs, lastLogMs, workStartMs, workEndMs, assignments);
        if (edgeIdle > 0) {
            stats.total_idle_minutes += edgeIdle;
            classifyIdle(edgeIdle, stats, config.short_idle_max, config.medium_idle_max);
            if (edgeIdle >= config.medium_idle_max) longIdleEvents++;
        }

        totalIdleMinutes += stats.total_idle_minutes;

        // qc_per_hour
        if (stats.actual_work_minutes > 0) {
            stats.qc_per_hour = Math.round((stats.qc_count / (stats.actual_work_minutes / 60)) * 10) / 10;
        }
    }

    const userDetails = Array.from(userMap.values());
    const activeCount = userDetails.filter(u => u.log_count > 0).length;

    // Giờ cao điểm
    const hourCounts = new Array(24).fill(0);
    logs.forEach(log => {
        if (userMap.has(log.operator)) hourCounts[new Date(log.created_at).getHours()]++;
    });
    const peakHours = hourCounts
        .map((count, hour) => ({ hour, log_count: count }))
        .sort((a, b) => b.log_count - a.log_count)
        .slice(0, 3);

    const totalWorkHours = Math.round((totalActualMinutes / 60) * 10) / 10;
    const totalIdleHours = Math.round((totalIdleMinutes / 60) * 10) / 10;
    const idlePercent = totalActualMinutes ? Math.round((totalIdleMinutes / totalActualMinutes) * 100) : 0;
    const totalQcPerHour = totalActualMinutes ? Math.round((totalQcCount / (totalActualMinutes / 60)) * 10) / 10 : 0;
    const totalAssignedHours = Math.round((totalAssignedMinutes / 60) * 10) / 10;

    const report = {
        summary: {
            report_date: dateStr,
            total_qc: activeUsers.length,
            active_count: activeCount,
            percent_active: activeUsers.length ? Math.round((activeCount / activeUsers.length) * 100) : 0,
            total_work_hours: totalWorkHours,
            total_idle_hours: totalIdleHours,
            idle_percent: idlePercent,
            avg_idle_per_person: activeCount ? Math.round(totalIdleMinutes / activeCount) : 0,
            long_idle_events: longIdleEvents,
            total_qc_count: totalQcCount,
            total_qc_per_hour: totalQcPerHour,
            total_assigned_work_hours: totalAssignedHours,
        },
        idle_breakdown: {
            short_idle: userDetails.reduce((s, u) => s + u.short_idle, 0),
            medium_idle: userDetails.reduce((s, u) => s + u.medium_idle, 0),
            long_idle: userDetails.reduce((s, u) => s + u.long_idle, 0),
        },
        peak_activity_hours: peakHours,
        user_details: userDetails,
        top_performers: [...userDetails].sort((a, b) => a.total_idle_minutes - b.total_idle_minutes).slice(0, 3),
        needs_attention: [...userDetails].sort((a, b) => b.total_idle_minutes - a.total_idle_minutes).slice(0, 3),
    };

    await saveCachedReport('daily', dateStr, report);
    return report;
}

// ========== TỔNG HỢP NHIỀU NGÀY ==========
async function getPeriodReport(startStr, endStr) {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const dailyReports = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const dayReport = await getDailyReport(dateStr, true);
        dailyReports.push({ date: dateStr, report: dayReport });
    }

    const totalSummary = dailyReports.reduce((acc, { report }) => {
        const s = report.summary;
        return {
            total_work_hours: acc.total_work_hours + (s.total_work_hours || 0),
            total_idle_hours: acc.total_idle_hours + (s.total_idle_hours || 0),
            long_idle_events: acc.long_idle_events + (s.long_idle_events || 0),
            total_qc_count: acc.total_qc_count + (s.total_qc_count || 0),
            total_assigned_work_hours: acc.total_assigned_work_hours + (s.total_assigned_work_hours || 0),
        };
    }, { total_work_hours: 0, total_idle_hours: 0, long_idle_events: 0, total_qc_count: 0, total_assigned_work_hours: 0 });

    totalSummary.idle_percent = totalSummary.total_work_hours
        ? Math.round((totalSummary.total_idle_hours / totalSummary.total_work_hours) * 100) : 0;
    totalSummary.total_qc_per_hour = totalSummary.total_work_hours
        ? Math.round((totalSummary.total_qc_count / totalSummary.total_work_hours) * 10) / 10 : 0;

    // Gộp user_details
    const userMap = new Map();
    dailyReports.forEach(({ report }) => {
        (report.user_details || []).forEach(u => {
            const existing = userMap.get(u.email);
            if (!existing) {
                userMap.set(u.email, {
                    name: u.name,
                    email: u.email,
                    total_idle_minutes: u.total_idle_minutes,
                    log_count: u.log_count,
                    actual_work_minutes: u.actual_work_minutes,
                    assigned_work_minutes: u.assigned_work_minutes || 0,
                    short_idle: u.short_idle,
                    medium_idle: u.medium_idle,
                    long_idle: u.long_idle,
                    qc_count: u.qc_count,
                    qc_per_hour: 0,
                });
            } else {
                existing.total_idle_minutes += u.total_idle_minutes;
                existing.log_count += u.log_count;
                existing.actual_work_minutes += u.actual_work_minutes;
                existing.assigned_work_minutes += (u.assigned_work_minutes || 0);
                existing.short_idle += u.short_idle;
                existing.medium_idle += u.medium_idle;
                existing.long_idle += u.long_idle;
                existing.qc_count += u.qc_count;
            }
        });
    });

    // Tính lại qc_per_hour
    for (const stats of userMap.values()) {
        if (stats.actual_work_minutes > 0) {
            stats.qc_per_hour = Math.round((stats.qc_count / (stats.actual_work_minutes / 60)) * 10) / 10;
        }
    }

    const daysSummary = dailyReports.map(({ date, report }) => ({ date, ...report.summary }));

    return {
        summary: totalSummary,
        daily_breakdown: daysSummary,
        user_details: Array.from(userMap.values()),
    };
}

// ========== BÁO CÁO TUẦN ==========
async function getWeeklyReport(endDateStr, skipCache = false) {
    if (!skipCache) {
        const cached = await getCachedReport('weekly', endDateStr);
        if (cached) return cached;
    }

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

    const config = await getReportConfig();
    const allUsers = thisWeek.user_details;
    const excellent = allUsers.filter(u => u.total_idle_minutes < config.excellent_idle_weekly);
    const needsSupport = allUsers.filter(u => u.total_idle_minutes >= config.needs_support_idle_weekly);

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
            needs_improve_count: allUsers.filter(u => u.total_idle_minutes >= config.excellent_idle_weekly && u.total_idle_minutes < config.needs_support_idle_weekly).length,
            needs_support_count: needsSupport.length,
            support_percent: allUsers.length ? Math.round((needsSupport.length / allUsers.length) * 100) : 0,
        },
        daily_breakdown: thisWeek.daily_breakdown,
        ranking: [...allUsers].sort((a, b) => a.total_idle_minutes - b.total_idle_minutes).slice(0, 10),
        needs_support_list: needsSupport.map(u => u.name),
    };

    await saveCachedReport('weekly', endStr, report);
    return report;
}

// ========== BÁO CÁO THÁNG ==========
async function getMonthlyReport(year, month, skipCache = false) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (!skipCache) {
        const cached = await getCachedReport('monthly', key);
        if (cached) return cached;
    }

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

    const config = await getReportConfig();
    const currentIdleHours = thisMonth.summary.total_idle_hours || 0;
    const lastIdleHours = lastMonth.summary.total_idle_hours || 0;
    const savedHours = Math.round((lastIdleHours - currentIdleHours) * 10) / 10;
    const improvement = lastIdleHours === 0
        ? (currentIdleHours === 0 ? '0%' : 'N/A')
        : `${Math.round(((lastIdleHours - currentIdleHours) / lastIdleHours) * 100)}%`;

    const recommendations = [];
    if (thisMonth.summary.idle_percent > config.target_idle_percent_monthly) {
        recommendations.push('Giảm idle >30p, họp QC có idle cao');
    }
    if ((thisMonth.user_details?.filter(u => u.total_idle_minutes >= config.needs_support_idle_weekly).length || 0) > 3) {
        recommendations.push('Tổ chức training cho QC cần hỗ trợ');
    }
    if ((thisMonth.summary.long_idle_events || 0) > (lastMonth.summary.long_idle_events || 0)) {
        recommendations.push('Xem lại cấu hình cảnh báo');
    } else {
        recommendations.push('Duy trì hiệu suất, tiếp tục theo dõi');
    }

    const report = {
        summary: {
            year, month,
            month_start: firstDay.toISOString().split('T')[0],
            month_end: lastDay.toISOString().split('T')[0],
            ...thisMonth.summary,
            improvement_over_last_month: improvement,
            saved_hours: savedHours,
            saved_fte: Math.round((savedHours / config.fte_hours_per_month) * 100) / 100,
            estimated_salary_saved_million: Math.round(savedHours * config.salary_per_hour),
            target_next_month: thisMonth.summary.idle_percent ? Math.round(thisMonth.summary.idle_percent * 0.8) : config.target_idle_percent_monthly,
        },
        top_performers: [...thisMonth.user_details].sort((a, b) => a.total_idle_minutes - b.total_idle_minutes).slice(0, 10),
        needs_support_list: thisMonth.user_details.filter(u => u.total_idle_minutes >= config.needs_support_idle_weekly).map(u => u.name),
        recommendations,
    };

    await saveCachedReport('monthly', key, report);
    return report;
}

// ========== GỬI SEATALK ==========
function buildMessage(report, type) {
    const s = report.summary || {};
    const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    let msg = '';

    if (type === 'daily') {
        msg += `📊 **BÁO CÁO NGÀY** - ${s.report_date}\n⏰ ${now}\n\n`;
        msg += `👥 QC online: ${s.active_count}/${s.total_qc} (${s.percent_active}%)\n`;
        msg += `⏳ Tổng idle: ${s.total_idle_hours}h (${s.idle_percent}%)\n`;
        msg += `⏱️ Idle >30p: ${s.long_idle_events} lần\n`;
        msg += `🕒 Làm việc: ${s.total_work_hours}h\n`;
        msg += `📋 Được giao việc khác: ${s.total_assigned_work_hours}h\n`;
        msg += `🔢 Sản lượng QC: ${s.total_qc_count || 0} log (${s.total_qc_per_hour}/h)\n\n`;
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
        msg += `📋 Giao việc khác: ${s.total_assigned_work_hours}h\n`;
        msg += `🔢 Sản lượng QC: ${s.total_qc_count || 0} log (${s.total_qc_per_hour}/h)\n`;
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
        msg += `📋 Giao việc khác: ${s.total_assigned_work_hours}h\n`;
        msg += `🔢 Sản lượng QC: ${s.total_qc_count || 0} log (${s.total_qc_per_hour}/h)\n`;
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
}

async function sendToSeatalk(report, type) {
    if (!report.summary || report.summary.active_count === 0) {
        console.log('Không có QC hoạt động, bỏ qua gửi báo cáo.');
        return true;
    }

    const config = await getReportConfig();
    const webhook = config.report_seatalk_webhook_url || config.seatalk_webhook_url;
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
}

// ========== XUẤT EXCEL ==========
function generateExcel(report, type) {
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
        { 'Chỉ số': 'QC/giờ', 'Giá trị': report.summary.total_qc_per_hour || 0 },
        { 'Chỉ số': 'Tổng giờ giao việc khác', 'Giá trị': report.summary.total_assigned_work_hours || 0 },
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
        'Được giao việc khác (phút)': u.assigned_work_minutes || 0,
        'Sản lượng QC': u.qc_count || 0,
        'QC/h': u.qc_per_hour || 0,
        'Idle ngắn': u.short_idle,
        'Idle TB': u.medium_idle,
        'Idle dài': u.long_idle,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(userRows), 'Chi tiết QC');

    if (type === 'weekly' || type === 'monthly') {
        const rank = report.ranking || report.top_performers || [];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
            rank.map(u => ({
                'Tên': u.name,
                'Email': u.email,
                'Idle (phút)': u.total_idle_minutes,
                'Sản lượng QC': u.qc_count || 0,
                'QC/h': u.qc_per_hour || 0,
                'Giao việc khác (phút)': u.assigned_work_minutes || 0,
            }))
        ), 'Xếp hạng');
    }

    return wb;
}

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