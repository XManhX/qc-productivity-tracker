import callbackHandler from '../../lib/auth/callback.js';
import loginHandler from '../../lib/auth/login.js';
import { getPathSegments } from '../../lib/path-utils.js';

export default async function handler(req, res) {
    // Lấy segment từ query parameter (do rewrite)
    const authParam = req.query.auth || '';
    const auth = authParam.split('/').filter(Boolean);

    // Route: /api/auth/seatalk/callback
    if (auth[0] === 'seatalk' && auth[1] === 'callback') {
        if (req.method === 'GET') {
            return callbackHandler(req, res);
        }
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Route: /api/auth/login (POST)
    if (auth[0] === 'login') {
        if (req.method === 'POST') {
            return loginHandler(req, res);
        }
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Mặc định 404
    return res.status(404).json({ error: 'Auth endpoint not found' });
}