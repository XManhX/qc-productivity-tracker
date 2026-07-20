// pages/api/log.js
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Cache danh sách user được phép
let allowedUsersCache = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 1000; // 1 phút

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
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      },
    );
    if (!resp.ok) {
      console.error("Failed to fetch user allowlist");
      return false;
    }
    const data = await resp.json();
    allowedUsersCache = data.map((u) => u.email);
    cacheTime = now;
    return allowedUsersCache.includes(email);
  } catch (e) {
    console.error("Error checking user allowlist:", e);
    return false;
  }
}

// Lấy khoảng thời gian bắt đầu và kết thúc của ngày hôm nay (UTC)
function getTodayRange() {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Xác định operator email
  let operatorEmail;
  if (req.method === "GET") {
    operatorEmail = req.query.operator?.trim().toLowerCase();
  } else if (req.method === "POST") {
    operatorEmail = req.body.operator?.trim().toLowerCase();
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!operatorEmail) {
    return res.status(400).json({ error: "Missing operator email" });
  }

  // Kiểm tra quyền
  const allowed = await isUserAllowed(operatorEmail);
  if (!allowed) {
    console.warn(`[API] Unauthorized: ${operatorEmail}`);
    return res.status(403).json({ error: "User not authorized" });
  }

  // ==================== GET: Thống kê ngày ====================
  if (req.method === "GET") {
    try {
      const { start, end } = getTodayRange();
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/qc_logs?select=page&operator=eq.${encodeURIComponent(operatorEmail)}&created_at=gte.${start}&created_at=lt.${end}`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        },
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error("[Stats API] Query error:", errText);
        return res.status(500).json({ error: "Failed to fetch stats" });
      }

      const logs = await response.json();
      const stats = { qc: 0, judgement: 0, rimassreceive: 0 };
      logs.forEach((log) => {
        if (log.page === "qc") stats.qc++;
        else if (log.page === "judgement") stats.judgement++;
        else if (log.page === "rimassreceive") stats.rimassreceive++;
      });

      return res.status(200).json(stats);
    } catch (error) {
      console.error("[Stats API] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  // ==================== POST: Ghi log ====================
  try {
    const logData = req.body;
    console.log(
      "[Log API] Received payload:",
      JSON.stringify(logData, null, 2),
    );

    const insertData = {
      version: logData.version || null,
      created_at: logData.timestamp || new Date().toISOString(),
      page: logData.page || null,
      action: logData.action || null,
      operator: logData.operator || null,
      url: logData.url || null,
      device_id: logData.device_id || null,
      scan_value: logData.scan_value || null,
      page_start_time: logData.page_start_time || null,
      page_end_time: logData.page_end_time || null,
    };

    const dbResponse = await fetch(`${SUPABASE_URL}/rest/v1/qc_logs`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(insertData),
    });

    if (!dbResponse.ok) {
      const errText = await dbResponse.text();
      console.error("[Log API] DB Insert Error:", errText);
      return res.status(500).json({ error: `Failed to save log: ${errText}` });
    }

    console.log("[Log API] Log saved successfully");
    return res.status(200).json({ success: true, message: "Log saved" });
  } catch (error) {
    console.error("[Log API] Fatal error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
