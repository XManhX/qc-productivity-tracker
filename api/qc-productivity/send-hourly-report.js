import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);

const VN_OFFSET = 7 * 3600 * 1000;

let cachedConfig = null;
let lastConfigFetch = 0;

// ==================== CONFIG ====================
async function getReportConfig() {
  const now = Date.now();
  if (cachedConfig && now - lastConfigFetch < 300_000) return cachedConfig;

  const { data, error } = await supabase
    .from("qc_alert_config")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) throw new Error(`Lấy cấu hình báo cáo lỗi: ${error.message}`);

  cachedConfig = data;
  lastConfigFetch = now;
  return data;
}

// ==================== UTILS ====================
const capitalizeName = (name) => {
  if (!name) return name;
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

function getTodayVN() {
  const now = new Date(Date.now() + VN_OFFSET);
  return now.toISOString().split("T")[0];
}

// ==================== SEA TALK WEBHOOK ====================
async function sendSeaTalkImage(webhookUrl, base64Content) {
  const payload = {
    tag: "image",
    image_base64: { content: base64Content },
  };
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gửi ảnh thất bại: ${response.status} - ${errorText}`);
  }
}

// ==================== DATA LAYER (giống dashboard) ====================
/**
 * Lấy thresholds cho từng role từ qc_roles và qc_productivity_targets.
 * Trả về Map<role_key, { low_threshold, medium_threshold }>
 */
async function getRoleThresholds(roleKeys) {
  const { data: rolesData, error } = await supabase
    .from("qc_roles")
    .select(
      "role_key, qc_productivity_targets(low_threshold, medium_threshold)"
    )
    .in("role_key", [...roleKeys]);

  if (error) throw new Error(`Lấy thresholds lỗi: ${error.message}`);

  const map = new Map();
  (rolesData || []).forEach((r) => {
    const t = r.qc_productivity_targets?.[0] || {};
    map.set(r.role_key, {
      low_threshold: t.low_threshold || 10,
      medium_threshold: t.medium_threshold || 16,
    });
  });

  // Đảm bảo role nào chưa có vẫn có giá trị mặc định
  roleKeys.forEach((key) => {
    if (!map.has(key)) map.set(key, { low_threshold: 10, medium_threshold: 16 });
  });

  return map;
}

// ==================== IMAGE GENERATION (cho một role) ====================
async function generateReportImageForRole(data, reportDate, role, hourStart, hourEnd, thresholdsMap) {
  const workingHours = hourEnd - hourStart + 1;
  const sortedData = [...data].sort((a, b) => b.total - a.total);

  const getCellStyle = (count, thresholds) => {
    if (count === 0) return "background:#f8fafc; color:#94a3b8;";
    if (count < thresholds.low_threshold)
      return "background:#fee2e2; color:#991b1b; font-weight:500;";
    if (count < thresholds.medium_threshold)
      return "background:#fef9c3; color:#854d0e; font-weight:600;";
    return "background:#dcfce7; color:#166534; font-weight:bold;";
  };

  const getTotalStyle = (total, thresholds) => {
    const lowTotal = thresholds.low_threshold * workingHours;
    const highTotal = thresholds.medium_threshold * workingHours;
    if (total === 0) return "background:#f8fafc; color:#94a3b8;";
    if (total < lowTotal) return "background:#fee2e2; color:#991b1b; font-weight:bold;";
    if (total < highTotal) return "background:#fef9c3; color:#854d0e; font-weight:bold;";
    return "background:#dcfce7; color:#166534; font-weight:bold;";
  };

  const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #fff;
    padding: 16px;
    margin: 0;
  }
  table {
    border-collapse: collapse;
    font-size: 13px;
    width: auto;
  }
  th {
    background: #f1f5f9;
    font-weight: 600;
    text-align: center;
    border: 1px solid #cbd5e1;
    padding: 8px 12px;
  }
  td {
    border: 1px solid #e2e8f0;
    padding: 8px 12px;
    text-align: center;
  }
  .user-cell { text-align: left; min-width: 200px; }
  .total-header { background: #ecfdf5; font-weight: 700; }
  .user-name { font-weight: 500; }
  .user-email { font-size: 11px; color: #64748b; }
  h1 { color: #1e40af; font-size: 24px; margin: 0 0 8px 0; }
  .subtitle { color: #64748b; font-size: 14px; margin-bottom: 16px; }
</style>
</head>
<body>
  <h1>📊 Báo cáo năng suất QC - ${role} - ${reportDate}</h1>
  <p class="subtitle">👥 ${sortedData.length} nhân viên &nbsp;|&nbsp; ⏰ ${hourStart}h - ${hourEnd}h</p>
  <table>
    <thead>
      <tr>
        <th>STT</th>
        <th class="user-cell">Nhân viên</th>
        <th class="total-header">Tổng SL</th>
        ${Array.from({ length: hourEnd - hourStart + 1 }, (_, i) => hourStart + i).map(h => `<th>${h}h</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${sortedData.map((user, index) => {
    // Lấy thresholds theo role (role_key) của user
    const thresholds = thresholdsMap.get(user.role_key) || { low_threshold: 10, medium_threshold: 16 };
    const total = user.total || 0;
    const name = capitalizeName(user.name) || user.email;
    const emailDisplay = user.name ? user.email : '';
    const hourly = user.hourly || {};

    return `
        <tr>
          <td>${index + 1}</td>
          <td class="user-cell">
            <div class="user-name">${name}</div>
            ${emailDisplay ? `<div class="user-email">${emailDisplay}</div>` : ''}
          </td>
          <td style="${getTotalStyle(total, thresholds)}">${total}</td>
          ${Array.from({ length: hourEnd - hourStart + 1 }, (_, i) => {
      const h = hourStart + i;
      const count = hourly[h] || 0;
      return `<td style="${getCellStyle(count, thresholds)}">${count === 0 ? '-' : count}</td>`;
    }).join('')}
        </tr>`;
  }).join('')}
    </tbody>
  </table>
</body>
</html>`;

  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });
    const screenshotBuffer = await page.screenshot({ type: "png", fullPage: true });
    return screenshotBuffer.toString("base64");
  } finally {
    if (browser) await browser.close();
  }
}

// ==================== MAIN HANDLER ====================
export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    console.log("[DEBUG] Bắt đầu send-hourly-report...");

    // ---------- 1. Config ----------
    const config = await getReportConfig();
    if (!config) throw new Error("Không tìm thấy cấu hình báo cáo");
    if (!config.report_enabled) {
      console.log("[DEBUG] Báo cáo bị tắt");
      return res.json({ success: false, reason: "Báo cáo đã bị tắt" });
    }

    const hourStart = config.report_hour_start || 9;
    const hourEnd = config.report_hour_end || 18;
    const reportDate = getTodayVN();

    // ---------- 2. Lấy danh sách user active ----------
    const { data: users, error: usersError } = await supabase
      .from("qc_users")
      .select(`email, name, is_active, role_id, qc_roles!inner(role_key, display_name)`)
      .eq("is_active", true);

    if (usersError) throw new Error(`Lấy users lỗi: ${usersError.message}`);
    if (!users || users.length === 0) {
      return res.json({ success: false, reason: "Không có user active" });
    }

    // Map user info
    const userMap = new Map();
    const roleKeys = new Set();
    for (const u of users) {
      userMap.set(u.email, {
        email: u.email,
        name: u.name || "",
        role_key: u.qc_roles.role_key,
        display_name: u.qc_roles.display_name,
        total: 0,
        hourly: {}, // sẽ được điền sau
      });
      roleKeys.add(u.qc_roles.role_key);
    }

    const userEmails = [...userMap.keys()];

    // ---------- 3. Lấy thresholds theo role ----------
    const roleThresholdsMap = await getRoleThresholds(roleKeys);

    // ---------- 4. Gọi SQL function giống dashboard ----------
    const { data: stats, error: statsError } = await supabase.rpc(
      "get_dashboard_stats",
      {
        target_date: reportDate,
        user_emails: userEmails,
      }
    );
    if (statsError) throw new Error(`Lỗi thống kê: ${statsError.message}`);

    // ---------- 5. Merge dữ liệu ----------
    (stats || []).forEach((row) => {
      const user = userMap.get(row.email);
      if (!user) return;
      user.total = row.total || 0;
      // Chuyển đổi hourly từ object (key là string) sang object với key là number
      if (row.hourly) {
        const hourlyObj = {};
        Object.entries(row.hourly).forEach(([h, count]) => {
          const hour = parseInt(h, 10);
          if (hour >= 0 && hour < 24) hourlyObj[hour] = count;
        });
        user.hourly = hourlyObj;
      }
    });

    // Lọc user có total > 0 trong khoảng giờ làm việc
    const usersWithData = [];
    for (const user of userMap.values()) {
      if (user.total > 0) {
        usersWithData.push(user);
      }
    }

    if (usersWithData.length === 0) {
      return res.json({ success: true, message: "Không có dữ liệu năng suất để báo cáo" });
    }

    // ---------- 6. Nhóm theo role_key ----------
    const roleGroups = new Map();
    usersWithData.forEach((user) => {
      const role = user.role_key || "Khác";
      if (!roleGroups.has(role)) roleGroups.set(role, []);
      roleGroups.get(role).push(user);
    });

    const webhookUrl = config.report_seatalk_webhook_url || config.seatalk_webhook_url;
    if (!webhookUrl) {
      return res.json({ success: false, reason: "Thiếu webhook URL" });
    }

    const sentRoles = [];

    // ---------- 7. Tạo và gửi ảnh cho từng role ----------
    for (const [role, usersOfRole] of roleGroups.entries()) {
      console.log(`[DEBUG] Tạo ảnh cho role: ${role} (${usersOfRole.length} users)`);

      const base64Image = await generateReportImageForRole(
        usersOfRole, reportDate, role, hourStart, hourEnd, roleThresholdsMap
      );

      if (base64Image.length > 5 * 1024 * 1024) {
        console.warn(`[WARN] Ảnh role ${role} vượt 5MB, bỏ qua`);
        continue;
      }

      await sendSeaTalkImage(webhookUrl, base64Image);
      console.log(`[INFO] Đã gửi ảnh cho role ${role}`);
      sentRoles.push(role);

      // Delay nhẹ để tránh rate limit (60 msg/min)
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // ---------- 8. Ghi log ----------
    try {
      await supabase.from("qc_report_logs").insert({
        report_type: "hourly_image_per_role",
        content_text: `Đã gửi ${sentRoles.length} ảnh cho các role: ${sentRoles.join(', ')} (${reportDate})`,
        sent_at: new Date().toISOString(),
        status: "success",
      });
    } catch (e) {
      console.warn("Ghi log thất bại:", e.message);
    }

    return res.json({
      success: true,
      message: `Đã gửi ảnh báo cáo cho ${sentRoles.length} role: ${sentRoles.join(', ')}`,
      reportDate,
      roles: sentRoles,
    });

  } catch (error) {
    console.error("[send-hourly-report] Lỗi:", error);
    try {
      await supabase.from("qc_report_logs").insert({
        report_type: "hourly_image_per_role",
        error_message: error.message,
        sent_at: new Date().toISOString(),
        status: "failed",
      });
    } catch (e) {
      console.error("Ghi log lỗi thất bại:", e.message);
    }
    return res.status(500).json({ success: false, error: error.message });
  }
}