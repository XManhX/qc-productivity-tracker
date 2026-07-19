// api/auth/seatalk/callback.js
import crypto from 'crypto';

export default async function handler(req, res) {
  const { code, state } = req.query;

  // 1. Kiểm tra sự tồn tại của mã xác thực (SSO token)
  if (!code) {
    console.error('[Callback] Thiếu mã SSO token (code) từ SeaTalk');
    return res.redirect('/login.html?error=missing_code');
  }

  // 2. Lấy các biến môi trường cần thiết
  const SEATALK_APP_ID = process.env.SEATALK_APP_ID;
  const SEATALK_APP_SECRET = process.env.SEATALK_APP_SECRET;
  const REDIRECT_URI = process.env.SEATALK_REDIRECT_URI; // có thể dùng để log nếu cần
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const AUTH_SECRET = process.env.AUTH_SECRET;

  if (!SEATALK_APP_ID || !SEATALK_APP_SECRET || !REDIRECT_URI || !SUPABASE_URL || !SUPABASE_ANON_KEY || !AUTH_SECRET) {
    console.error('[Callback] Thiếu biến môi trường bắt buộc');
    return res.redirect('/login.html?error=internal_error');
  }

  try {
    // 3. Lấy App Access Token
    console.log('[Callback] Đang lấy App Access Token...');
    const tokenRes = await fetch('https://openapi.seatalk.io/auth/app_access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: SEATALK_APP_ID, app_secret: SEATALK_APP_SECRET }),
    });

    const tokenData = await tokenRes.json();
    if (tokenData.code !== 0 || !tokenData.app_access_token) {
      console.error('[Callback] Lỗi lấy App Access Token:', tokenData);
      return res.redirect(`/login.html?error=token_failed&code=${tokenData.code || 'unknown'}`);
    }

    const appAccessToken = tokenData.app_access_token;
    console.log('[Callback] Đã lấy App Access Token thành công');

    // 4. Xác minh SSO token để lấy thông tin người dùng
    console.log('[Callback] Đang xác minh SSO token...');
    const profileRes = await fetch('https://openapi.seatalk.io/sso/v2/verify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: code }), // Sử dụng mã code như là SSO token
    });

    const profileData = await profileRes.json();
    console.log('[Callback] Phản hồi từ verify SSO:', JSON.stringify(profileData));

    // Kiểm tra mã lỗi và sự tồn tại của email trong profile
    if (profileData.code !== 0 || !profileData.profile?.email) {
      const seaTalkError = profileData.code || 'unknown';
      console.error('[Callback] Lỗi xác minh SSO token:', seaTalkError);
      return res.redirect(`/login.html?error=sso_failed&se_error=${seaTalkError}`);
    }

    // Lấy email từ profile (định dạng mới)
    const email = profileData.profile.email.toLowerCase().trim();
    console.log(`[Callback] SSO thành công, email: ${email}`);

    // 5. Kiểm tra user trong cơ sở dữ liệu
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
      console.error('[Callback] Lỗi khi truy vấn Supabase:', dbRes.status, errText);
      return res.redirect('/login.html?error=internal_error');
    }

    const users = await dbRes.json();
    if (!users || users.length === 0) {
      console.warn(`[Callback] Không tìm thấy user hoặc user không active: ${email}`);
      return res.redirect('/login.html?error=unauthorized');
    }

    // 6. Tạo session token
    const payload = JSON.stringify({ email, exp: Date.now() + 24 * 60 * 60 * 1000 });
    const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
    const token = Buffer.from(`${payload}.${signature}`).toString('base64url');

    console.log('[Callback] Đăng nhập thành công, chuyển hướng về index.html');
    return res.redirect(`/index.html?token=${token}`);

  } catch (error) {
    console.error('[Callback] Lỗi hệ thống không xác định:', error);
    return res.redirect('/login.html?error=internal_error');
  }
}
