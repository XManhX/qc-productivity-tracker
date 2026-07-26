import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

// Khởi tạo Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Hàm lấy ngày hiện tại theo múi giờ VN (UTC+7)
function getTodayVN() {
    const now = new Date();
    const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return vnTime.toISOString().split('T')[0];
}

// Hàm tính toán idle minutes (tái sử dụng từ send-idle-alert.js)
function calcIdleMinutes(lastLogMs, nowMs, workStartMs, workEndMs, breakStartMs, breakEndMs) {
    if (lastLogMs === 0) return 0;

    let idleMs = nowMs - lastLogMs;
    // Loại trừ thời gian nghỉ trưa
    if (breakStartMs && breakEndMs && lastLogMs < breakEndMs && nowMs > breakStartMs) {
        const overlapStart = Math.max(lastLogMs, breakStartMs);
        const overlapEnd = Math.min(nowMs, breakEndMs);
        idleMs -= (overlapEnd - overlapStart);
    }
    // Chỉ tính idle trong giờ làm việc
    if (idleMs < 0) idleMs = 0;
    return Math.floor(idleMs / 60000); // chuyển sang phút
}

// Cache functions - Lấy báo cáo đã lưu trong 1 giờ qua (khớp với cấu trúc bảng qc_reports bạn tạo)
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

// Lưu báo cáo vào cache (hỗ trợ ON CONFLICT để update báo cáo cũ)
async function saveCachedReport(type, reportDate, reportData) {
    try {
        await supabase.from('qc_reports').upsert({
            report_type: type,
            report_date: reportDate,
            data: reportData,
            updated_at: new Date().toISOString()
        });
    } catch (error) {
        console.error('Cache save error:', error);
    }
}

// Tạo file Excel
function generateExcelBuffer(reportData, reportType) {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Tổng quan
    const summaryWS = XLSX.utils.json_to_sheet([
        { 'Chỉ số': 'Tổng số QC', 'Giá trị': reportData.summary.total_qc },
        { 'Chỉ số': 'QC online', 'Giá trị': reportData.summary.active_count },
        { 'Chỉ số': 'Tổng giờ làm việc', 'Giá trị': reportData.summary.total_work_hours },
        { 'Chỉ số': 'Tổng giờ idle', 'Giá trị': reportData.summary.total_idle_hours },
        { 'Chỉ số': 'Tỷ lệ idle', 'Giá trị': `${reportData.summary.idle_percent}%` },
        { 'Chỉ số': 'Trung bình/QC', 'Giá trị': `${reportData.summary.avg_idle_per_person} phút` },
        { 'Chỉ số': 'Số cảnh báo gửi đi', 'Giá trị': reportData.summary.total_alerts_sent }
    ]);
    XLSX.utils.book_append_sheet(wb, summaryWS, 'Tổng quan');

    // Sheet 2: Phân loại idle
    const idleBreakdownWS = XLSX.utils.json_to_sheet([
        { 'Loại idle': 'Dưới 15 phút', 'Số lần': reportData.idle_breakdown.short_idle },
        { 'Loại idle': '15-30 phút', 'Số lần': reportData.idle_breakdown.medium_idle },
        { 'Loại idle': 'Hơn 30 phút', 'Số lần': reportData.idle_breakdown.long_idle }
    ]);
    XLSX.utils.book_append_sheet(wb, idleBreakdownWS, 'Phân loại idle');

    // Sheet 3: Chi tiết từng QC
    const userDetailWS = XLSX.utils.json_to_sheet(reportData.user_details);
    XLSX.utils.book_append_sheet(wb, userDetailWS, 'Chi tiết QC');

    // Sheet 4: Bảng xếp hạng (chỉ cho tuần/tháng)
    if (reportType === 'weekly' || reportType === 'monthly') {
        const rankingWS = XLSX.utils.json_to_sheet(reportData.ranking || reportData.top_performers);
        XLSX.utils.book_append_sheet(wb, rankingWS, 'Xếp hạng');
    }

    return wb;
}

