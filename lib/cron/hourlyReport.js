// lib/cron/hourlyReport.js
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import {
    getTodayVN,
    getAlertConfig,
    fetchActiveUsers,
    fetchRoleDetails,
    mergeStats,
    capitalizeName,
} from './helpers.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const VN_OFFSET = 7 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// ==================== CONFIG PARSER ====================
function parseReportConfig(raw) {
    const reportEnabled = raw?.report_enabled ?? true;
    const reportHourStart = raw?.report_hour_start ?? 8;
    const reportHourEnd = raw?.report_hour_end ?? 20;
    const reportMinute = raw?.report_minute ?? 10;
    const onlyWorkdays = raw?.report_only_workdays ?? true;
    const webhook = raw?.report_seatalk_webhook_url || raw?.seatalk_webhook_url || null;

    const workStartHour = raw?.work_start_hour ?? 8;
    const workEndHour = raw?.work_end_hour ?? 20;
    const breakStartHour = raw?.break_start_hour ?? 12;
    const breakStartMin = raw?.break_start_min ?? 30;
    const breakEndHour = raw?.break_end_hour ?? 13;
    const breakEndMin = raw?.break_end_min ?? 30;

    return {
        reportEnabled,
        reportHourStart,
        reportHourEnd,
        reportMinute,
        onlyWorkdays,
        webhook,
        workStartHour,
        workEndHour,
        breakStartHour,
        breakStartMin,
        breakEndHour,
        breakEndMin,
    };
}

