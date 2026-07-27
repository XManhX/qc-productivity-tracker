// lib/config/public.js
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    // Trả về cấu hình công khai (không cần xác thực)
    return res.status(200).json({
        seatalkAppId: process.env.SEATALK_APP_ID || '',
        seatalkRedirectUri: process.env.SEATALK_REDIRECT_URI || '',
    });
}