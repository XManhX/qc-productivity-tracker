// api/qc-productivity/send-hourly-report.js
import React from "react";
import { createClient } from "@supabase/supabase-js";
import { ImageResponse } from "@vercel/og";

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

async function sendSeaTalkTextMessage(webhookUrl, markdownContent) {
  const payload = {
    tag: "text",
    text: {
      format: 1,
      content: markdownContent,
    },
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gửi text thất bại: ${response.status} - ${errorText}`);
  }
}

async function generateReportImageBuffer(
  data,
  reportDate,
  hourStart,
  hourEnd,
  thresholdsMap,
) {
  const workingHours = hourEnd - hourStart + 1;
  const rows = data.map((user, index) => {
    const thresholds = thresholdsMap.get(user.email) || { low: 10, medium: 16 };
    const lowTotal = thresholds.low * workingHours;
    const highTotal = thresholds.medium * workingHours;
    const total = user.total;
    let bgColor = "#fee2e2"; // đỏ mặc định
    let textColor = "#991b1b";
    if (total >= highTotal) {
      bgColor = "#dcfce7"; // xanh
      textColor = "#166534";
    } else if (total >= lowTotal) {
      bgColor = "#fef9c3"; // vàng
      textColor = "#854d0e";
    }

    const displayName = capitalizeName(user.name) || user.email;
    const role = user.display_name || user.role_key || "-";

    return {
      index,
      displayName,
      email: user.email,
      role,
      total,
      bgColor,
      textColor,
    };
  });

  // Tính chiều cao ảnh: header + mỗi dòng 48px
  const rowHeight = 48;
  const height = 120 + rows.length * rowHeight; // 120 cho tiêu đề + padding

  const img = new ImageResponse(
    <div
      style={{
        fontFamily: "Arial, sans-serif",
        backgroundColor: "#f8fafc",
        padding: "30px",
        display: "flex",
        flexDirection: "column",
        width: "900px",
        height: "100%",
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "30px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
          display: "flex",
          flexDirection: "column",
          flex: 1,
        }}
      >
        <h1 style={{ color: "#1e40af", fontSize: "28px", margin: "0 0 8px 0" }}>
          📊 Báo cáo năng suất QC - {reportDate}
        </h1>
        <p style={{ color: "#64748b", fontSize: "16px", margin: "0 0 20px 0" }}>
          👥 Nhân viên có dữ liệu: {rows.length} &nbsp;|&nbsp; ⏰ {hourStart}h -{" "}
          {hourEnd}h
        </p>

        {/* Bảng */}
        <div
          style={{ display: "flex", flexDirection: "column", width: "100%" }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              backgroundColor: "#f1f5f9",
              fontWeight: 600,
              color: "#334155",
              borderBottom: "1px solid #e2e8f0",
            }}
          >
            <div style={{ width: "50px", padding: "14px" }}>STT</div>
            <div style={{ flex: 2, padding: "14px" }}>Nhân viên</div>
            <div style={{ flex: 1, padding: "14px" }}>Role</div>
            <div
              style={{ width: "100px", padding: "14px", textAlign: "center" }}
            >
              Tổng SL
            </div>
          </div>
          {/* Rows */}
          {rows.map((row) => (
            <div
              style={{
                display: "flex",
                borderBottom: "1px solid #e2e8f0",
                backgroundColor: row.index % 2 === 0 ? "#ffffff" : "#f8fafc",
              }}
              key={row.email}
            >
              <div style={{ width: "50px", padding: "14px", color: "#1e293b" }}>
                {row.index + 1}
              </div>
              <div
                style={{
                  flex: 2,
                  padding: "14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                {/* Avatar tròn */}
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    backgroundColor: "#e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    fontWeight: "bold",
                    color: "#475569",
                  }}
                >
                  {(row.displayName || row.email).substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: "#1e293b" }}>
                    {row.displayName}
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>
                    {row.email}
                  </div>
                </div>
              </div>
              <div style={{ flex: 1, padding: "14px", color: "#1e293b" }}>
                {row.role}
              </div>
              <div
                style={{
                  width: "100px",
                  padding: "14px",
                  textAlign: "center",
                  fontWeight: "bold",
                  backgroundColor: row.bgColor,
                  color: row.textColor,
                }}
              >
                {row.total}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    {
      width: 900,
      height: height,
    },
  );

  const buffer = Buffer.from(await img.arrayBuffer());
  return buffer;
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

    // Lấy users kèm thresholds
    const { data: users, error: usersError } = await supabase
      .from("qc_users")
      .select(
        `email, name, is_active, role_id, qc_roles!inner(role_key, display_name)`,
      )
      .eq("is_active", true);

    if (usersError) throw new Error(`Lấy users lỗi: ${usersError.message}`);
    if (!users || users.length === 0) {
      return res.json({ success: false, reason: "Không có user active" });
    }

    const userEmails = users.map((u) => u.email);

    // Lấy thresholds riêng từ qc_productivity_targets (giả sử có cột email, low_threshold, medium_threshold)
    const { data: targets, error: targetsError } = await supabase
      .from("qc_productivity_targets")
      .select("email, low_threshold, medium_threshold")
      .in("email", userEmails);

    // Tạo map ngưỡng, mặc định 10/16 nếu không có
    const thresholdsMap = new Map();
    if (targets) {
      targets.forEach((t) => {
        thresholdsMap.set(t.email, {
          low: t.low_threshold || 10,
          medium: t.medium_threshold || 16,
        });
      });
    }
    // Đảm bảo tất cả user đều có threshold mặc định
    users.forEach((u) => {
      if (!thresholdsMap.has(u.email)) {
        thresholdsMap.set(u.email, { low: 10, medium: 16 });
      }
    });

    // Lấy stats
    const { data: stats, error: statsError } = await supabase.rpc(
      "get_dashboard_stats",
      { target_date: reportDate, user_emails: userEmails },
    );

    if (statsError) throw new Error(`Lỗi thống kê: ${statsError.message}`);

    const reportMap = new Map();
    users.forEach((u) => reportMap.set(u.email, { ...u, total: 0 }));
    (stats || []).forEach((row) => {
      const entry = reportMap.get(row.email);
      if (entry) entry.total = row.total || 0;
    });

    let processedData = Array.from(reportMap.values())
      .filter((u) => u.total > 0)
      .sort((a, b) => b.total - a.total);

    // Gửi ảnh
    const webhookUrl =
      config.report_seatalk_webhook_url || config.seatalk_webhook_url;
    if (!webhookUrl) {
      return res.json({ success: false, reason: "Thiếu webhook URL" });
    }

    try {
      // Tạo ảnh buffer
      const imageBuffer = await generateReportImageBuffer(
        processedData,
        reportDate,
        hourStart,
        hourEnd,
        thresholdsMap,
      );
      const base64Image = imageBuffer.toString("base64");

      // Kiểm tra kích thước (cảnh báo nếu > 5MB)
      if (base64Image.length > 5 * 1024 * 1024) {
        console.warn("Ảnh quá lớn, fallback sang text");
        throw new Error("Ảnh vượt quá 5MB");
      }

      await sendSeaTalkImage(webhookUrl, base64Image);
      console.log("Đã gửi ảnh báo cáo thành công");

      // Ghi log
      try {
        await supabase.from("qc_report_logs").insert({
          report_type: "hourly_image",
          content_text: `Ảnh báo cáo ${reportDate} (${processedData.length} users)`,
          sent_at: new Date().toISOString(),
          status: "success",
        });
      } catch (logErr) {
        console.warn("Ghi log thất bại:", logErr.message);
      }

      return res.json({
        success: true,
        message: "Đã gửi ảnh báo cáo thành công",
        reportDate,
        totalUsers: processedData.length,
      });
    } catch (imageError) {
      console.error("Lỗi tạo/gửi ảnh, fallback sang text:", imageError);

      // Fallback: tạo text markdown có emoji
      let markdown = `📊 **BÁO CÁO NĂNG SUẤT QC - ${reportDate}**\n\n`;
      markdown += `👥 **Tổng số nhân viên có dữ liệu:** ${processedData.length}\n`;
      markdown += `⏰ **Giờ làm việc:** ${hourStart}h - ${hourEnd}h\n\n`;
      if (processedData.length > 0) {
        markdown += `| STT | Nhân viên | Role | Tổng SL |\n|---|---|---|---|\n`;
        const workingHours = hourEnd - hourStart + 1;
        processedData.forEach((user, index) => {
          const thresholds = thresholdsMap.get(user.email) || {
            low: 10,
            medium: 16,
          };
          const lowTotal = thresholds.low * workingHours;
          const highTotal = thresholds.medium * workingHours;
          const total = user.total;
          let emoji = "";
          if (total >= highTotal) emoji = "✅ ";
          else if (total >= lowTotal) emoji = "⚠️ ";
          else emoji = "❌ ";
          const displayName = capitalizeName(user.name) || user.email;
          const role = user.display_name || user.role_key || "-";
          markdown += `| ${index + 1} | ${displayName} | ${role} | ${emoji}${total} |\n`;
        });
      } else {
        markdown += `⚠️ Không có dữ liệu năng suất.`;
      }

      if (markdown.length > 4096) {
        markdown = markdown.substring(0, 4000) + "\n\n... (đã cắt bớt)";
      }

      await sendSeaTalkTextMessage(webhookUrl, markdown);
      console.log("Đã gửi text fallback");

      try {
        await supabase.from("qc_report_logs").insert({
          report_type: "hourly_text_fallback",
          content_text: markdown,
          sent_at: new Date().toISOString(),
          status: "success",
        });
      } catch (logErr) {
        console.warn("Ghi log thất bại:", logErr.message);
      }

      return res.json({
        success: true,
        message: "Gửi ảnh thất bại, đã gửi text thay thế",
        reportDate,
        totalUsers: processedData.length,
      });
    }
  } catch (error) {
    console.error("[send-hourly-report] Lỗi:", error);

    try {
      await supabase.from("qc_report_logs").insert({
        report_type: "hourly_error",
        error_message: error.message,
        sent_at: new Date().toISOString(),
        status: "failed",
      });
    } catch (logErr) {
      console.error("Không thể ghi log lỗi:", logErr);
    }

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
