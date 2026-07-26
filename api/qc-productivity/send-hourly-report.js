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

// ---------- Cache ----------
let configCache = null;
let configCacheTime = 0;

// ==================== CONFIG ====================
async function getReportConfig() {
  const now = Date.now();
  if (configCache && now - configCacheTime < 300_000) return configCache;

  const { data, error } = await supabase
    .from("qc_alert_config")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) throw new Error(`Lỗi lấy cấu hình: ${error.message}`);
  configCache = data;
  configCacheTime = now;
  return data;
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
function buildHTML(users, date, displayName, hStart, hEnd, roleMap) {
  const sorted = [...users].sort((a, b) => b.total - a.total);
  const wHours = hEnd - hStart + 1;

  const cellStyle = (cnt, low, med) => {
    if (!cnt) return "background:#f8fafc; color:#cbd5e1;";
    if (cnt < low) return "background:#fee2e2; color:#991b1b; font-weight:500;";
    if (cnt < med) return "background:#fef9c3; color:#92400e; font-weight:600;";
    return "background:#dcfce7; color:#166534; font-weight:700;";
  };

  const totalStyle = (t, low, med) => {
    const lo = low * wHours;
    const hi = med * wHours;
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
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fff;padding:20px;}
  .card{max-width:1100px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 4px 12px rgba(0,0,0,0.05);}
  .title{font-size:26px;font-weight:700;color:#1e293b;margin-bottom:8px;}
  .meta{display:flex;gap:24px;font-size:14px;color:#64748b;background:#f8fafc;padding:8px 16px;border-radius:8px;margin-bottom:20px;}
  table{border-collapse:separate;border-spacing:0;font-size:13px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;width:auto;}
  th{background:#f1f5f9;font-weight:600;color:#475569;padding:10px 14px;border-bottom:1px solid #cbd5e1;text-align:center;}
  td{padding:8px 12px;text-align:center;border-bottom:1px solid #e2e8f0;}
  tr:last-child td{border-bottom:none;}
  .user-cell{text-align:left;min-width:200px;}
  .user-name{font-weight:600;color:#1e293b;}
  .user-email{font-size:11px;color:#94a3b8;}
  .total-header{background:#ecfdf5;font-weight:700;color:#065f46;}
</style></head>
<body>
<div class="card">
  <div class="title">📊 Báo cáo năng suất - ${displayName} - ${date}</div>
  <div class="meta">
    <div>👥 ${sorted.length} nhân viên</div>
    <div>⏰ ${hStart}:00 - ${hEnd}:00</div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:50px;">STT</th>
        <th class="user-cell">Nhân viên</th>
        <th class="total-header" style="width:90px;">Tổng SL</th>
        ${Array.from({ length: wHours }, (_, i) => `<th style="width:60px;">${hStart + i}h</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${sorted.map((u, idx) => {
    const { low_threshold: low, medium_threshold: med } = roleMap.get(u.role_key) || {};
    const t = u.total || 0;
    const name = capitalizeName(u.name) || u.email;
    const email = u.name ? u.email : '';
    const hour = u.hourly || {};
    return `
        <tr>
          <td style="color:#64748b;">${idx + 1}</td>
          <td class="user-cell">
            <div class="user-name">${name}</div>
            ${email ? `<div class="user-email">${email}</div>` : ''}
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

async function generateImage(users, date, displayName, hStart, hEnd, roleMap) {
  const html = buildHTML(users, date, displayName, hStart, hEnd, roleMap);
  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 15000 });
    const buf = await page.screenshot({ type: "png", fullPage: true });
    return buf.toString("base64");
  } finally {
    if (browser) await browser.close();
  }
}

// ==================== MAIN ====================
export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    console.log("[INFO] Bắt đầu gửi báo cáo...");
    const cfg = await getReportConfig();
    if (!cfg?.report_enabled) {
      return res.json({ success: false, reason: "Báo cáo đang tắt." });
    }

    const hStart = cfg.report_hour_start ?? 9;
    const hEnd = cfg.report_hour_end ?? 18;
    const date = getTodayVN();

    const { userMap, roleKeys } = await fetchActiveUsers();
    if (userMap.size === 0) return res.json({ success: false, reason: "Không có user active." });

    const roleDetails = await fetchRoleDetails(roleKeys);
    await mergeStats(date, userMap);

    const withData = [...userMap.values()].filter(u => u.total > 0);
    if (withData.length === 0) return res.json({ success: true, message: "Không có dữ liệu năng suất." });

    const groups = new Map();
    withData.forEach((u) => {
      const rk = u.role_key;
      if (!groups.has(rk)) groups.set(rk, []);
      groups.get(rk).push(u);
    });

    const webhook = cfg.report_seatalk_webhook_url || cfg.seatalk_webhook_url;
    if (!webhook) return res.json({ success: false, reason: "Thiếu webhook URL." });

    const sent = [];
    for (const [rk, users] of groups.entries()) {
      const { display_name: dn } = roleDetails.get(rk) || { display_name: rk };
      console.log(`[INFO] Tạo ảnh cho ${dn} (${users.length} users)`);
      const b64 = await generateImage(users, date, dn, hStart, hEnd, roleDetails);
      if (b64.length > MAX_IMAGE_BYTES) {
        console.warn(`[WARN] Ảnh ${dn} quá lớn, bỏ qua.`);
        continue;
      }
      await sendImage(webhook, b64);
      console.log(`[OK] Đã gửi ${dn}`);
      sent.push(dn);
      await delay(1200);
    }

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