// 📅 Báo cáo hàng ngày
async function getDailyReport(dateStr, skipCache = false) {
    // Kiểm tra cache trước
    if (!skipCache) {
        const cached = await getCachedReport('daily', dateStr);
        if (cached) return cached;
    }

    const startDate = `${dateStr}T00:00:00Z`;
    const endDate = `${dateStr}T23:59:59Z`;

    // Lấy tất cả log trong ngày
    const { data: logs } = await supabase
        .from('qc_logs')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

    // Lấy danh sách QC
    const { data: users } = await supabase.from('qc_users').select('*');
    const { data: config } = await supabase.from('qc_alert_config').select('*').single();

    const workStart = config?.work_start || '08:00';
    const workEnd = config?.work_end || '17:00';
    const breakStart = config?.break_start || '12:00';
    const breakEnd = config?.break_end || '13:00';

    // Xử lý dữ liệu cho từng QC
    const userStats = {};
    users.forEach(user => {
        userStats[user.id] = {
            name: user.full_name,
            email: user.email,
            total_idle_minutes: 0,
            log_count: 0,
            short_idle: 0,    // <15p
            medium_idle: 0,   // 15-30p
            long_idle: 0      // >30p
        };
    });

    let total_alerts_sent = 0;
    let total_work_minutes = 0;
    let total_idle_minutes = 0;

    // Tính toán idle cho từng QC
    const userLogs = {};
    (logs || []).forEach(log => {
        if (!userLogs[log.operator_id]) userLogs[log.operator_id] = [];
        userLogs[log.operator_id].push(log);
    });

    Object.entries(userLogs).forEach(([userId, userLogList]) => {
        if (!userStats[userId]) return;

        userStats[userId].log_count = userLogList.length;
        const sortedLogs = userLogList.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        sortedLogs.forEach((log, idx) => {
            if (idx === 0) return;
            const prevLog = sortedLogs[idx - 1];
            const lastLogMs = new Date(prevLog.created_at).getTime();
            const currentLogMs = new Date(log.created_at).getTime();

            // Chuyển đổi giờ làm việc sang timestamp
            const logDate = new Date(log.created_at);
            const workStartMs = new Date(logDate.setHours(...workStart.split(':'))).getTime();
            const workEndMs = new Date(logDate.setHours(...workEnd.split(':'))).getTime();
            const breakStartMs = new Date(logDate.setHours(...breakStart.split(':'))).getTime();
            const breakEndMs = new Date(logDate.setHours(...breakEnd.split(':'))).getTime();

            const idleMinutes = calcIdleMinutes(lastLogMs, currentLogMs, workStartMs, workEndMs, breakStartMs, breakEndMs);

            if (idleMinutes > 0) {
                userStats[userId].total_idle_minutes += idleMinutes;
                if (idleMinutes < 15) userStats[userId].short_idle++;
                else if (idleMinutes < 30) userStats[userId].medium_idle++;
                else userStats[userId].long_idle++;
            }
        });

        total_idle_minutes += userStats[userId].total_idle_minutes;
        if (userStats[userId].long_idle > 0) total_alerts_sent += userStats[userId].long_idle;
    });

    // Tính giờ làm việc thực tế
    const workHoursPerDay = 8; // 8 giờ/ngày
    const activeUsers = Object.values(userStats).filter(u => u.log_count > 0);
    total_work_minutes = activeUsers.length * workHoursPerDay * 60;

    // Phân tích giờ cao điểm
    const hourCounts = Array(24).fill(0);
    (logs || []).forEach(log => {
        const hour = new Date(log.created_at).getHours();
        hourCounts[hour]++;
    });
    const peakHours = hourCounts.map((count, hour) => ({ hour, idle_count: count }))
        .sort((a, b) => b.idle_count - a.idle_count).slice(0, 3);

    // Tổng hợp dữ liệu báo cáo
    const report = {
        summary: {
            report_date: dateStr,
            total_qc: users.length,
            active_count: activeUsers.length,
            percent_active: users.length > 0 ? Math.round(activeUsers.length / users.length * 100) : 0,
            total_work_hours: Math.round(total_work_minutes / 60 * 10) / 10,
            total_idle_hours: Math.round(total_idle_minutes / 60 * 10) / 10,
            idle_percent: total_work_minutes > 0 ? Math.round(total_idle_minutes / total_work_minutes * 100) : 0,
            avg_idle_per_person: activeUsers.length > 0 ? Math.round(total_idle_minutes / activeUsers.length) : 0,
            total_alerts_sent
        },
        idle_breakdown: {
            short_idle: Object.values(userStats).reduce((sum, u) => sum + u.short_idle, 0),
            medium_idle: Object.values(userStats).reduce((sum, u) => sum + u.medium_idle, 0),
            long_idle: Object.values(userStats).reduce((sum, u) => sum + u.long_idle, 0)
        },
        peak_hours: peakHours,
        user_details: Object.values(userStats),
        top_performers: Object.values(userStats).sort((a, b) => a.total_idle_minutes - b.total_idle_minutes).slice(0, 3),
        needs_attention: Object.values(userStats).sort((a, b) => b.total_idle_minutes - a.total_idle_minutes).slice(0, 3)
    };

    // Lưu vào cache
    await saveCachedReport('daily', dateStr, report);
    return report;
}

