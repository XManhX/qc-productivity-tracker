// lib/cron/report.js
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ========== CONSTANTS & UTILS ==========
const VN_OFFSET = 7 * 3600 * 1000;

function getTodayVN() {
    const now = new Date(Date.now() + VN_OFFSET);
    return now.toISOString().split('T')[0];
}

function capitalizeName(name) {
    if (!name) return name;
    return name
        .trim()
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

// Hàm tính idle cho BÁO CÁO (giữa 2 lần log, trừ giờ nghỉ trưa)
function calcIdleBetweenLogs(lastLogMs, currentLogMs, workStartMs, workEndMs, breakStartMs, breakEndMs) {
    if (lastLogMs === 0 || currentLogMs <= lastLogMs) return 0;
    let idleMs = currentLogMs - lastLogMs;
    if (breakStartMs && breakEndMs && lastLogMs < breakEndMs && currentLogMs > breakStartMs) {
        const overlapStart = Math.max(lastLogMs, breakStartMs);
        const overlapEnd = Math.min(currentLogMs, breakEndMs);
        if (overlapEnd > overlapStart) {
            idleMs -= overlapEnd - overlapStart;
        }
    }
    return Math.max(0, Math.floor(idleMs / 60000));
}

async function getConfigForReport() {
    const { data, error } = await supabase
        .from('qc_alert_config')
        .select('*')
        .eq('id', 1)
        .single();
    if (error || !data) {
        // fallback config
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
            excluded_emails: [],
        };
    }
    return data;
}

// ========== CACHE ==========
async function getCachedReport(type, reportDate) {
    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data } = await supabase
            .from('qc_reports')
            .select('data, created_at')
            .eq('report_type', type)
            .eq('report_date', reportDate)
            .gt('created_at', oneHourAgo)
            .single();
        return data?.data || null;
    } catch (error) {
        console.error('Cache read error:', error);
        return null;
    }
}

