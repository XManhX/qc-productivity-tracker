import crypto from 'crypto';

const AUTH_SECRET = process.env.AUTH_SECRET || "default-secret";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    // Giải mã token
    const payloadStr = Buffer.from(token.split('.')[0], 'base64url').toString();
    const payload = JSON.parse(payloadStr);
    const email = payload.email;

    if (!email || payload.exp < Date.now()) {
      return res.status(401).json({ error: 'Token expired or invalid' });
    }

    // Lấy role từ database
    const dbResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/qc_users?email=eq.${encodeURIComponent(email)}&select=...qc_roles(role_key)&is_active=eq.true`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!dbResponse.ok) throw new Error('Database error');
    const users = await dbResponse.json();
    if (!users.length) return res.status(404).json({ error: 'User not found' });

    const role_key = users[0].qc_roles?.role_key || '';

    return res.status(200).json({ email, role_key });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}