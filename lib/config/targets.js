// api/qc-productivity/targets.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
);

export default async function handler(req, res) {
    const { method } = req;

    try {
        // ─── GET: Lấy danh sách role kèm target ─────────────────
        if (method === "GET") {
            // 1. Lấy tất cả roles
            const { data: roles, error: rolesError } = await supabase
                .from("qc_roles")
                .select("id, role_key, display_name, is_active")
                .order("display_name");
            if (rolesError) throw rolesError;

            // 2. Lấy tất cả targets hiện có
            const { data: targets, error: targetsError } = await supabase
                .from("qc_productivity_targets")
                .select("role_id, low_threshold, medium_threshold");
            if (targetsError) throw targetsError;

            // 3. Tạo map để tra cứu nhanh target theo role_id
            const targetMap = {};
            (targets || []).forEach((t) => {
                targetMap[t.role_id] = {
                    low_threshold: t.low_threshold,
                    medium_threshold: t.medium_threshold,
                };
            });

            // 4. Ghép dữ liệu, giữ giá trị mặc định nếu chưa có target
            const result = roles.map((role) => {
                const target = targetMap[role.id] || {};
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

        // ─── PUT: Cập nhật / tạo mới target ─────────────────
        if (method === "PUT") {
            // Kiểm tra quyền admin: có thể kiểm tra Authorization header với secret đặc biệt
            const authHeader = req.headers.authorization;
            if (authHeader !== `Bearer ${process.env.ADMIN_API_SECRET}`) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            const { role_id, low_threshold, medium_threshold } = req.body || {};
            if (!role_id) {
                return res.status(400).json({ message: "Thiếu role_id" });
            }

            const low = Number(low_threshold);
            const medium = Number(medium_threshold);
            if (isNaN(low) || isNaN(medium)) {
                return res.status(400).json({ message: "Ngưỡng không hợp lệ" });
            }
            if (low >= medium) {
                return res
                    .status(400)
                    .json({ message: "low_threshold phải nhỏ hơn medium_threshold" });
            }

            // Upsert target (ON CONFLICT role_id)
            const { data, error } = await supabase
                .from("qc_productivity_targets")
                .upsert(
                    {
                        role_id,
                        low_threshold: low,
                        medium_threshold: medium,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "role_id" },
                )
                .select()
                .single();

            if (error) throw error;
            return res.status(200).json(data);
        }

        // ─── Các method khác ─────────────────────────────────
        return res.status(405).json({ message: "Method not allowed" });
    } catch (error) {
        console.error("Targets API error:", error);
        return res.status(500).json({ error: error.message });
    }
}