async function saveCachedReport(type, reportDate, reportData) {
    try {
        await supabase.from('qc_reports').upsert({
            report_type: type,
            report_date: reportDate,
            data: reportData,
            updated_at: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Cache save error:', error);
    }
}

// ========== BÁO CÁO NGÀY (ĐÃ LOẠI TRỪ NGƯỜI DÙNG NGOẠI LỆ) ==========
async function getDailyReport(dateStr, skipCache = false) {
    if (!skipCache) {
        const cached = await getCachedReport('daily', dateStr);
        if (cached) return cached;
    }

    const startDate = `${dateStr}T00:00:00+07:00`;
    const endDate = `${dateStr}T23:59:59+07:00`;

    const { data: logs } = await supabase
        .from('qc_logs')
        .select('operator, created_at')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: true });

    const { data: users } = await supabase.from('qc_users').select('email, name, is_active');
    const config = await getConfigForReport();

    // Lọc người dùng active và loại bỏ những email trong danh sách ngoại lệ
    const excludedEmails = config.excluded_emails || [];
    const activeUsers = (users || []).filter(u => u.is_active && !excludedEmails.includes(u.email));

    // Nếu không có ai thì trả về báo cáo rỗng
    if (activeUsers.length === 0) {
        const emptyReport = {
            summary: {
                report_date: dateStr,
                total_qc: 0,
                active_count: 0,
                percent_active: 0,
                total_work_hours: 0,
                total_idle_hours: 0,
                idle_percent: 0,
                avg_idle_per_person: 0,
                total_alerts_sent: 0,
            },
            idle_breakdown: { short_idle: 0, medium_idle: 0, long_idle: 0 },
            peak_hours: [],
            user_details: [],
            top_performers: [],
            needs_attention: [],
        };
        return emptyReport;
    }

    const dateBase = new Date(`${dateStr}T00:00:00+07:00`).getTime();

    const workStartMs = dateBase + config.work_start_hour * 3600000 + config.work_start_min * 60000;
    const workEndMs = dateBase + config.work_end_hour * 3600000 + config.work_end_min * 60000;
    const breakStartMs = dateBase + config.break_start_hour * 3600000 + config.break_start_min * 60000;
    const breakEndMs = dateBase + config.break_end_hour * 3600000 + config.break_end_min * 60000;

    const workMinutesPerPerson =
        (config.work_end_hour * 60 + config.work_end_min) -
        (config.work_start_hour * 60 + config.work_start_min);
    const breakMinutes =
        (config.break_end_hour * 60 + config.break_end_min) -
        (config.break_start_hour * 60 + config.break_start_min);
    const effectiveWorkMinutesPerPerson = workMinutesPerPerson - breakMinutes;

    // Sử dụng activeUsers đã lọc cho toàn bộ tính toán
    const totalWorkMinutes = activeUsers.length * effectiveWorkMinutesPerPerson;
    const totalWorkHours = Math.round((totalWorkMinutes / 60) * 10) / 10;

    // Khởi tạo thống kê cho mỗi user
    const userStats = {};
    activeUsers.forEach(user => {
        userStats[user.email] = {
            name: user.name || user.email,
            email: user.email,
            total_idle_minutes: 0,
            log_count: 0,
            short_idle: 0,
            medium_idle: 0,
            long_idle: 0,
        };
    });

    // Gom nhóm log theo operator
    const logsByUser = {};
    (logs || []).forEach(log => {
        if (!userStats[log.operator]) return; // bỏ qua log của user bị loại trừ
        if (!logsByUser[log.operator]) logsByUser[log.operator] = [];
        logsByUser[log.operator].push(new Date(log.created_at).getTime());
    });

    let total_alerts_sent = 0;
    let total_idle_minutes = 0;

    for (const email of Object.keys(userStats)) {
        const timestamps = logsByUser[email] || [];
        userStats[email].log_count = timestamps.length;
        if (timestamps.length < 2) continue;

        for (let i = 1; i < timestamps.length; i++) {
            const lastMs = timestamps[i - 1];
            const currMs = timestamps[i];
            const idle = calcIdleBetweenLogs(lastMs, currMs, workStartMs, workEndMs, breakStartMs, breakEndMs);
            if (idle > 0) {
                userStats[email].total_idle_minutes += idle;
                if (idle < 15) userStats[email].short_idle++;
                else if (idle < 30) userStats[email].medium_idle++;
                else {
                    userStats[email].long_idle++;
                    total_alerts_sent++;
                }
            }
        }
        total_idle_minutes += userStats[email].total_idle_minutes;
    }

    const totalIdleHours = Math.round((total_idle_minutes / 60) * 10) / 10;
    const idlePercent =
        totalWorkMinutes > 0 ? Math.round((total_idle_minutes / totalWorkMinutes) * 100) : 0;
    const avgIdlePerPerson =
        activeUsers.length > 0 ? Math.round(total_idle_minutes / activeUsers.length) : 0;

    // Phân bố giờ cao điểm (dựa trên log của user hợp lệ)
    const hourCounts = Array(24).fill(0);
    (logs || []).forEach(log => {
        if (!userStats[log.operator]) return;
        const hour = new Date(log.created_at).getHours();
        hourCounts[hour]++;
    });
    const peakHours = hourCounts
        .map((count, hour) => ({ hour, idle_count: count }))
        .sort((a, b) => b.idle_count - a.idle_count)
        .slice(0, 3);

    const userDetails = Object.values(userStats);
    const report = {
        summary: {
            report_date: dateStr,
            total_qc: activeUsers.length,
            active_count: userDetails.filter(u => u.log_count > 0).length,
            percent_active:
                activeUsers.length > 0
                    ? Math.round(
                        (userDetails.filter(u => u.log_count > 0).length / activeUsers.length) * 100
                    )
                    : 0,
            total_work_hours: totalWorkHours,
            total_idle_hours: totalIdleHours,
            idle_percent: idlePercent,
            avg_idle_per_person: avgIdlePerPerson,
            total_alerts_sent,
        },
        idle_breakdown: {
            short_idle: userDetails.reduce((s, u) => s + u.short_idle, 0),
            medium_idle: userDetails.reduce((s, u) => s + u.medium_idle, 0),
            long_idle: userDetails.reduce((s, u) => s + u.long_idle, 0),
        },
        peak_hours: peakHours,
        user_details: userDetails,
        top_performers: userDetails
            .sort((a, b) => a.total_idle_minutes - b.total_idle_minutes)
            .slice(0, 3),
        needs_attention: userDetails
            .sort((a, b) => b.total_idle_minutes - a.total_idle_minutes)
            .slice(0, 3),
    };

    await saveCachedReport('daily', dateStr, report);
    return report;
}

