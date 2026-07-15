const crypto = require("crypto");

// Đọc danh sách Email cho phép từ Environment Variable trên Vercel
// Ví dụ cấu hình trên Vercel: ALLOWED_EMAILS=xuanmanh.nguyen@shopee.com,user2@shopee.com
const ALLOWED_EMAILS = process.env.ALLOWED_EMAILS
  ? process.env.ALLOWED_EMAILS.split(",").map((e) => e.trim().toLowerCase())
  : ["xuanmanh.nguyen@shopee.com"]; // Fallback mặc định

// Khóa bảo mật dùng để ký mã token (Cần cấu hình AUTH_SECRET phức tạp trên Vercel)
const AUTH_SECRET =
  process.env.AUTH_SECRET || "secure-default-secret-key-replace-me-in-prod";

// Hàm tự tạo Session Token bảo mật không cần cài thêm thư viện JWT bên ngoài
function generateSessionToken(email) {
  const expiresAt = Date.now() + 15 * 60 * 1000; // Token có hiệu lực trong 15 phút
  const payload = JSON.stringify({ email, expiresAt });
  const signature = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}.${signature}`).toString("base64");
}

module.exports = async (req, res) => {
  // Cấu hình CORS để cho phép Tampermonkey/WMS có thể gọi API này[cite: 4]
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
    const { email, page } = req.body;

    if (!email) {
      return res.status(200).json({
        allowed: false,
        reason: "missing_email",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 1. Kiểm tra Email có thuộc danh sách được phép không
    const isAllowed = ALLOWED_EMAILS.includes(normalizedEmail);

    if (!isAllowed) {
      return res.status(200).json({
        allowed: false,
        reason: "unauthorized_user",
      });
    }

    // 2. Tạo session_token ngắn hạn
    const sessionToken = generateSessionToken(normalizedEmail);

    return res.status(200).json({
      allowed: true,
      reason: "authorized",
      user: {
        email: normalizedEmail,
        role: "qc",
      },
      session_token: sessionToken,
    });
  } catch (error) {
    console.error("Authz Error:", error);
    return res
      .status(500)
      .json({ allowed: false, reason: "internal_server_error" });
  }
};