// ==================== SEA TALK IMAGE SEND ====================
async function sendImage(webhookUrl, base64) {
    const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tag: 'image',
            image_base64: { content: base64 },
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gửi ảnh lỗi ${res.status}: ${err}`);
    }
}

// ==================== IMAGE GENERATION ====================
function buildHTML(users, date, displayName, hStart, hEnd, roleMap, cfg) {
    const sorted = [...users].sort((a, b) => (b.displayTotal || 0) - (a.displayTotal || 0));
    const wHours = hEnd - hStart;

    const workStart = cfg.workStartHour;
    const workEnd = cfg.workEndHour;
    const breakStartHour = cfg.breakStartHour;
    const breakEndHour = cfg.breakEndHour;

    const cellStyle = (cnt, low, med) => {
        if (!cnt) return 'background:#f8fafc; color:#cbd5e1;';
        if (cnt < low) return 'background:#fee2e2; color:#991b1b; font-weight:500;';
        if (cnt < med) return 'background:#fef9c3; color:#92400e; font-weight:600;';
        return 'background:#dcfce7; color:#166534; font-weight:700;';
    };

    const totalStyle = (t, low, med, effHrs) => {
        const lo = low * effHrs;
        const hi = med * effHrs;
        if (!t) return 'background:#f8fafc; color:#94a3b8;';
        if (t < lo) return 'background:#fee2e2; color:#991b1b; font-weight:bold;';
        if (t < hi) return 'background:#fef9c3; color:#92400e; font-weight:bold;';
        return 'background:#dcfce7; color:#166534; font-weight:bold;';
    };

    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    background:#f1f5f9;
    padding:30px;
    display: block;
    text-align: center;
    white-space: normal;
  }
  .card{
    display: inline-block;
    background:#fff;
    border-radius:16px;
    box-shadow:0 8px 30px rgba(0,0,0,0.06);
    padding:32px;
    text-align: left;
  }
  .title{
    font-size:28px;
    font-weight:700;
    color:#0f172a;
    margin-bottom:12px;
    white-space:nowrap;
  }
  .meta{
    display:flex;
    gap:28px;
    font-size:14px;
    color:#475569;
    background:#f8fafc;
    padding:10px 20px;
    border-radius:10px;
    margin-bottom:24px;
    white-space:nowrap;
  }
  table{
    border-collapse:separate;
    border-spacing:0;
    font-size:13px;
    border:1px solid #e2e8f0;
    border-radius:10px;
    overflow:hidden;
    table-layout:auto;
    white-space: nowrap;
  }
  th{
    font-weight:600;
    color:#334155;
    padding:12px 14px;
    border-bottom:2px solid #cbd5e1;
    text-align:center;
    white-space:nowrap;
    position:sticky;
    top:0;
  }
  td{
    padding:10px 14px;
    text-align:center;
    border-bottom:1px solid #e2e8f0;
    white-space:nowrap;
  }
  tr:last-child td{border-bottom:none;}
  .user-cell{
    text-align:left;
    max-width:260px;
    width:260px;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
  }
  .user-name{
    font-weight:600;
    color:#0f172a;
    max-width:240px;
    overflow:hidden;
    text-overflow:ellipsis;
    display:inline-block;
    vertical-align:middle;
  }
  .user-email{
    font-size:11px;
    color:#64748b;
    margin-top:2px;
    max-width:240px;
    overflow:hidden;
    text-overflow:ellipsis;
    display:block;
  }
  .total-header{background:#ecfdf5; font-weight:700; color:#065f46;}
</style></head>
<body>
<div class="card">
  <div class="title">📊 Báo cáo năng suất – ${displayName} – ${date}</div>
  <div class="meta">
    <span>👥 ${sorted.length} nhân viên</span>
    <span>⏰ ${hStart}:00 – ${hEnd}:00</span>
    <span>📐 Tổng dựa trên giờ có sản lượng (đã trừ 1h nghỉ nếu có)</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:50px;">STT</th>
        <th class="user-cell">Nhân viên</th>
        <th class="total-header" style="width:90px;">Tổng</th>
        ${Array.from({ length: wHours }, (_, i) => {
        const h = hStart + i;
        let bgColor = '#f1f5f9', textColor = '#334155', tooltip = '';
        if (h < workStart || h >= workEnd) {
            bgColor = '#f9fafb';
            textColor = '#9ca3af';
        } else if (h >= breakStartHour && h < breakEndHour) {
            bgColor = '#fff7ed';
            textColor = '#ea580c';
            tooltip = 'title="Nghỉ trưa"';
        }
        return `<th style="width:60px; background:${bgColor}; color:${textColor};" ${tooltip}>${h}:00</th>`;
    }).join('')}
      </tr>
    </thead>
    <tbody>
      ${sorted.map((u, idx) => {
        const { low_threshold: low, medium_threshold: med } = roleMap.get(u.role_key) || {};
        const t = u.displayTotal || 0;
        const effHrs = u.effectiveHours || 0;
        const name = capitalizeName(u.name) || u.email;
        const email = u.name ? u.email : '';
        const hour = u.hourly || {};
        return `
        <tr>
          <td style="color:#64748b;">${idx + 1}</td>
          <td class="user-cell">
            <span class="user-name" title="${name}">${name}</span>
            ${email ? `<span class="user-email" title="${email}">${email}</span>` : ''}
          </td>
          <td style="${totalStyle(t, low, med, effHrs)}" title="Tổng ước tính cho ${effHrs} giờ làm việc (đã trừ 1h nghỉ)">${t}</td>
          ${Array.from({ length: wHours }, (_, i) => {
            const h = hStart + i;
            const cnt = hour[h] || 0;
            return `<td style="${cellStyle(cnt, low, med)}">${cnt || '-'}</td>`;
        }).join('')}
        </tr>`;
    }).join('')}
    </tbody>
  </table>
</div>
</body></html>`;
}

async function generateImage(users, date, displayName, hStart, hEnd, roleMap, cfg) {
    const html = buildHTML(users, date, displayName, hStart, hEnd, roleMap, cfg);
    let browser = null;
    try {
        browser = await puppeteer.launch({
            args: chromium.args,
            executablePath: await chromium.executablePath(),
            headless: true,
        });

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });

        const wHours = hEnd - hStart;
        const colWidths = 50 + 260 + 90 + wHours * 60;
        const padding = 120;
        const viewportWidth = Math.max(800, colWidths + padding);
        await page.setViewport({ width: viewportWidth, height: 800 });

        const buf = await page.screenshot({ type: 'png', fullPage: true });
        return buf.toString('base64');
    } finally {
        if (browser) await browser.close();
    }
}

