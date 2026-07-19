// api/auth/seatalk/callback.js
import crypto from 'crypto';

// Helper an toàn tránh dùng url.parse (gây deprecation warning)
function safeRedirect(res, req, path) {
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers.host;
  const url = new URL(path, `${protocol}://${host}`);
  res.writeHead(302, { Location: url.href });
  res.end();
}

export default async function handler(req, res) {
  const { code, state } = req.query;

  if (!code) {
    console.error('[Callback] Thiếu code');
    return safeRedirect(res, req, '/login.html?error=missing_code');
  }

  const SEATALK_APP_ID = process.env.SEATALK_APP_ID;
  const SEATALK_APP_SECRET = process.env.SEATALK_APP_SECRET;
  const REDIRECT_URI = process.env.SEATALK_REDIRECT_URI;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const AUTH_SECRET = process.env.AUTH_SECRET;

  if (!SEATALK_APP_ID || !SEATALK_APP_SECRET || !REDIRECT_URI || !SUPABASE_URL || !SUPABASE_ANON_KEY || !AUTH_SECRET) {
    console.error('[Callback] Thiếu biến môi trường:', {
      hasAppId: !!SEATALK_APP_ID,
      hasSecret: !!SEATALK_APP_SECRET,
      hasRedirect: !!REDIRECT_URI,
      hasDbUrl: !!SUPABASE_URL,
      hasDbKey: !!SUPABASE_ANON_KEY,
      hasAuthSecret: !!AUTH_SECRET,
    });
    return safeRedirect(res, req, '/login.html?error=internal_error');
  }

  try {
    // 1. Đổi code lấy access token
    console.log('[Callback] Đang đổi code lấy token...');
    const tokenRes = await fetch(new URL('https://api.seatalk.io/open/auth/token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: SEATALK_APP_ID,
        app_secret: SEATALK_APP_SECRET,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[Callback] Lỗi đổi token:', tokenRes.status, errText);
      return safeRedirect(res, req, '/login.html?error=token_exchange_failed');
    }

    const tokenData = await tokenRes.json();
    console.log('[Callback] Token response:', JSON.stringify(tokenData).substring(0, 200));

    if (!tokenData.access_token) {
      console.error('[Callback] Không có access_token trong response');
      return safeRedirect(res, req, '/login.html?error=token_exchange_failed');
    }

    // 2. Lấy thông tin user
    console.log('[Callback] Đang lấy profile...');
    const profileRes = await fetch(new URL('https://api.seatalk.io/open/auth/user/profile'), {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
    });

    if (!profileRes.ok) {
      const errText = await profileRes.text();
      console.error('[Callback] Lỗi lấy profile:', profileRes.status, errText);
      return safeRedirect(res, req, '/login.html?error=profile_fetch_failed');
    }

    const profile = await profileRes.json();
    console.log('[Callback] Profile:', JSON.stringify(profile).substring(0, 200));

    const email = (profile.email || '').toLowerCase().trim();
    if (!email) {
      console.error('[Callback] Profile không có email');
      return safeRedirect(res, req, '/login.html?error=profile_fetch_failed');
    }

    // 3. Kiểm tra user trong database
    console.log('[Callback] Kiểm tra user trong DB:', email);
    const dbUrl = new URL('/rest/v1/qc_users', SUPABASE_URL);
    dbUrl.searchParams.set('email', `eq.${email}`);
    dbUrl.searchParams.set('is_active', 'eq.true');
    dbUrl.searchParams.set('select', 'id');

    const dbRes = await fetch(dbUrl, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (!dbRes.ok) {
      const errText = await dbRes.text();
      console.error('[Callback] Lỗi DB:', dbRes.status, errText);
      return safeRedirect(res, req, '/login.html?error=internal_error');
    }

    const users = await dbRes.json();
    if (!users || users.length === 0) {
      console.warn('[Callback] User không tồn tại hoặc không active:', email);
      return safeRedirect(res, req, '/login.html?error=unauthorized');
    }

    // 4. Tạo session token
    const payload = JSON.stringify({ email, exp: Date.now() + 24 * 60 * 60 * 1000 });
    const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
    const token = Buffer.from(`${payload}.${signature}`).toString('base64url');

    console.log('[Callback] Đăng nhập thành công, redirect về index');
    return safeRedirect(res, req, `/index.html?token=${token}`);

  } catch (error) {
    console.error('[Callback] Lỗi không mong muốn:', error);
    return safeRedirect(res, req, '/login.html?error=internal_error');
  }
}