// ========== TỔNG HỢP NHIỀU NGÀY ==========
async function getDailyReportForPeriod(startDateStr, endDateStr) {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const days = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const dayReport = await getDailyReport(dateStr, true);
        days.push({ date: dateStr, ...dayReport.summary });
    }

    const totalSummary = days.reduce(
        (acc, day) => ({
            total_work_hours: acc.total_work_hours + (day.total_work_hours || 0),
            total_idle_hours: acc.total_idle_hours + (day.total_idle_hours || 0),
            total_alerts_sent: acc.total_alerts_sent + (day.total_alerts_sent || 0),
        }),
        { total_work_hours: 0, total_idle_hours: 0, total_alerts_sent: 0 }
    );

    totalSummary.idle_percent =
        totalSummary.total_work_hours > 0
            ? Math.round((totalSummary.total_idle_hours / totalSummary.total_work_hours) * 100)
            : 0;

    const allUserStats = {};
    for (const day of days) {
        const dayReport = await getDailyReport(day.date, true);
        (dayReport.user_details || []).forEach(user => {
            if (!allUserStats[user.email]) {
                allUserStats[user.email] = { ...user };
            } else {
                allUserStats[user.email].total_idle_minutes += user.total_idle_minutes;
                allUserStats[user.email].log_count += user.log_count;
                allUserStats[user.email].long_idle += user.long_idle;
            }
        });
    }

    return {
        summary: { ...totalSummary },
        daily_breakdown: days,
        user_details: Object.values(allUserStats),
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

    const thisWeek = await getDailyReportForPeriod(startStr, endStr);

    const prevStart = new Date(startDate);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevEnd = new Date(endDate);
    prevEnd.setDate(prevEnd.getDate() - 7);
    const lastWeek = await getDailyReportForPeriod(
        prevStart.toISOString().split('T')[0],
        prevEnd.toISOString().split('T')[0]
    );

    const allUsers = thisWeek.user_details || [];
    const excellent = allUsers.filter(u => u.total_idle_minutes < 60);
    const needs_improve = allUsers.filter(
        u => u.total_idle_minutes >= 60 && u.total_idle_minutes < 180
    );
    const needs_support = allUsers.filter(u => u.total_idle_minutes >= 180);

    const currentIdle = thisWeek.summary?.total_idle_hours || 0;
    const lastIdle = lastWeek.summary?.total_idle_hours || 0;
    let improvementText;
    if (lastIdle === 0) {
        improvementText = currentIdle === 0 ? '0%' : 'N/A (tuần trước không có dữ liệu)';
    } else {
        const pct = Math.round(((lastIdle - currentIdle) / lastIdle) * 100);
        improvementText = `${pct}%`;
    }

    const qcsImproved = allUsers.filter(u => {
        const lastUser = lastWeek.user_details?.find(p => p.email === u.email);
        return lastUser && u.total_idle_minutes < lastUser.total_idle_minutes;
    }).length;

    const report = {
        summary: {
            week_start: startStr,
            week_end: endStr,
            ...thisWeek.summary,
            improvement_from_last_week: improvementText,
            qcs_improved: qcsImproved,
            improvement_rate:
                allUsers.length > 0 ? Math.round((qcsImproved / allUsers.length) * 100) : 0,
            alert_reduction:
                lastWeek.summary?.total_alerts_sent > 0
                    ? Math.round(
                        ((lastWeek.summary.total_alerts_sent - thisWeek.summary.total_alerts_sent) /
                            lastWeek.summary.total_alerts_sent) *
                        100
                    )
                    : 'N/A',
        },
        user_classification: {
            excellent_count: excellent.length,
            excellent_percent:
                allUsers.length > 0 ? Math.round((excellent.length / allUsers.length) * 100) : 0,
            needs_improve_count: needs_improve.length,
            needs_support_count: needs_support.length,
            support_percent:
                allUsers.length > 0 ? Math.round((needs_support.length / allUsers.length) * 100) : 0,
        },
        daily_breakdown: thisWeek.daily_breakdown,
        ranking: allUsers
            .sort((a, b) => a.total_idle_minutes - b.total_idle_minutes)
            .slice(0, 10),
        needs_support_list: needs_support.map(u => u.name),
    };

    await saveCachedReport('weekly', endStr, report);
    return report;
}