// 📆 Báo cáo hàng tuần
async function getWeeklyReport(endDateStr, skipCache = false) {
    if (!skipCache) {
        const cached = await getCachedReport('weekly', endDateStr);
        if (cached) return cached;
    }

    // Tính ngày bắt đầu tuần (Thứ 2)
    const endDate = new Date(endDateStr);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 6); // Lùi 6 ngày để có 7 ngày trong tuần

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    // Lấy dữ liệu tuần này và tuần trước
    const thisWeekReport = await getDailyReportForPeriod(startStr, endStr);

    // Lấy tuần trước
    const prevStart = new Date(startDate);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevEnd = new Date(endDate);
    prevEnd.setDate(prevEnd.getDate() - 7);
    const lastWeekReport = await getDailyReportForPeriod(prevStart.toISOString().split('T')[0], prevEnd.toISOString().split('T')[0]);

    // Phân loại QC theo mức idle
    const allUsers = thisWeekReport.user_details || [];
    const excellent = allUsers.filter(u => u.total_idle_minutes < 60); // <60p/tuần
    const needs_improve = allUsers.filter(u => u.total_idle_minutes >= 60 && u.total_idle_minutes < 180);
    const needs_support = allUsers.filter(u => u.total_idle_minutes >= 180);

    // Tính % cải thiện
    const currentIdle = (thisWeekReport.summary?.total_idle_hours || 0) * 60;
    const lastIdle = (lastWeekReport.summary?.total_idle_hours || 0) * 60;
    const improvement = lastIdle > 0 ? Math.round((lastIdle - currentIdle) / lastIdle * 100) : 0;

    // Tìm những QC cải thiện được
    const qcsImproved = allUsers.filter(u => {
        const lastUser = lastWeekReport.user_details?.find(p => p.name === u.name);
        return lastUser && u.total_idle_minutes < lastUser.total_idle_minutes;
    }).length;

    const weeklyReport = {
        summary: {
            week_start: startStr,
            week_end: endStr,
            ...thisWeekReport.summary,
            improvement_from_last_week: improvement,
            qcs_improved: qcsImproved,
            improvement_rate: allUsers.length > 0 ? Math.round(qcsImproved / allUsers.length * 100) : 0,
            alert_reduction: lastWeekReport.summary?.total_alerts_sent > 0
                ? Math.round((lastWeekReport.summary.total_alerts_sent - thisWeekReport.summary.total_alerts_sent) / lastWeekReport.summary.total_alerts_sent * 100)
                : 0
        },
        user_classification: {
            excellent_count: excellent.length,
            excellent_percent: allUsers.length > 0 ? Math.round(excellent.length / allUsers.length * 100) : 0,
            needs_improve_count: needs_improve.length,
            needs_support_count: needs_support.length,
            support_percent: allUsers.length > 0 ? Math.round(needs_support.length / allUsers.length * 100) : 0
        },
        daily_breakdown: thisWeekReport.daily_breakdown,
        ranking: allUsers.sort((a, b) => a.total_idle_minutes - b.total_idle_minutes).slice(0, 10),
        needs_support_list: needs_support.map(u => u.name)
    };

    await saveCachedReport('weekly', endStr, weeklyReport);
    return weeklyReport;
}

// Hàm phụ lấy dữ liệu nhiều ngày cho báo cáo tuần/tháng
async function getDailyReportForPeriod(startDateStr, endDateStr) {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const days = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const dayReport = await getDailyReport(dateStr, true); // Bỏ cache để lấy dữ liệu tươi
        days.push({ date: dateStr, ...dayReport.summary });
    }

    // Tổng hợp dữ liệu tất cả các ngày trong khoảng
    const totalSummary = days.reduce((acc, day) => ({
        total_work_hours: acc.total_work_hours + (day.total_work_hours || 0),
        total_idle_hours: acc.total_idle_hours + (day.total_idle_hours || 0),
        total_alerts_sent: acc.total_alerts_sent + (day.total_alerts_sent || 0)
    }), { total_work_hours: 0, total_idle_hours: 0, total_alerts_sent: 0 });

    const allUserStats = {};
    days.forEach(day => {
        day.user_details?.forEach(user => {
            if (!allUserStats[user.name]) {
                allUserStats[user.name] = { ...user };
            } else {
                allUserStats[user.name].total_idle_minutes += user.total_idle_minutes;
                allUserStats[user.name].log_count += user.log_count;
                allUserStats[user.name].long_idle += user.long_idle;
            }
        });
    });

    return {
        summary: { ...totalSummary },
        daily_breakdown: days,
        user_details: Object.values(allUserStats)
    };
}

