const crypto = require("crypto");

const AUTH_SECRET =
  process.env.AUTH_SECRET || "secure-default-secret-key-replace-me-in-prod";

// Hàm xác thực tính hợp lệ và thời hạn của token
function verifySessionToken(token) {
  if (!token) return null;
  try {
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const [payloadStr, signature] = decoded.split(".");

    const expectedSignature = crypto
      .createHmac("sha256", AUTH_SECRET)
      .update(payloadStr)
      .digest("hex");
    if (signature !== expectedSignature) return null;

    const payload = JSON.parse(payloadStr);
    if (Date.now() > payload.expiresAt) return null; // Token đã hết hạn

    return payload.email;
  } catch (e) {
    return null;
  }
}

module.exports = async (req, res) => {
  // CORS setup
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-QC-Session-Token",
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const sessionToken = req.headers["x-qc-session-token"];

    // 1. Xác thực Token bảo mật
    const verifiedEmail = verifySessionToken(sessionToken);
    if (!verifiedEmail) {
      return res
        .status(401)
        .json({ error: "Invalid or expired session token" });
    }

    const logData = req.body;

    // 2. Validate chéo dữ liệu người dùng gửi lên
    if (logData.operator.trim().toLowerCase() !== verifiedEmail) {
      return res
        .status(400)
        .json({ error: "Operator mismatch with authenticated session" });
    }

    // 3. Xử lý lưu trữ dữ liệu (Lưu vào Database / đẩy sang Google Sheet / gửi Webhook Slack...)
    // Ở mức độ cơ bản nhất, chúng ta ghi log ra console của Vercel
    console.log("📥 QC_LOG_RECEIVED:", JSON.stringify(logData));

    // --- KHUYẾN NGHỊ TÍCH HỢP GHI DỮ LIỆU ---
    // Bạn có thể dễ dàng chèn code kết nối Database (Supabase, MongoDB)
    // Hoặc gọi API của Google Sheet / Slack Webhook tại đây:
    /*
    await fetch('YOUR_SLACK_WEBHOOK_URL', {
      method: 'POST',
      body: JSON.stringify({ text: `QC Operator ${logData.operator} vừa hoàn thành: ${logData.asn}` })
    });
    */

    return res
      .status(200)
      .json({ success: true, message: "Log saved successfully" });
  } catch (error) {
    console.error("Log API Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
