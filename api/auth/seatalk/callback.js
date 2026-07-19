// api/auth/seatalk/callback.js
import crypto from 'crypto';

export default async function handler(req, res) {
  const { code, state } = req.query;

  if (!code) {
    console.error('[Callback] Thiếu code');
    return res.redirect('/login.html?error=missing_code');
  }

  const SEATALK_APP_ID = process.env.SEATALK_APP_ID;
  const SEATALK_APP_SECRET = process.env.SEATALK_APP_SECRET;
  const REDIRECT_URI = process.env.SEATALK_REDIRECT_URI;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const AUTH_SECRET = process.env.AUTH_SECRET;

  if (!SEATALK_APP_ID || !SEATALK_APP_SECRET || !REDIRECT_URI || !SUPABASE_URL || !SUPABASE_ANON_KEY || !AUTH_SECRET) {
    console.error('[Callback] Thiếu biến môi trường');
    return res.redirect('/login.html?error=internal_error');
  }

  try {
    // 1. Lấy App Access Token
    console.log('[Callback] Đang lấy app access token...');
    const tokenRes = await fetch('https://openapi.seatalk.io/auth/app_access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: SEATALK_APP_ID, app_secret: SEATALK_APP_SECRET }),
    });

    const tokenData = await tokenRes.json();
    if (tokenData.code !== 0 || !tokenData.app_access_token) {
      console.error('[Callback] Lỗi lấy app token:', tokenData);
      return res.redirect(`/login.html?error=token_failed&code=${tokenData.code || 'unknown'}`);
    }

    const appAccessToken = tokenData.app_access_token;
    console.log('[Callback] App token OK');

    // 2. Đổi code lấy thông tin employee
    console.log('[Callback] Đang gọi code2employee...');
    const profileRes = await fetch(
      `https://openapi.seatalk.io/open_login/code2employee?code=${encodeURIComponent(code)}`,
      { headers: { Authorization: `Bearer ${appAccessToken}` } }
    );

    const profileData = await profileRes.json();
    console.log('[Callback] code2employee response:', JSON.stringify(profileData));

    if (profileData.code !== 0 || !profileData.employee?.email) {
      const seaTalkError = profileData.code || 'unknown';
      console.error('[Callback] Lỗi code2employee:', seaTalkError);
      // Truyền mã lỗi cụ thể lên frontend để hiển thị
      return res.redirect(`/login.html?error=code2employee_failed&se_error=${seaTalkError}`);
    }

    const email = profileData.employee.email.toLowerCase().trim();

    // 3. Kiểm tra user trong DB
    const dbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/qc_users?email=eq.${encodeURIComponent(email)}&is_active=eq.true&select=id`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!dbRes.ok) {
      const errText = await dbRes.text();
      console.error('[Callback] Lỗi DB:', dbRes.status, errText);
      return res.redirect('/login.html?error=internal_error');
    }

    const users = await dbRes.json();
    if (!users || users.length === 0) {
      console.warn('[Callback] User không tồn tại/active:', email);
      return res.redirect('/login.html?error=unauthorized');
    }

    // 4. Tạo session token
    const payload = JSON.stringify({ email, exp: Date.now() + 24 * 60 * 60 * 1000 });
    const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
    const token = Buffer.from(`${payload}.${signature}`).toString('base64url');

    console.log('[Callback] Đăng nhập thành công');
    return res.redirect(`/index.html?token=${token}`);

  } catch (error) {
    console.error('[Callback] Lỗi hệ thống:', error);
    return res.redirect('/login.html?error=internal_error');
  }
}