// 🗓️ Báo cáo hàng tháng
async function getMonthlyReport(year, month, skipCache = false) {
    const reportKey = `${year}-${month.toString().padStart(2, '0')}`;
    if (!skipCache) {
        const cached = await getCachedReport('monthly', reportKey);
        if (cached) return cached;
    }

    // Tính ngày đầu tiên và cuối cùng của tháng
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    // Lấy dữ liệu tháng này và tháng trước
    const thisMonthData = await getDailyReportForPeriod(
        firstDay.toISOString().split('T')[0],
        lastDay.toISOString().split('T')[0]
    );

    // Tháng trước để so sánh
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevFirstDay = new Date(prevYear, prevMonth - 1, 1);
    const prevLastDay = new Date(prevYear, prevMonth, 0);
    const lastMonthData = await getDailyReportForPeriod(
        prevFirstDay.toISOString().split('T')[0],
        prevLastDay.toISOString().split('T')[0]
    );

    // Tính giờ tiết kiệm được
    const currentIdleMinutes = (thisMonthData.summary?.total_idle_hours || 0) * 60;
    const lastIdleMinutes = (lastMonthData.summary?.total_idle_hours || 0) * 60;
    const savedMinutes = lastIdleMinutes - currentIdleMinutes;
    const savedHours = Math.round(savedMinutes / 60 * 10) / 10;
    const savedFTE = Math.round(savedHours / 160 * 100) / 100; // 160 giờ/tháng = 1 FTE
    const savedSalary = savedHours * 50; // Ước tính 50k/giờ -> 50 triệu/1000 giờ

    // Đề xuất cải thiện
    const recommendations = [];
    if (thisMonthData.summary?.idle_percent > 15) recommendations.push("Tập trung giảm idle >30p, cần họp với các QC có thời gian idle cao");
    if ((thisMonthData.needs_support_list?.length || 0) > 3) recommendations.push("Tổ chức 1 buổi training riêng cho nhóm QC cần hỗ trợ");
    if (thisMonthData.summary?.total_alerts_sent > lastMonthData.summary?.total_alerts_sent) recommendations.push("Xem lại cấu hình ngưỡng cảnh báo có quá thấp không?");
    else recommendations.push("Duy trì hiệu suất tốt, tiếp tục theo dõi các xu hướng tích cực");

    const monthlyReport = {
        summary: {
            year,
            month,
            month_start: firstDay.toISOString().split('T')[0],
            month_end: lastDay.toISOString().split('T')[0],
            ...thisMonthData.summary,
            improvement_over_last_month: lastIdleMinutes > 0 ? Math.round((lastIdleMinutes - currentIdleMinutes) / lastIdleMinutes * 100) : 0,
            saved_hours: savedHours,
            saved_fte: savedFTE,
            estimated_salary_saved_million: savedSalary,
            target_next_month: thisMonthData.summary?.idle_percent ? Math.round(thisMonthData.summary.idle_percent * 0.8) : 10
        },
        top_performers: thisMonthData.user_details?.sort((a, b) => a.total_idle_minutes - b.total_idle_minutes).slice(0, 10) || [],
        needs_support_list: thisMonthData.user_details?.filter(u => u.total_idle_minutes > 720).map(u => u.name) || [], // >12 tiếng/tháng
        recommendations
    };

    await saveCachedReport('monthly', reportKey, monthlyReport);
    return monthlyReport;
}

// API Handler chính
export default async function handler(req, res) {
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
            fileName = `qc-monthly-report-${currentYear}-${currentMonth.toString().padStart(2, '0')}.xlsx`;
        }

        // Nếu yêu cầu xuất Excel
        if (export_excel === "true") {
            const wb = generateExcelBuffer(report, type);
            const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            return res.send(buf);
        }

        // Trả về JSON
        return res.status(200).json({
            success: true,
            report_type: type,
            generated_at: new Date().toISOString(),
            data: report
        });

    } catch (error) {
        console.error('Report generation error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}