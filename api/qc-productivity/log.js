// pages/api/log.js
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Cache danh sách email được phép (Set để tra cứu nhanh)
let allowedUsersSet = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 1000; // 1 phút

/**
 * Lấy danh sách email active từ Supabase và cache vào Set
 */
async function fetchAllowedUsers() {
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/qc_users?is_active=eq.true&select=email`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      },
    );
    if (!resp.ok) {
      console.error("Failed to fetch allowed users");
      return null;
    }
    const data = await resp.json();
    // Tạo Set chứa email đã lowercase để so sánh không phân biệt hoa/thường
    return new Set(data.map((u) => u.email.toLowerCase()));
  } catch (e) {
    console.error("Error fetching allowed users:", e);
    return null;
  }
}

/**
 * Kiểm tra email có được phép hay không (dùng cache)
 */
async function isUserAllowed(email) {
  if (!email) return false;
  const now = Date.now();

  // Nếu cache hết hạn hoặc chưa có, load lại danh sách
  if (!allowedUsersSet || now - cacheTime >= CACHE_TTL) {
    const newSet = await fetchAllowedUsers();
    if (newSet) {
      allowedUsersSet = newSet;
      cacheTime = now;
    } else {
      // Nếu không lấy được danh sách mới, giữ cache cũ (nếu có) để tránh từ chối toàn bộ
      if (!allowedUsersSet) return false; // Chưa có cache, từ chối
    }
  }

  // So sánh không phân biệt hoa/thường
  return allowedUsersSet.has(email.toLowerCase());
}

/**
 * Lấy khoảng thời gian bắt đầu và kết thúc của ngày hôm nay (UTC)
 */
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
  // CORS headers
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Lấy operator email từ query hoặc body, luôn lowercase
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

  // Kiểm tra quyền truy cập
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
  if (req.method === "POST") {
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
        asn: logData.asn || null,
        return_tn: logData.return_tn || null,
        is_all_judged: logData.extra_data?.is_all_judged ?? null,
        is_to_dispute: logData.extra_data?.is_to_dispute ?? null,
        page_start_time: logData.page_start_time || null,
        page_end_time: logData.page_end_time || null,
        extra_data: logData.extra_data || {},
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
        return res
          .status(500)
          .json({ error: `Failed to save log: ${errText}` });
      }

      console.log("[Log API] Log saved successfully");
      return res.status(200).json({ success: true, message: "Log saved" });
    } catch (error) {
      console.error("[Log API] Fatal error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  // Nếu method không được hỗ trợ (mặc dù đã check ở trên)
  return res.status(405).json({ error: "Method not allowed" });
}
