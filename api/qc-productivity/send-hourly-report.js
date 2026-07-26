import { createClient } from "@supabase/supabase-js";
import nodeHtmlToImage from "node-html-to-image";
import chromium from "@sparticuz/chromium";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);

const VN_OFFSET = 7 * 3600 * 1000;

let cachedConfig = null;
let lastConfigFetch = 0;

async function getReportConfig() {
  const now = Date.now();
  if (cachedConfig && now - lastConfigFetch < 300_000) {
    return cachedConfig;
  }

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

async function sendSeaTalkImage(webhookUrl, base64Content) {
  const payload = {
    tag: "image",
    image_base64: {
      content: base64Content,
    },
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

async function generateReportImage(data, reportDate, hourStart, hourEnd, thresholdsMap) {
  const workingHours = hourEnd - hourStart + 1;
  const sortedData = [...data].sort((a, b) => b.total - a.total);

  const htmlContent = `
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            background-color: #f8fafc; 
            padding: 30px; 
            margin: 0;
          }
          .container { 
            background-color: white; 
            border-radius: 12px; 
            padding: 30px; 
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); 
            max-width: 900px;
            margin: 0 auto;
          }
          h1 { 
            color: #1e40af; 
            font-size: 28px; 
            margin-top: 0;
          }
          .subtitle {
            color: #64748b;
            font-size: 16px;
            margin-bottom: 30px;
          }
          .stats {
            display: flex;
            gap: 30px;
            margin-bottom: 30px;
            flex-wrap: wrap;
          }
          .stat-item {
            background-color: #f1f5f9;
            padding: 15px 25px;
            border-radius: 8px;
          }
          .stat-label {
            color: #64748b;
            font-size: 14px;
          }
          .stat-value {
            color: #0f172a;
            font-size: 24px;
            font-weight: bold;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 20px;
          }
          th, td { 
            padding: 14px; 
            text-align: left; 
            border-bottom: 1px solid #e2e8f0; 
          }
          th { 
            background-color: #f1f5f9; 
            color: #334155;
            font-weight: 600;
          }
          tr:hover {
            background-color: #f8fafc;
          }
          .user-info {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .user-avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background-color: #e2e8f0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            color: #475569;
          }
          .total-green {
            background-color: #dcfce7;
            color: #166534;
            font-weight: bold;
            text-align: center;
          }
          .total-yellow {
            background-color: #fef9c3;
            color: #854d0e;
            font-weight: bold;
            text-align: center;
          }
          .total-red {
            background-color: #fee2e2;
            color: #991b1b;
            font-weight: bold;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📊 Báo cáo năng suất QC - ${reportDate}</h1>
          <p class="subtitle">Thống kê sản lượng làm việc của toàn bộ nhân viên</p>
          <div class="stats">
            <div class="stat-item">
              <div class="stat-label">Tổng nhân viên</div>
              <div class="stat-value">${sortedData.length}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">Giờ làm việc</div>
              <div class="stat-value">${hourStart}h - ${hourEnd}h</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>STT</th>
                <th>Nhân viên</th>
                <th>Role</th>
                <th>Tổng sản lượng</th>
              </tr>
            </thead>
            <tbody>
              ${sortedData.map((user, index) => {
    const thresholds = thresholdsMap.get(user.email) || { low: 10, medium: 16 };
    const lowTotal = thresholds.low * workingHours;
    const highTotal = thresholds.medium * workingHours;
    const total = user.total || 0;
    let cellClass = 'total-red';
    if (total >= highTotal) cellClass = 'total-green';
    else if (total >= lowTotal) cellClass = 'total-yellow';

    return `
                    <tr>
                      <td>${index + 1}</td>
                      <td>
                        <div class="user-info">
                          <div class="user-avatar">
                            ${(user.name || user.email).substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style="font-weight: 600; color: #1e293b;">${capitalizeName(user.name) || user.email}</div>
                            <div style="font-size: 12px; color: #64748b;">${user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>${user.display_name || user.role_key || '-'}</td>
                      <td class="${cellClass}">${total}</td>
                    </tr>
                  `;
  }).join('')}
            </tbody>
          </table>
        </div>
      </body>
    </html>
  `;

  const imagePath = path.join(os.tmpdir(), `report-${Date.now()}.png`);

  await nodeHtmlToImage({
    output: imagePath,
    html: htmlContent,
    puppeteer: chromium.puppeteer,
    puppeteerArgs: chromium.args,
  });

  const fileBuffer = await fs.readFile(imagePath);
  await fs.unlink(imagePath);
  return fileBuffer.toString("base64");
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    console.log("[DEBUG] Bắt đầu send-hourly-report...");

    const config = await getReportConfig();
    if (!config) throw new Error("Không tìm thấy cấu hình báo cáo");
    if (!config.report_enabled) {
      console.log("[DEBUG] Báo cáo bị tắt");
      return res.json({ success: false, reason: "Báo cáo đã bị tắt" });
    }

    const hourStart = config.report_hour_start || 9;
    const hourEnd = config.report_hour_end || 18;
    const reportDate = getTodayVN();

    const { data: users, error: usersError } = await supabase
      .from("qc_users")
      .select(`email, name, is_active, role_id, qc_roles!inner(role_key, display_name)`)
      .eq("is_active", true);

    if (usersError) throw new Error(`Lấy users lỗi: ${usersError.message}`);
    if (!users || users.length === 0) {
      return res.json({ success: false, reason: "Không có user active" });
    }

    const userEmails = users.map(u => u.email);

    const { data: targets, error: targetsError } = await supabase
      .from("qc_productivity_targets")
      .select("email, low_threshold, medium_threshold")
      .in("email", userEmails);

    const thresholdsMap = new Map();
    if (targets) {
      targets.forEach(t => thresholdsMap.set(t.email, {
        low: t.low_threshold || 10,
        medium: t.medium_threshold || 16,
      }));
    }
    users.forEach(u => {
      if (!thresholdsMap.has(u.email)) {
        thresholdsMap.set(u.email, { low: 10, medium: 16 });
      }
    });

    const { data: stats, error: statsError } = await supabase.rpc(
      "get_dashboard_stats",
      { target_date: reportDate, user_emails: userEmails }
    );
    if (statsError) throw new Error(`Lỗi thống kê: ${statsError.message}`);

    const reportMap = new Map();
    users.forEach(u => reportMap.set(u.email, { ...u, total: 0 }));
    (stats || []).forEach(row => {
      const entry = reportMap.get(row.email);
      if (entry) entry.total = row.total || 0;
    });

    let processedData = Array.from(reportMap.values())
      .filter(u => u.total > 0)
      .sort((a, b) => b.total - a.total);

    const webhookUrl = config.report_seatalk_webhook_url || config.seatalk_webhook_url;
    if (!webhookUrl) {
      return res.json({ success: false, reason: "Thiếu webhook URL" });
    }

    // Tạo ảnh và gửi
    const base64Image = await generateReportImage(
      processedData, reportDate, hourStart, hourEnd, thresholdsMap
    );

    if (base64Image.length > 5 * 1024 * 1024) {
      throw new Error("Ảnh base64 vượt quá 5MB, không thể gửi");
    }

    await sendSeaTalkImage(webhookUrl, base64Image);
    console.log("Đã gửi ảnh báo cáo thành công");

    // Ghi log thành công
    try {
      await supabase.from("qc_report_logs").insert({
        report_type: "hourly_image",
        content_text: `Ảnh báo cáo ${reportDate} (${processedData.length} users)`,
        sent_at: new Date().toISOString(),
        status: "success",
      });
    } catch (e) {
      console.warn("Ghi log ảnh lỗi:", e.message);
    }

    return res.json({
      success: true,
      message: "Đã gửi ảnh báo cáo thành công",
      reportDate,
      totalUsers: processedData.length,
    });

  } catch (error) {
    console.error("[send-hourly-report] Lỗi:", error);

    try {
      await supabase.from("qc_report_logs").insert({
        report_type: "hourly_image",
        error_message: error.message,
        sent_at: new Date().toISOString(),
        status: "failed",
      });
    } catch (e) {
      console.error("Ghi log lỗi thất bại:", e.message);
    }

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}