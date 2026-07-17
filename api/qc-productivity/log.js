import crypto from 'crypto';

const AUTH_SECRET = process.env.AUTH_SECRET || "secure-default-secret-key-replace-me-in-prod";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function verifySessionToken(token) {
  if (!token) return { valid: false, reason: 'missing_token' };
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [payloadStr, signature] = decoded.split('.');
    if (!payloadStr || !signature) return { valid: false, reason: 'malformed_token' };

    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payloadStr).digest('hex');
    if (signature !== expected) return { valid: false, reason: 'invalid_signature' };

    const payload = JSON.parse(payloadStr);
    if (Date.now() > payload.expiresAt) return { valid: false, reason: 'expired_token' };

    return { valid: true, email: payload.email };
  } catch {
    return { valid: false, reason: 'token_parse_error' };
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
    const verification = verifySessionToken(sessionToken);
    if (!verification.valid) {
      console.error(`[Log API] Token verification failed: ${verification.reason}`);
      return res.status(401).json({ error: `Unauthorized: ${verification.reason}` });
    }

    const verifiedEmail = verification.email;
    const logData = req.body;
    if (!logData.operator || logData.operator.trim().toLowerCase() !== verifiedEmail) {
      return res.status(400).json({ error: 'Operator mismatch with authenticated session' });
    }

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