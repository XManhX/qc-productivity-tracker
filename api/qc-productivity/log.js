const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

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
    console.log('[Log API] Received payload:', JSON.stringify(logData, null, 2));

    const operatorEmail = logData.operator?.trim().toLowerCase();
    if (!operatorEmail) {
      console.warn('[Log API] Missing operator email');
      return res.status(400).json({ error: 'Missing operator email' });
    }

    const allowed = await isUserAllowed(operatorEmail);
    if (!allowed) {
      console.warn(`[Log API] Unauthorized attempt from ${operatorEmail}`);
      return res.status(403).json({ error: 'User not authorized' });
    }

    // Insert bao gồm scan_value và page_start_time
    const insertData = {
      version: logData.version || null,
      timestamp: logData.timestamp || new Date().toISOString(),
      page: logData.page || null,
      action: logData.action || null,
      operator: logData.operator || null,
      url: logData.url || null,
      device_id: logData.device_id || null,
      scan_value: logData.scan_value || null,          // ✅ THÊM
      page_start_time: logData.page_start_time || null // ✅ THÊM (nếu đã có cột)
    };

    console.log('[Log API] Inserting data:', JSON.stringify(insertData, null, 2));

    const dbResponse = await fetch(`${SUPABASE_URL}/rest/v1/qc_logs`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(insertData)
    });

    if (!dbResponse.ok) {
      const errText = await dbResponse.text();
      console.error('[Log API] DB Insert Error:', errText);
      return res.status(500).json({ error: `Failed to save log: ${errText}` });
    }

    console.log('[Log API] Log saved successfully');
    return res.status(200).json({ success: true, message: "Log saved" });

  } catch (error) {
    console.error('[Log API] Fatal error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
};