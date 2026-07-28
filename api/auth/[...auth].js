// api/auth/[...auth].js
import callbackHandler from '../../lib/auth/callback.js';
import { getPathSegments } from '../../lib/path-utils.js';

export default async function handler(req, res) {
    console.log('Auth route hit', req.url);
    const auth = getPathSegments(req, 'auth');
    // auth = ['seatalk', 'callback'] khi URL là /api/auth/seatalk/callback

    if (auth[0] === 'seatalk' && auth[1] === 'callback' && req.method === 'GET') {
        return callbackHandler(req, res);
    }

    return res.status(404).json({ error: 'Auth endpoint not found' });
}