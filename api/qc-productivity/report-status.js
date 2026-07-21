import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);

// Hàm kiểm tra user active (dùng chung logic như log.js hoặc users.js)
async function verifyUser(email) {
  if (!email || !email.includes("@")) return false;
  const { data, error } = await supabase
    .from("qc_users")
    .select("id")
    .eq("email", email.toLowerCase().trim())
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    console.error("verifyUser error:", error);
    return false;
  }
  return !!data;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { email, current_qc, last_activity_ts, idle_minutes } =
      req.body || {};
    if (!email) return res.status(400).json({ error: "Missing email" });

    const normalizedEmail = email.toLowerCase().trim();
    const valid = await verifyUser(normalizedEmail);
    if (!valid)
      return res.status(403).json({ error: "User not authorized or inactive" });

    const now = Date.now();

    // Upsert vào bảng idle status
    const { error } = await supabase.from("qc_user_idle_status").upsert(
      {
        email: normalizedEmail,
        current_qc: current_qc || 0,
        last_activity_ts: last_activity_ts || now,
        idle_minutes: idle_minutes || 0,
        last_report_ts: now,
      },
      { onConflict: "email" },
    );

    if (error) {
      console.error("Upsert idle status error:", error);
      return res.status(500).json({ error: "Failed to save status" });
    }

    res.status(200).json({ success: true });
  } catch (e) {
    console.error("report-status handler error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
}
