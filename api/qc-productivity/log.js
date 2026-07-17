const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Cache allowlist trong memory (thời gian sống 1 phút)
let allowedUsersCache = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 1000;

async function isUserAllowed(email) {
  if (!email) return false;
  const now = Date.now();
  if (allowedUsersCache && now - cacheTime < CACHE_TTL) {
    return allowedUsersCache.includes(email);
  }
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/qc_users?email=eq.${encodeURIComponent(email)}&is_active=eq.true&select=email`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );
    if (!resp.ok) {
      console.error('Failed to fetch user allowlist');
      return false;
    }
    const data = await resp.json();
    allowedUsersCache = data.map(u => u.email);
    cacheTime = now;
    return allowedUsersCache.includes(email);
  } catch (e) {
    console.error('Error checking user allowlist:', e);
    return false;
  }
}

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const logData = req.body;
    const operatorEmail = logData.operator?.trim().toLowerCase();
    if (!operatorEmail) {
      return res.status(400).json({ error: 'Missing operator email' });
    }

    const allowed = await isUserAllowed(operatorEmail);
    if (!allowed) {
      console.warn(`[Log API] Unauthorized attempt from ${operatorEmail}`);
      return res.status(403).json({ error: 'User not authorized' });
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

    return res.status(200).json({ success: true, message: "Log saved" });
  } catch (error) {
    console.error("Log API Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};