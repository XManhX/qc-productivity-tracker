const crypto = require('crypto');

const AUTH_SECRET = process.env.AUTH_SECRET || "secure-default-secret-key-replace-me-in-prod";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function generateSessionToken(email) {
  const expiresAt = Date.now() + 15 * 60 * 1000; // Token sống trong 15 phút
  const payload = JSON.stringify({ email, expiresAt });
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}.${signature}`).toString('base64');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-QC-Session-Token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email } = req.body;
    if (!email) {
      return res.status(200).json({ allowed: false, reason: "missing_email" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Gọi Supabase REST API để lấy thông tin user đang Active
    const dbResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/qc_users?email=eq.${encodeURIComponent(normalizedEmail)}&is_active=eq.true&select=role`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!dbResponse.ok) {
      console.error("DB Error:", await dbResponse.text());
      return res.status(500).json({ allowed: false, reason: "database_error" });
    }

    const users = await dbResponse.json();

    // Nếu không tìm thấy user hoặc user bị vô hiệu hóa
    if (!users || users.length === 0) {
      return res.status(200).json({
        allowed: false,
        reason: "unauthorized_user"
      });
    }

    const user = users[0];
    const sessionToken = generateSessionToken(normalizedEmail);

    return res.status(200).json({
      allowed: true,
      reason: "authorized",
      user: {
        email: normalizedEmail,
        role: user.role || "qc"
      },
      session_token: sessionToken
    });
  } catch (error) {
    console.error("Authz Error:", error);
    return res.status(500).json({ allowed: false, reason: "internal_server_error" });
  }
};