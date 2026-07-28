// lib/auth/callback.js
import crypto from 'crypto';
import { createToken } from './auth.js'; // sử dụng chung

export default async function handler(req, res) {
    const { code, state } = req.query;

    if (!code) {
        return res.redirect('/login.html?error=missing_code');
    }

    const SEATALK_APP_ID = process.env.SEATALK_APP_ID;
    const SEATALK_APP_SECRET = process.env.SEATALK_APP_SECRET;
    const REDIRECT_URI = process.env.SEATALK_REDIRECT_URI;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    const AUTH_SECRET = process.env.AUTH_SECRET;
    const SEATALK_APP_TOKEN_URL = process.env.SEATALK_APP_TOKEN_URL;
    const SEATALK_SSO_VERIFY_URL = process.env.SEATALK_SSO_VERIFY_URL;

    // Kiểm tra biến môi trường
    const missing = Object.entries({
        SEATALK_APP_ID, SEATALK_APP_SECRET, REDIRECT_URI,
        SUPABASE_URL, SUPABASE_ANON_KEY, AUTH_SECRET,
        SEATALK_APP_TOKEN_URL, SEATALK_SSO_VERIFY_URL
    }).filter(([_, v]) => !v).map(([k]) => k);
    if (missing.length) {
        console.error('Missing env vars:', missing);
        return res.redirect('/login.html?error=internal_error');
    }

    try {
        // Lấy App Access Token
        const tokenRes = await fetch(SEATALK_APP_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ app_id: SEATALK_APP_ID, app_secret: SEATALK_APP_SECRET }),
        });
        const tokenData = await tokenRes.json();
        if (tokenData.code !== 0 || !tokenData.app_access_token) {
            console.error('App token failed:', tokenData);
            return res.redirect('/login.html?error=token_failed');
        }

        // Xác minh SSO token
        const profileRes = await fetch(SEATALK_SSO_VERIFY_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${tokenData.app_access_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token: code }),
        });
        const profileData = await profileRes.json();
        if (profileData.code !== 0 || !profileData.profile?.email) {
            console.error('SSO verify failed:', profileData);
            return res.redirect('/login.html?error=sso_failed');
        }

        const email = profileData.profile.email.toLowerCase().trim();

        // Kiểm tra user trong DB
        const dbRes = await fetch(
            `${SUPABASE_URL}/rest/v1/qc_users?email=eq.${encodeURIComponent(email)}&is_active=eq.true&select=id`,
            {
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                },
            }
        );
        if (!dbRes.ok) {
            console.error('DB check failed:', await dbRes.text());
            return res.redirect('/login.html?error=internal_error');
        }
        const users = await dbRes.json();
        if (!users.length) {
            return res.redirect('/login.html?error=unauthorized');
        }

        const token = createToken(email);
        return res.redirect(`/index.html?token=${token}`);
    } catch (err) {
        console.error('Callback error:', err);
        return res.redirect('/login.html?error=internal_error');
    }
}