// ==================== MAIN ====================
export default async function handler(req, res) {
    try {
        console.log('[INFO] Bắt đầu gửi báo cáo...');

        const rawConfig = await getAlertConfig(supabase);
        const cfg = parseReportConfig(rawConfig);

        if (!cfg.reportEnabled) {
            return res.json({ success: false, reason: 'Báo cáo đang tắt.' });
        }
        // Kiểm tra ngày làm việc (có thể bỏ qua nếu không cần)
        // if (cfg.onlyWorkdays && !isWorkdayVN()) { ... }

        const hStart = cfg.reportHourStart;
        const hEnd = cfg.reportHourEnd;
        const date = getTodayVN();

        const { userMap, roleKeys } = await fetchActiveUsers(supabase);
        if (userMap.size === 0)
            return res.json({ success: false, reason: 'Không có user active.' });

        const roleDetails = await fetchRoleDetails(supabase, roleKeys);
        await mergeStats(supabase, date, userMap);

        const withData = [...userMap.values()].filter(u => u.total > 0);
        if (withData.length === 0) {
            return res.json({ success: true, message: 'Không có dữ liệu năng suất.' });
        }

        // Tính toán displayTotal và effectiveHours riêng cho từng user
        const breakStart = cfg.breakStartHour + cfg.breakStartMin / 60;
        const breakEnd = cfg.breakEndHour + cfg.breakEndMin / 60;

        withData.forEach(user => {
            let rawTotal = 0;
            let activeHours = 0;

            for (let h = hStart; h < hEnd; h++) {
                const cnt = user.hourly?.[h] || 0;
                if (cnt > 0) {
                    activeHours++;
                    rawTotal += cnt;
                }
            }

            if (activeHours === 0) {
                user.displayTotal = 0;
                user.effectiveHours = 0;
                return;
            }

            const hasFullBreak = hStart <= breakStart && hEnd >= breakEnd;
            let effectiveHours = activeHours;
            if (hasFullBreak && activeHours > 1) {
                effectiveHours = activeHours - 1;
            }

            user.displayTotal = rawTotal;
            user.effectiveHours = effectiveHours;
        });

        // Nhóm theo role_key
        const groups = new Map();
        withData.forEach(u => {
            const rk = u.role_key;
            if (!groups.has(rk)) groups.set(rk, []);
            groups.get(rk).push(u);
        });

        if (!cfg.webhook) {
            return res.json({ success: false, reason: 'Thiếu webhook URL.' });
        }

        const sent = [];
        for (const [rk, users] of groups.entries()) {
            const { display_name: dn } = roleDetails.get(rk) || { display_name: rk };
            console.log(`[INFO] Tạo ảnh cho ${dn} (${users.length} users)`);
            const b64 = await generateImage(users, date, dn, hStart, hEnd, roleDetails, cfg);
            if (b64.length > MAX_IMAGE_BYTES) {
                console.warn(`[WARN] Ảnh ${dn} quá lớn, bỏ qua.`);
                continue;
            }
            await sendImage(cfg.webhook, b64);
            console.log(`[OK] Đã gửi ${dn}`);
            sent.push(dn);
            await new Promise(r => setTimeout(r, 1200)); // delay 1.2s
        }

        // Ghi log
        await supabase
            .from('qc_report_logs')
            .insert({
                report_type: 'hourly_image_per_role',
                content_text: `Đã gửi ${sent.length} ảnh: ${sent.join(', ')}`,
                sent_at: new Date().toISOString(),
                status: 'success',
            })
            .catch(e => console.warn('Ghi log lỗi:', e.message));

        return res.json({
            success: true,
            message: `Đã gửi ${sent.length} role`,
            roles: sent,
            date,
        });
    } catch (err) {
        console.error('[FATAL]', err);
        await supabase
            .from('qc_report_logs')
            .insert({
                report_type: 'hourly_image_per_role',
                error_message: err.message,
                sent_at: new Date().toISOString(),
                status: 'failed',
            })
            .catch(() => { });
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}