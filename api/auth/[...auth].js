import callbackHandler from '../../lib/auth/callback.js';

export default async function handler(req, res) {
    // CORS đã được xử lý trong vercel.json, không cần đặt lại
    const { auth } = req.query; // ['seatalk','callback']
    if (auth[0] === 'seatalk' && auth[1] === 'callback' && req.method === 'GET') {
        return callbackHandler(req, res);
    }
    return res.status(404).json({ error: 'Not found' });
}