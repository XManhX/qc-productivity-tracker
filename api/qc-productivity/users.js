import { createClient } from "@supabase/supabase-js";

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

// Hàm tạo map role_key -> role_id
function buildRoleMap(roles) {
  const map = {};
  (roles || []).forEach((r) => {
    if (r.role_key) map[r.role_key.toLowerCase()] = r.id;
  });
  return map;
}

// Normalize import payload, thêm role_id dựa vào roleMap và defaultRoleKey
function normalizeImportPayload(payload, roleMap, defaultRoleKey) {
  if (!Array.isArray(payload)) return [];

  return payload
    .map((item) => {
      const email = normalizeEmail(item?.email);
      if (!email) return null;

      let roleKey = (item?.role_key || item?.role || "").toString().toLowerCase().trim();
      if (!roleKey && defaultRoleKey) roleKey = defaultRoleKey.toLowerCase();
      const roleId = roleMap[roleKey] || null;

      // Nếu không tìm thấy role, dùng fallback là 'qc_rr' (nếu có)
      const fallbackRoleId = roleMap['qc_rr'] || null;
      if (!roleId && !fallbackRoleId) return null;

      return {
        email,
        name: normalizeName(item?.name) || email.split("@")[0].toUpperCase(),
        role_id: roleId || fallbackRoleId,
      };
    })
    .filter(Boolean);
}

export default async function handler(req, res) {
  const { method } = req;

  // Lấy danh sách roles (dùng chung)
  const fetchRoles = async () => {
    const { data, error } = await supabase.from("qc_roles").select("id, role_key");
    if (error) throw error;
    return data || [];
  };

  if (method === "GET") {
    try {
      const { data, error } = await supabase
        .from("qc_users")
        .select("*, qc_roles(role_key, display_name)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const formatted = (data || []).map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        is_active: user.is_active,
        created_at: user.created_at,
        role_id: user.role_id,
        role_key: user.qc_roles?.role_key || null,
        display_name: user.qc_roles?.display_name || null,
      }));

      return res.status(200).json(formatted);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (method === "POST") {
    const { email, name, import: importUsers, role_key, defaultRoleKey } = req.body || {};

    // Import hàng loạt
    if (Array.isArray(importUsers) && importUsers.length > 0) {
      try {
        const roles = await fetchRoles();
        const roleMap = buildRoleMap(roles);
        const defaultRole = defaultRoleKey || 'qc_rr';
        const normalizedRows = normalizeImportPayload(importUsers, roleMap, defaultRole);
        if (normalizedRows.length === 0) {
          return res.status(400).json({ message: "No valid emails found in import payload" });
        }

        const uniqueRows = normalizedRows.filter(
          (row, index, arr) => arr.findIndex((item) => item.email === row.email) === index,
        );
        const emails = uniqueRows.map((row) => row.email);

        const { data: existingUsers, error: lookupError } = await supabase
          .from("qc_users")
          .select("email")
          .in("email", emails);

        if (lookupError) throw lookupError;

        const existingEmails = new Set((existingUsers || []).map((row) => normalizeEmail(row.email)));
        const toInsert = uniqueRows.filter((row) => !existingEmails.has(row.email));

        if (toInsert.length > 0) {
          const insertPayload = toInsert.map((row) => ({
            email: row.email,
            name: row.name,
            role_id: row.role_id,
            is_active: true,
          }));

          const { data, error } = await supabase.from("qc_users").insert(insertPayload).select();
          if (error) throw error;

          return res.status(200).json({
            insertedCount: data.length,
            skippedCount: uniqueRows.length - data.length,
            insertedUsers: data,
          });
        }

        return res.status(200).json({
          insertedCount: 0,
          skippedCount: uniqueRows.length,
          insertedUsers: [],
        });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }

    // Thêm một user
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return res.status(400).json({ message: "Missing email" });

    try {
      let roleId = null;
      if (role_key) {
        const roles = await fetchRoles();
        const found = roles.find((r) => r.role_key === role_key);
        if (!found) return res.status(400).json({ message: "Invalid role_key" });
        roleId = found.id;
      } else {
        // Mặc định role 'qc_rr'
        const roles = await fetchRoles();
        const defaultRole = roles.find((r) => r.role_key === "qc_rr");
        roleId = defaultRole?.id || null;
      }

      const { data, error } = await supabase
        .from("qc_users")
        .insert([
          {
            email: normalizedEmail,
            name: normalizeName(name) || normalizedEmail.split("@")[0].toUpperCase(),
            role_id: roleId,
            is_active: true,
          },
        ])
        .select();

      if (error) throw error;
      return res.status(201).json(data[0]);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (method === "DELETE") {
    const { id } = req.query;
    const { error } = await supabase.from("qc_users").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ message: "User deleted successfully" });
  }

  if (method === "PUT") {
    const { id, name, email, is_active, role_key } = req.body || {};
    if (!id) return res.status(400).json({ message: "Missing id" });

    const updatePayload = {};
    if (typeof name === "string") updatePayload.name = normalizeName(name);
    if (typeof email === "string") updatePayload.email = normalizeEmail(email);
    if (typeof is_active === "boolean") updatePayload.is_active = is_active;

    if (role_key) {
      try {
        const roles = await fetchRoles();
        const found = roles.find((r) => r.role_key === role_key);
        if (!found) return res.status(400).json({ message: "Invalid role_key" });
        updatePayload.role_id = found.id;
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({ message: "No valid update fields provided" });
    }

    const { data, error } = await supabase
      .from("qc_users")
      .update(updatePayload)
      .eq("id", id)
      .select();

    if (error) return res.status(500).json({ error: error.message });
    if (data.length === 0) return res.status(404).json({ message: "User not found" });
    return res.status(200).json(data[0]);
  }

  return res.status(405).json({ message: "Method not allowed" });
}