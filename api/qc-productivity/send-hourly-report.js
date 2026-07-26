import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

// ---------- Supabase Client ----------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ---------- Constants ----------
const VN_OFFSET = 7 * 60 * 60 * 1000;
const DEFAULT_LOW = 10;
const DEFAULT_MEDIUM = 16;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const CONFIG_CACHE_MS = 300_000;

// ---------- Cache ----------
let cachedConfig = null;
let configFetchedAt = 0;

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

async function getConfig() {
  const now = Date.now();
  if (cachedConfig && now - configFetchedAt < CONFIG_CACHE_MS) {
    return cachedConfig;
  }

  const { data, error } = await supabase
    .from("qc_alert_config")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) throw new Error(`Lỗi lấy cấu hình: ${error.message}`);

  const parsed = parseReportConfig(data);
  cachedConfig = parsed;
  configFetchedAt = now;
  return parsed;
}

// ==================== UTILS ====================
const capitalizeName = (name) => {
  if (!name) return "";
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
};

const getTodayVN = () => {
  const d = new Date(Date.now() + VN_OFFSET);
  return d.toISOString().split("T")[0];
};

const isWorkdayVN = () => {
  // Có thể sửa logic nếu cần, hiện tại luôn trả về true
  return true;
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ==================== SEA TALK ====================
async function sendImage(webhookUrl, base64) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tag: "image",
      image_base64: { content: base64 },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gửi ảnh lỗi ${res.status}: ${err}`);
  }
}

// ==================== DATA ====================
async function fetchRoleDetails(roleKeys) {
  const { data, error } = await supabase
    .from("qc_roles")
    .select("role_key, display_name, qc_productivity_targets(low_threshold, medium_threshold)")
    .in("role_key", [...roleKeys]);

  if (error) throw new Error(`Lỗi lấy role: ${error.message}`);

  const map = new Map();
  (data || []).forEach((r) => {
    const t = r.qc_productivity_targets?.[0] || {};
    map.set(r.role_key, {
      display_name: r.display_name || r.role_key,
      low_threshold: t.low_threshold ?? DEFAULT_LOW,
      medium_threshold: t.medium_threshold ?? DEFAULT_MEDIUM,
    });
  });
  roleKeys.forEach((k) => {
    if (!map.has(k)) map.set(k, { display_name: k, low_threshold: DEFAULT_LOW, medium_threshold: DEFAULT_MEDIUM });
  });
  return map;
}

async function fetchActiveUsers() {
  const { data, error } = await supabase
    .from("qc_users")
    .select("email, name, is_active, role_id, qc_roles!inner(role_key, display_name)")
    .eq("is_active", true);

  if (error) throw new Error(`Lỗi lấy users: ${error.message}`);
  if (!data?.length) return { userMap: new Map(), roleKeys: new Set() };

  const userMap = new Map();
  const roleKeys = new Set();
  data.forEach((u) => {
    userMap.set(u.email, {
      email: u.email,
      name: u.name || "",
      role_key: u.qc_roles.role_key,
      display_name: u.qc_roles.display_name,
      total: 0,
      hourly: {},
    });
    roleKeys.add(u.qc_roles.role_key);
  });
  return { userMap, roleKeys };
}

async function mergeStats(targetDate, userMap) {
  const emails = [...userMap.keys()];
  if (emails.length === 0) return;

  const { data, error } = await supabase.rpc("get_dashboard_stats", {
    target_date: targetDate,
    user_emails: emails,
  });
  if (error) throw new Error(`Lỗi thống kê: ${error.message}`);

  (data || []).forEach((row) => {
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

// ==================== IMAGE ====================
function buildHTML(users, date, displayName, hStart, hEnd, roleMap, effectiveHours) {
  const sorted = [...users].sort((a, b) => b.displayTotal - a.displayTotal);
  const wHours = hEnd - hStart; // số cột giờ hiển thị

  const cellStyle = (cnt, low, med) => {
    if (!cnt) return "background:#f8fafc; color:#cbd5e1;";
    if (cnt < low) return "background:#fee2e2; color:#991b1b; font-weight:500;";
    if (cnt < med) return "background:#fef9c3; color:#92400e; font-weight:600;";
    return "background:#dcfce7; color:#166534; font-weight:700;";
  };

  const totalStyle = (t, low, med) => {
    const lo = low * effectiveHours;
    const hi = med * effectiveHours;
    if (!t) return "background:#f8fafc; color:#94a3b8;";
    if (t < lo) return "background:#fee2e2; color:#991b1b; font-weight:bold;";
    if (t < hi) return "background:#fef9c3; color:#92400e; font-weight:bold;";
    return "background:#dcfce7; color:#166534; font-weight:bold;";
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
    display:flex;
    justify-content:center;
  }
  .card{
    background:#fff;
    border-radius:16px;
    box-shadow:0 8px 30px rgba(0,0,0,0.06);
    padding:32px;
    max-width:fit-content;
    overflow-x:auto;
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
    background:#f1f5f9;
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
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:50px;">STT</th>
        <th class="user-cell">Nhân viên</th>
        <th class="total-header" style="width:90px;">Tổng</th>
        ${Array.from({ length: wHours }, (_, i) => `<th style="width:60px;">${hStart + i}:00</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${sorted.map((u, idx) => {
    const { low_threshold: low, medium_threshold: med } = roleMap.get(u.role_key) || {};
    const t = u.displayTotal || 0; // dùng tổng đã điều chỉnh
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
          <td style="${totalStyle(t, low, med)}">${t}</td>
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

async function generateImage(users, date, displayName, hStart, hEnd, roleMap, effectiveHours) {
  const html = buildHTML(users, date, displayName, hStart, hEnd, roleMap, effectiveHours);
  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 15000 });

    const wHours = hEnd - hStart;
    const colWidths = 50 + 200 + 90 + wHours * 60;
    const padding = 120;
    const viewportWidth = Math.max(800, colWidths + padding);
    await page.setViewport({ width: viewportWidth, height: 800 });

    const buf = await page.screenshot({ type: "png", fullPage: true });
    return buf.toString("base64");
  } finally {
    if (browser) await browser.close();
  }
}

// ==================== MAIN ====================
export default async function handler(req, res) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    console.log("[INFO] Bắt đầu gửi báo cáo...");

    // 1. Lấy cấu hình
    const cfg = await getConfig();
    if (!cfg.reportEnabled) {
      return res.json({ success: false, reason: "Báo cáo đang tắt." });
    }
    if (cfg.onlyWorkdays && !isWorkdayVN()) {
      return res.json({ success: false, reason: "Hôm nay không phải ngày làm việc." });
    }

    const hStart = cfg.reportHourStart;
    const hEnd = cfg.reportHourEnd;
    const date = getTodayVN();

    // 2. Lấy dữ liệu người dùng và thống kê
    const { userMap, roleKeys } = await fetchActiveUsers();
    if (userMap.size === 0) return res.json({ success: false, reason: "Không có user active." });

    const roleDetails = await fetchRoleDetails(roleKeys);
    await mergeStats(date, userMap);

    const withData = [...userMap.values()].filter(u => u.total > 0);
    if (withData.length === 0) {
      return res.json({ success: true, message: "Không có dữ liệu năng suất." });
    }

    // 3. Tính số giờ làm việc hiệu quả (đã trừ giờ nghỉ trưa)
    const totalHours = hEnd - hStart; // Tổng số giờ trong khung báo cáo
    const breakStart = cfg.breakStartHour + cfg.breakStartMin / 60;
    const breakEnd = cfg.breakEndHour + cfg.breakEndMin / 60;
    const hasFullBreak = (hStart <= breakStart && hEnd >= breakEnd);
    const effectiveHours = (hasFullBreak && totalHours > 1) ? totalHours - 1 : totalHours;

    // Tính displayTotal cho từng user
    withData.forEach(user => {
      let rawTotal = 0;
      for (let h = hStart; h < hEnd; h++) {
        rawTotal += user.hourly?.[h] || 0;
      }
      user.displayTotal = Math.round(rawTotal * effectiveHours / totalHours);
    });

    // 4. Nhóm theo role_key
    const groups = new Map();
    withData.forEach((u) => {
      const rk = u.role_key;
      if (!groups.has(rk)) groups.set(rk, []);
      groups.get(rk).push(u);
    });

    if (!cfg.webhook) {
      return res.json({ success: false, reason: "Thiếu webhook URL." });
    }

    // 5. Sinh ảnh và gửi
    const sent = [];
    for (const [rk, users] of groups.entries()) {
      const { display_name: dn } = roleDetails.get(rk) || { display_name: rk };
      console.log(`[INFO] Tạo ảnh cho ${dn} (${users.length} users)`);
      const b64 = await generateImage(users, date, dn, hStart, hEnd, roleDetails, effectiveHours);
      if (b64.length > MAX_IMAGE_BYTES) {
        console.warn(`[WARN] Ảnh ${dn} quá lớn, bỏ qua.`);
        continue;
      }
      await sendImage(cfg.webhook, b64);
      console.log(`[OK] Đã gửi ${dn}`);
      sent.push(dn);
      await delay(1200);
    }

    // 6. Ghi log
    await supabase.from("qc_report_logs").insert({
      report_type: "hourly_image_per_role",
      content_text: `Đã gửi ${sent.length} ảnh: ${sent.join(", ")}`,
      sent_at: new Date().toISOString(),
      status: "success",
    }).catch((e) => console.warn("Ghi log lỗi:", e.message));

    return res.json({ success: true, message: `Đã gửi ${sent.length} role`, roles: sent, date });

  } catch (err) {
    console.error("[FATAL]", err);
    await supabase.from("qc_report_logs").insert({
      report_type: "hourly_image_per_role",
      error_message: err.message,
      sent_at: new Date().toISOString(),
      status: "failed",
    }).catch(() => { });
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}