// ========== BÁO CÁO THÁNG ==========
async function getMonthlyReport(year, month, skipCache = false) {
    const reportKey = `${year}-${String(month).padStart(2, '0')}`;
    if (!skipCache) {
        const cached = await getCachedReport('monthly', reportKey);
        if (cached) return cached;
    }

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    const thisMonth = await getDailyReportForPeriod(
        firstDay.toISOString().split('T')[0],
        lastDay.toISOString().split('T')[0]
    );

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevFirstDay = new Date(prevYear, prevMonth - 1, 1);
    const prevLastDay = new Date(prevYear, prevMonth, 0);
    const lastMonth = await getDailyReportForPeriod(
        prevFirstDay.toISOString().split('T')[0],
        prevLastDay.toISOString().split('T')[0]
    );

    const currentIdleMinutes = thisMonth.summary?.total_idle_hours || 0;
    const lastIdleMinutes = lastMonth.summary?.total_idle_hours || 0;
    const savedMinutes = lastIdleMinutes - currentIdleMinutes;
    const savedHours = Math.round((savedMinutes / 60) * 10) / 10;
    const savedFTE = Math.round((savedHours / 160) * 100) / 100;
    const savedSalary = Math.round(savedHours * 50);

    let improvementText;
    if (lastIdleMinutes === 0) {
        improvementText = currentIdleMinutes === 0 ? '0%' : 'N/A (tháng trước không có dữ liệu)';
    } else {
        const pct = Math.round(((lastIdleMinutes - currentIdleMinutes) / lastIdleMinutes) * 100);
        improvementText = `${pct}%`;
    }

    const recommendations = [];
    if (thisMonth.summary?.idle_percent > 15) {
        recommendations.push(
            'Tập trung giảm idle >30p, cần họp với các QC có thời gian idle cao'
        );
    }
    if ((thisMonth.needs_support_list?.length || 0) > 3) {
        recommendations.push('Tổ chức buổi training cho nhóm QC cần hỗ trợ');
    }
    if (
        thisMonth.summary?.total_alerts_sent > lastMonth.summary?.total_alerts_sent
    ) {
        recommendations.push('Xem lại cấu hình ngưỡng cảnh báo');
    } else {
        recommendations.push('Duy trì hiệu suất tốt, tiếp tục theo dõi');
    }

    const report = {
        summary: {
            year,
            month,
            month_start: firstDay.toISOString().split('T')[0],
            month_end: lastDay.toISOString().split('T')[0],
            ...thisMonth.summary,
            improvement_over_last_month: improvementText,
            saved_hours: savedHours,
            saved_fte: savedFTE,
            estimated_salary_saved_million: savedSalary,
            target_next_month: thisMonth.summary?.idle_percent
                ? Math.round(thisMonth.summary.idle_percent * 0.8)
                : 10,
        },
        top_performers: (thisMonth.user_details || [])
            .sort((a, b) => a.total_idle_minutes - b.total_idle_minutes)
            .slice(0, 10),
        needs_support_list: (thisMonth.user_details || [])
            .filter(u => u.total_idle_minutes > 720)
            .map(u => u.name),
        recommendations,
    };

    await saveCachedReport('monthly', reportKey, report);
    return report;
}

