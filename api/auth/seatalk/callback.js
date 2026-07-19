import crypto from 'crypto';

const SEATALK_APP_ID = process.env.SEATALK_APP_ID;
const SEATALK_APP_SECRET = process.env.SEATALK_APP_SECRET;
const REDIRECT_URI = process.env.SEATALK_REDIRECT_URI; // phải trùng với cấu hình trong app
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const AUTH_SECRET = process.env.AUTH_SECRET || "default-secret";

export default async function handler(req, res) {
  const { code, state } = req.query;

  if (!code) {
    res.redirect('/login.html?error=missing_code');
    return;
  }

  try {
    // 1. Gọi SeaTalk API để đổi code lấy access token
    const tokenRes = await fetch('https://api.seatalk.io/open/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: SEATALK_APP_ID,
        app_secret: SEATALK_APP_SECRET,
        code,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('SeaTalk token error:', tokenData);
      res.redirect('/login.html?error=token_exchange_failed');
      return;
    }

    // 2. Lấy thông tin người dùng (email)
    const profileRes = await fetch('https://api.seatalk.io/open/auth/user/profile', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();
    if (!profileRes.ok || !profile.email) {
      console.error('SeaTalk profile error:', profile);
      res.redirect('/login.html?error=profile_fetch_failed');
      return;
    }

    const email = profile.email.toLowerCase().trim();

    // 3. Kiểm tra trong qc_users
    const dbCheck = await fetch(
      `${SUPABASE_URL}/rest/v1/qc_users?email=eq.${encodeURIComponent(email)}&is_active=eq.true&select=id`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    const users = await dbCheck.json();
    if (!users || users.length === 0) {
      res.redirect('/login.html?error=unauthorized');
      return;
    }

    // 4. Tạo session token chứa email (hạn 24h)
    const payload = JSON.stringify({ email, exp: Date.now() + 24 * 60 * 60 * 1000 });
    const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
    const token = Buffer.from(`${payload}.${signature}`).toString('base64url');

    // 5. Redirect về trang chính với token
    res.redirect(`/index.html?token=${token}`);

  } catch (error) {
    console.error('Callback error:', error);
    res.redirect('/login.html?error=internal_error');
  }
}