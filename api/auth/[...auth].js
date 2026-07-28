// api/auth/[...auth].js
import { getPathSegments } from '../../lib/path-utils.js';
import callbackHandler from '../../lib/auth/callback.js';
import loginHandler from '../../lib/auth/login.js';

export default async function handler(req, res) {
    const auth = getPathSegments(req, 'auth');
    // auth = ['login']  hoặc  ['seatalk', 'callback']

    if (auth[0] === 'login') {
        if (req.method === 'POST') return loginHandler(req, res);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (auth[0] === 'seatalk' && auth[1] === 'callback') {
        if (req.method === 'GET') return callbackHandler(req, res);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    return res.status(404).json({ error: 'Auth endpoint not found' });
}