// ========== GỬI BÁO CÁO LÊN SEATALK ==========
function buildReportMessage(report, type) {
    const s = report.summary;
    const nowStr = new Date().toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
    });

    let message = '';

    if (type === 'daily') {
        message += `📊 **BÁO CÁO NGÀY** - ${s.report_date}\n`;
        message += `⏰ ${nowStr}\n\n`;
        message += `👥 QC online: ${s.active_count}/${s.total_qc} (${s.percent_active}%)\n`;
        message += `⏳ Tổng idle: ${s.total_idle_hours} giờ (${s.idle_percent}%)\n`;
        message += `🔔 Cảnh báo đã gửi: ${s.total_alerts_sent}\n\n`;
        if (report.needs_attention && report.needs_attention.length > 0) {
            message += `⚠️ Cần chú ý:\n`;
            report.needs_attention.slice(0, 3).forEach((u, i) => {
                message += `${i + 1}. ${capitalizeName(u.name)} - ${u.total_idle_minutes} phút\n`;
            });
        }
    } else if (type === 'weekly') {
        message += `📈 **BÁO CÁO TUẦN** (${s.week_start} → ${s.week_end})\n`;
        message += `⏰ ${nowStr}\n\n`;
        message += `⏳ Tổng idle: ${s.total_idle_hours} giờ (${s.idle_percent}%)\n`;
        message += `📉 Cải thiện: ${s.improvement_from_last_week} so với tuần trước\n`;
        message += `👥 QC xuất sắc (<60p): ${report.user_classification.excellent_count} (${report.user_classification.excellent_percent}%)\n`;
        message += `🆘 Cần hỗ trợ (>180p): ${report.user_classification.needs_support_count}\n`;
        if (report.ranking && report.ranking.length > 0) {
            message += `\n🏆 Top 3 chăm chỉ:\n`;
            report.ranking.slice(0, 3).forEach((u, i) => {
                message += `${i + 1}. ${capitalizeName(u.name)} - ${u.total_idle_minutes} phút\n`;
            });
        }
    } else if (type === 'monthly') {
        message += `📅 **BÁO CÁO THÁNG** ${s.month}/${s.year}\n`;
        message += `⏰ ${nowStr}\n\n`;
        message += `⏳ Tổng idle: ${s.total_idle_hours} giờ (${s.idle_percent}%)\n`;
        message += `📉 Cải thiện so với tháng trước: ${s.improvement_over_last_month}\n`;
        message += `💰 Tiết kiệm ước tính: ${s.saved_hours} giờ (~${s.estimated_salary_saved_million} triệu VNĐ)\n`;
        message += `🎯 Mục tiêu tháng sau: idle < ${s.target_next_month}%\n`;
        if (report.top_performers && report.top_performers.length > 0) {
            message += `\n🌟 Tiêu biểu:\n`;
            report.top_performers.slice(0, 5).forEach((u, i) => {
                message += `${i + 1}. ${capitalizeName(u.name)} - ${u.total_idle_minutes} phút\n`;
            });
        }
        if (report.recommendations && report.recommendations.length > 0) {
            message += `\n💡 Gợi ý:\n`;
            report.recommendations.forEach(r => (message += `• ${r}\n`));
        }
    }

    message += `\n🤖 Hệ thống tự động QC Monitor`;
    return message;
}

async function sendReportToSeatalk(report, type) {
    const { data: config } = await supabase
        .from('qc_alert_config')
        .select('seatalk_webhook_url, report_seatalk_webhook_url')
        .eq('id', 1)
        .single();

    const webhookUrl =
        config?.report_seatalk_webhook_url || config?.seatalk_webhook_url;

    if (!webhookUrl || webhookUrl.includes('xxx')) {
        console.log('Webhook not configured, would send report:', report.summary);
        return true;
    }

    const message = buildReportMessage(report, type);
    const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tag: 'text',
            text: { format: 1, content: message },
        }),
    });

    if (!res.ok) {
        console.error('Send report to Seatalk failed:', await res.text());
        return false;
    }
    return true;
}

