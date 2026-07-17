import crypto from 'crypto';

const AUTH_SECRET = process.env.AUTH_SECRET || "secure-default-secret-key-replace-me-in-prod";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function generateSessionToken(email) {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 giờ
  const payload = JSON.stringify({ email, expiresAt });
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}.${signature}`).toString('base64');
}

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-QC-Session-Token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(200).json({ allowed: false, reason: "missing_email" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Kiểm tra cấu hình biến môi trường trước khi gọi Supabase để tránh crash
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error("[Auth Error] Cấu hình Supabase bị thiếu trên Vercel!");
      return res.status(500).json({ error: "Database configuration missing on server" });
    }

    // Gọi Supabase REST API
    const dbResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/qc_users?email=eq.${encodeURIComponent(normalizedEmail)}&is_active=eq.true&select=role`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!dbResponse.ok) {
      const errText = await dbResponse.text();
      console.error("[Auth Error] Supabase trả lỗi:", errText);
      return res.status(500).json({ error: "Failed to fetch user status from database" });
    }

    const users = await dbResponse.json();

    if (!users || users.length === 0) {
      return res.status(200).json({ allowed: false, reason: "user_not_found_or_inactive" });
    }

    // Sinh session token hợp lệ gửi về client
    const sessionToken = generateSessionToken(normalizedEmail);
    return res.status(200).json({ allowed: true, session_token: sessionToken });

  } catch (error) {
    console.error("[Auth Server Crash Error]:", error);
    return res.status(500).json({ error: "Internal server error", message: error.message });
  }
};