// api/lib/admin/qc-roles.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
);

export default async function handler(req, res) {
    const { method } = req;

    try {
        if (method === "GET") {
            const { data, error } = await supabase
                .from("qc_roles")
                .select("id, role_key, display_name, is_active")
                .order("id");
            if (error) throw error;
            return res.status(200).json(data);
        }

        if (method === "POST") {
            const { role_key, display_name } = req.body || {};
            if (!role_key) return res.status(400).json({ message: "Thiếu role_key" });
            const key = role_key.toString().toLowerCase().trim();
            const { data, error } = await supabase
                .from("qc_roles")
                .insert([{ role_key: key, display_name: display_name || key, is_active: true }])
                .select()
                .single();
            if (error) {
                if (error.code === "23505") return res.status(409).json({ message: "Role key đã tồn tại" });
                throw error;
            }
            return res.status(201).json(data);
        }

        if (method === "PUT") {
            const { id, display_name, is_active } = req.body || {};
            if (!id) return res.status(400).json({ message: "Thiếu id" });
            const updates = {};
            if (display_name !== undefined) updates.display_name = display_name;
            if (typeof is_active === "boolean") updates.is_active = is_active;
            if (Object.keys(updates).length === 0) return res.status(400).json({ message: "Không có trường cập nhật" });

            const { data, error } = await supabase
                .from("qc_roles")
                .update(updates)
                .eq("id", id)
                .select()
                .single();
            if (error) throw error;
            return res.status(200).json(data);
        }

        if (method === "DELETE") {
            const { id } = req.query;
            if (!id) return res.status(400).json({ message: "Thiếu id" });

            // Kiểm tra xem có user nào dùng role này không
            const { count } = await supabase
                .from("qc_users")
                .select("id", { count: "exact", head: true })
                .eq("role_id", id);
            if (count > 0) {
                return res.status(400).json({ message: "Không thể xóa role vì vẫn còn nhân viên thuộc role này" });
            }

            const { error } = await supabase.from("qc_roles").delete().eq("id", id);
            if (error) throw error;
            return res.status(200).json({ message: "Đã xóa role" });
        }

        return res.status(405).json({ message: "Method not allowed" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
}