// ========== XUẤT EXCEL ==========
function generateExcelBuffer(report, type) {
    const wb = XLSX.utils.book_new();

    const summaryWS = XLSX.utils.json_to_sheet([
        { 'Chỉ số': 'Tổng số QC', 'Giá trị': report.summary.total_qc },
        { 'Chỉ số': 'QC online', 'Giá trị': report.summary.active_count },
        {
            'Chỉ số': 'Tổng giờ làm việc',
            'Giá trị': report.summary.total_work_hours,
        },
        {
            'Chỉ số': 'Tổng giờ idle',
            'Giá trị': report.summary.total_idle_hours,
        },
        {
            'Chỉ số': 'Tỷ lệ idle',
            'Giá trị': `${report.summary.idle_percent}%`,
        },
        {
            'Chỉ số': 'Trung bình/QC',
            'Giá trị': `${report.summary.avg_idle_per_person} phút`,
        },
        {
            'Chỉ số': 'Số cảnh báo gửi đi',
            'Giá trị': report.summary.total_alerts_sent,
        },
    ]);
    XLSX.utils.book_append_sheet(wb, summaryWS, 'Tổng quan');

    const idleBreakdownWS = XLSX.utils.json_to_sheet([
        {
            'Loại idle': 'Dưới 15 phút',
            'Số lần': report.idle_breakdown.short_idle,
        },
        {
            'Loại idle': '15-30 phút',
            'Số lần': report.idle_breakdown.medium_idle,
        },
        {
            'Loại idle': 'Hơn 30 phút',
            'Số lần': report.idle_breakdown.long_idle,
        },
    ]);
    XLSX.utils.book_append_sheet(wb, idleBreakdownWS, 'Phân loại idle');

    const userDetailWS = XLSX.utils.json_to_sheet(report.user_details);
    XLSX.utils.book_append_sheet(wb, userDetailWS, 'Chi tiết QC');

    if (type === 'weekly' || type === 'monthly') {
        const rankingWS = XLSX.utils.json_to_sheet(
            report.ranking || report.top_performers
        );
        XLSX.utils.book_append_sheet(wb, rankingWS, 'Xếp hạng');
    }

    return wb;
}

// ========== MAIN HANDLER (export default) ==========
export default async function handler(req, res) {
    try {
        const {
            date,
            year,
            month,
            type = 'daily',
            force = 'false',
            export_excel = 'false',
            send = 'false',
        } = req.query;
        const skipCache = force === 'true';

        let report;
        let fileName;

        if (type === 'daily') {
            const targetDate = date || getTodayVN();
            report = await getDailyReport(targetDate, skipCache);
            fileName = `qc-daily-report-${targetDate}.xlsx`;
        } else if (type === 'weekly') {
            const endDate = date || getTodayVN();
            report = await getWeeklyReport(endDate, skipCache);
            fileName = `qc-weekly-report-${endDate}.xlsx`;
        } else if (type === 'monthly') {
            const currentYear = year ? parseInt(year) : new Date().getFullYear();
            const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;
            report = await getMonthlyReport(currentYear, currentMonth, skipCache);
            fileName = `qc-monthly-report-${currentYear}-${String(currentMonth).padStart(2, '0')}.xlsx`;
        } else {
            return res.status(400).json({ success: false, error: 'Invalid report type' });
        }

        // Gửi Seatalk nếu yêu cầu
        let sentToSeatalk = false;
        if (send === 'true') {
            sentToSeatalk = await sendReportToSeatalk(report, type);
        }

        // Xuất Excel nếu yêu cầu
        if (export_excel === 'true') {
            const wb = generateExcelBuffer(report, type);
            const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="${fileName}"`
            );
            res.setHeader(
                'Content-Type',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );
            return res.send(buf);
        }

        // Trả về JSON
        return res.status(200).json({
            success: true,
            report_type: type,
            generated_at: new Date().toISOString(),
            sent_to_seatalk: sentToSeatalk,
            data: report,
        });
    } catch (error) {
        console.error('Report generation error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}