// api/qc-productivity/users.js
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

function normalizeImportPayload(payload) {
  if (!Array.isArray(payload)) return [];

  return payload
    .map((item) => {
      const email = normalizeEmail(item?.email);
      if (!email) return null;

      return {
        email,
        name: normalizeName(item?.name) || email.split("@")[0].toUpperCase(),
      };
    })
    .filter(Boolean);
}

export default async function handler(req, res) {
  const { method } = req;

  if (method === "GET") {
    const { data, error } = await supabase
      .from("qc_users")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (method === "POST") {
    const { email, name, import: importUsers } = req.body || {};

    if (Array.isArray(importUsers) && importUsers.length > 0) {
      const normalizedRows = normalizeImportPayload(importUsers);
      if (normalizedRows.length === 0) {
        return res
          .status(400)
          .json({ message: "No valid emails found in import payload" });
      }

      const uniqueRows = normalizedRows.filter(
        (row, index, arr) =>
          arr.findIndex((item) => item.email === row.email) === index,
      );
      const emails = uniqueRows.map((row) => row.email);

      const { data: existingUsers, error: lookupError } = await supabase
        .from("qc_users")
        .select("email")
        .in("email", emails);

      if (lookupError) {
        return res.status(500).json({ error: lookupError.message });
      }

      const existingEmails = new Set(
        (existingUsers || []).map((row) => normalizeEmail(row.email)),
      );
      const toInsert = uniqueRows.filter(
        (row) => !existingEmails.has(row.email),
      );

      if (toInsert.length > 0) {
        const insertPayload = toInsert.map((row) => ({
          email: row.email,
          name: row.name,
          is_active: true,
        }));

        const { data, error } = await supabase
          .from("qc_users")
          .insert(insertPayload)
          .select();

        if (error) return res.status(500).json({ error: error.message });

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
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail)
      return res.status(400).json({ message: "Missing email" });

    const { data, error } = await supabase
      .from("qc_users")
      .insert([
        {
          email: normalizedEmail,
          name:
            normalizeName(name) || normalizedEmail.split("@")[0].toUpperCase(),
          is_active: true,
        },
      ])
      .select();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data[0]);
  }

  if (method === "DELETE") {
    const { id } = req.query;
    const { error } = await supabase.from("qc_users").delete().eq("id", id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ message: "User deleted successfully" });
  }

  if (method === "PUT") {
    const { id, name, email, is_active } = req.body || {};
    if (!id) {
      return res.status(400).json({ message: "Missing id" });
    }

    const updatePayload = {};
    if (typeof name === "string") {
      updatePayload.name = normalizeName(name);
    }
    if (typeof email === "string") {
      updatePayload.email = normalizeEmail(email);
    }
    if (typeof is_active === "boolean") {
      updatePayload.is_active = is_active;
    }

    if (Object.keys(updatePayload).length === 0) {
      return res
        .status(400)
        .json({ message: "No valid update fields provided" });
    }

    const { data, error } = await supabase
      .from("qc_users")
      .update(updatePayload)
      .eq("id", id)
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    if (data.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json(data[0]);
  }

  return res.status(405).json({ message: "Method not allowed" });
}
