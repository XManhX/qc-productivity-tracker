// api/config.js
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Chỉ trả về các giá trị cần thiết, không lộ secret
  res.status(200).json({
    seatalkAppId: process.env.SEATALK_APP_ID || '',
    seatalkRedirectUri: process.env.SEATALK_REDIRECT_URI || '',
  });
}