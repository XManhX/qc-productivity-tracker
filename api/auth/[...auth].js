// api/auth/[...auth].js
import callbackHandler from '../../lib/auth/callback.js';
import loginHandler from '../../lib/auth/login.js';

export default async function handler(req, res) {
    // Lấy path từ URL gốc (không dùng query param vì rewrite không ổn định)
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    // pathSegments ví dụ: ['api', 'auth', 'login'] hoặc ['api', 'auth', 'seatalk', 'callback']

    // Route: /api/auth/login (POST)
    if (pathSegments[2] === 'login') {
        if (req.method === 'POST') {
            return loginHandler(req, res);
        }
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Route: /api/auth/seatalk/callback (GET)
    if (pathSegments[2] === 'seatalk' && pathSegments[3] === 'callback') {
        if (req.method === 'GET') {
            return callbackHandler(req, res);
        }
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Mặc định
    return res.status(404).json({ error: 'Auth endpoint not found' });
}