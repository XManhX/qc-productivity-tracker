import crypto from 'crypto';

const AUTH_SECRET = process.env.AUTH_SECRET || "secure-default-secret-key-replace-me-in-prod";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function verifySessionToken(token) {
  if (!token) {
    return { valid: false, reason: 'missing_token' };
  }
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [payloadStr, signature] = decoded.split('.');
    if (!payloadStr || !signature) {
      return { valid: false, reason: 'malformed_token' };
    }

    const expectedSignature = crypto.createHmac('sha256', AUTH_SECRET).update(payloadStr).digest('hex');
    if (signature !== expectedSignature) {
      return { valid: false, reason: 'invalid_signature' };
    }

    const payload = JSON.parse(payloadStr);
    if (Date.now() > payload.expiresAt) {
      return { valid: false, reason: 'expired_token' };
    }

    return { valid: true, email: payload.email };
  } catch (e) {
    console.error('[verifySessionToken] Exception:', e);
    return { valid: false, reason: 'token_parse_error' };
  }
}

export default async (req, res) => {
  // ... CORS và method check giữ nguyên ...

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

    // ... phần insert DB giữ nguyên ...
  } catch (error) {
    console.error("Log API Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};