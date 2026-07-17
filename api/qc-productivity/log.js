import crypto from 'crypto';

const AUTH_SECRET = process.env.AUTH_SECRET || "secure-default-secret-key-replace-me-in-prod";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function verifySessionToken(token) {
  if (!token) return null;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [payloadStr, signature] = decoded.split('.');
    
    const expectedSignature = crypto.createHmac('sha256', AUTH_SECRET).update(payloadStr).digest('hex');
    if (signature !== expectedSignature) return null;

    const payload = JSON.parse(payloadStr);
    if (Date.now() > payload.expiresAt) return null;

    return payload.email;
  } catch (e) {
    return null;
  }
}

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-QC-Session-Token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const sessionToken = req.headers['x-qc-session-token'];
    const verifiedEmail = verifySessionToken(sessionToken);
    if (!verifiedEmail) {
      return res.status(401).json({ error: 'Invalid or expired session token' });
    }

    const logData = req.body;
    if (logData.operator.trim().toLowerCase() !== verifiedEmail) {
      return res.status(400).json({ error: 'Operator mismatch with authenticated session' });
    }

    // Đẩy log trực tiếp vào DB của Supabase qua REST API
    const dbResponse = await fetch(`${SUPABASE_URL}/rest/v1/qc_logs`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        version: logData.version,
        timestamp: logData.timestamp,
        page: logData.page,
        action: logData.action,
        operator: logData.operator,
        url: logData.url,
        device_id: logData.device_id || null,
        asn: logData.asn || null,
        return_tn: logData.return_tn || null,
        order_sn: logData.order_sn || null,
        lmtn: logData.lmtn || null,
        uid: logData.uid || null
      })
    });

    if (!dbResponse.ok) {
      console.error("DB Insert Log Error:", await dbResponse.text());
      return res.status(500).json({ error: "Failed to save log to database" });
    }

    return res.status(200).json({ success: true, message: "Log saved to DB successfully" });
  } catch (error) {
    console.error("Log API Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};