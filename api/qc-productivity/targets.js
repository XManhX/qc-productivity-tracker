// api/qc-productivity/targets.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);

export default async function handler(req, res) {
  const { method } = req;

  try {
    if (method === "GET") {
      // Lấy tất cả roles kèm target (nếu có)
      const { data, error } = await supabase
        .from("qc_roles")
        .select(`
          id, role_key, display_name, is_active,
          qc_productivity_targets ( low_threshold, medium_threshold )
        `)
        .order("display_name");
      if (error) throw error;

      const result = data.map(role => {
        const target = role.qc_productivity_targets?.[0] || {};
        return {
          role_id: role.id,
          role_key: role.role_key,
          display_name: role.display_name,
          is_active: role.is_active,
          low_threshold: target.low_threshold ?? 10,
          medium_threshold: target.medium_threshold ?? 16,
        };
      });
      return res.status(200).json(result);
    }

    if (method === "PUT") {
      const { role_id, low_threshold, medium_threshold } = req.body || {};
      if (!role_id) return res.status(400).json({ message: "Thiếu role_id" });

      const low = Number(low_threshold);
      const medium = Number(medium_threshold);
      if (isNaN(low) || isNaN(medium)) return res.status(400).json({ message: "Ngưỡng không hợp lệ" });
      if (low >= medium) return res.status(400).json({ message: "low_threshold phải nhỏ hơn medium_threshold" });

      // Upsert target (dùng ON CONFLICT)
      const { data, error } = await supabase
        .from("qc_productivity_targets")
        .upsert(
          { role_id, low_threshold: low, medium_threshold: medium, updated_at: new Date().toISOString() },
          { onConflict: "role_id" }
        )
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}