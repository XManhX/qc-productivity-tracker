// lib/admin/users.js
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
);

function normalizeEmail(email) {
    return typeof email === "string" ? email.toLowerCase().trim() : "";
}

function normalizeName(name) {
    return typeof name === "string" ? name.trim() : "";
}

export default async function handler(req, res) {
    const { method } = req;

    // ===================== GET =====================
    if (method === "GET") {
        try {
            const { data, error } = await supabase
                .from("qc_users")
                .select("*, qc_roles(role_key, display_name)")
                .order("created_at", { ascending: false });

            if (error) throw error;
            const formatted = (data || []).map((u) => ({
                id: u.id,
                email: u.email,
                name: u.name,
                is_active: u.is_active,
                widget_visible: u.widget_visible,
                created_at: u.created_at,
                role_id: u.role_id,
                role_key: u.qc_roles?.role_key || null,
                display_name: u.qc_roles?.display_name || null,
                has_password: !!u.password_hash,
            }));
            return res.status(200).json(formatted);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // ===================== POST =====================
    if (method === "POST") {
        const { email, name, role_key, password, import: importUsers } = req.body || {};

        // Import hàng loạt (giữ nguyên, không hỗ trợ password)
        if (Array.isArray(importUsers) && importUsers.length > 0) {
            try {
                const { data: roles } = await supabase
                    .from("qc_roles")
                    .select("id, role_key");
                const roleMap = {};
                roles.forEach((r) => {
                    roleMap[r.role_key] = r.id;
                });

                const defaultRoleKey = req.body.defaultRoleKey || "qc_rr";
                const defaultRoleId = roleMap[defaultRoleKey] || roles[0]?.id;

                const toInsert = [];
                for (const item of importUsers) {
                    const emailNormalized = normalizeEmail(item.email);
                    if (!emailNormalized) continue;
                    let roleKey = item.role_key || defaultRoleKey;
                    const roleId = roleMap[roleKey] || defaultRoleId;
                    if (!roleId) continue;

                    toInsert.push({
                        email: emailNormalized,
                        name:
                            normalizeName(item.name) ||
                            emailNormalized.split("@")[0].toUpperCase(),
                        role_id: roleId,
                        is_active: true,
                        widget_visible: true,
                    });
                }

                if (toInsert.length === 0) {
                    return res.status(400).json({ message: "No valid data to import" });
                }

                const { data, error } = await supabase
                    .from("qc_users")
                    .insert(toInsert)
                    .select();
                if (error) {
                    if (error.code === "23505") {
                        return res.status(200).json({
                            insertedCount: 0,
                            skippedCount: toInsert.length,
                            message: "All duplicates",
                        });
                    }
                    throw error;
                }
                return res.status(200).json({
                    insertedCount: data.length,
                    skippedCount: toInsert.length - data.length,
                });
            } catch (error) {
                return res.status(500).json({ error: error.message });
            }
        }

        // Thêm một user
        const emailNormalized = normalizeEmail(email);
        if (!emailNormalized)
            return res.status(400).json({ message: "Missing email" });

        try {
            let roleId = null;
            if (role_key) {
                const { data: roleData } = await supabase
                    .from("qc_roles")
                    .select("id")
                    .eq("role_key", role_key)
                    .single();
                roleId = roleData?.id;
            }
            if (!roleId) {
                const { data: defaultRole } = await supabase
                    .from("qc_roles")
                    .select("id")
                    .eq("role_key", "qc_rr")
                    .single();
                roleId = defaultRole?.id;
            }

            const newUser = {
                email: emailNormalized,
                name:
                    normalizeName(name) ||
                    emailNormalized.split("@")[0].toUpperCase(),
                role_id: roleId,
                is_active: true,
                widget_visible: true,
            };

            // Xử lý mật khẩu
            if (password && typeof password === 'string' && password.trim().length >= 6) {
                newUser.password_hash = await bcrypt.hash(password.trim(), 10);
            }

            const { data, error } = await supabase
                .from("qc_users")
                .insert([newUser])
                .select();

            if (error) throw error;
            return res.status(201).json(data[0]);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // ===================== PUT =====================
    if (method === "PUT") {
        const { id, name, email, is_active, widget_visible, role_key, password } = req.body || {};
        if (!id) return res.status(400).json({ message: "Missing id" });

        const updatePayload = {};
        if (name !== undefined) updatePayload.name = normalizeName(name);
        if (email !== undefined) updatePayload.email = normalizeEmail(email);
        if (typeof is_active === "boolean") updatePayload.is_active = is_active;
        if (typeof widget_visible === "boolean") updatePayload.widget_visible = widget_visible;
        if (role_key) {
            const { data: roleData } = await supabase
                .from("qc_roles")
                .select("id")
                .eq("role_key", role_key)
                .single();
            if (roleData) updatePayload.role_id = roleData.id;
        }

        // Xử lý mật khẩu
        if (password !== undefined) {
            if (password === '') {
                // Xóa mật khẩu
                updatePayload.password_hash = null;
            } else if (typeof password === 'string' && password.trim().length >= 6) {
                updatePayload.password_hash = await bcrypt.hash(password.trim(), 10);
            }
            // Bỏ qua nếu password ngắn hơn 6 ký tự
        }

        if (Object.keys(updatePayload).length === 0)
            return res.status(400).json({ message: "No fields to update" });

        const { data, error } = await supabase
            .from("qc_users")
            .update(updatePayload)
            .eq("id", id)
            .select();
        if (error) return res.status(500).json({ error: error.message });
        if (!data.length) return res.status(404).json({ message: "User not found" });
        return res.status(200).json(data[0]);
    }

    // ===================== DELETE =====================
    if (method === "DELETE") {
        const { id } = req.query;
        const { error } = await supabase.from("qc_users").delete().eq("id", id);
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ message: "Deleted" });
    }

    return res.status(405).json({ message: "Method not allowed" });
}