import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);

export default async function handler(req, res) {
  if (req.method !== "GET")
    return res.status(405).json({ message: "Method not allowed" });

  try {
    const {
      date,
      page = "1",
      limit = "25",
      sortBy = "total",
      sortDir = "desc",
      q,
      minTotal,
      hourStart,
      hourEnd,
      isActive,
      role, // role_key
    } = req.query;

    let targetDate = date;
    if (!targetDate) {
      const nowVN = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
      targetDate = nowVN.toISOString().split("T")[0];
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(limit) || 25));

    // Lấy danh sách user (có filter) cùng role, target
    let userQuery = supabase
      .from("qc_users")
      .select(`
        email,
        name,
        is_active,
        role_id,
        qc_roles!inner (
          role_key,
          display_name
        )
      `)
      .order("email");

    if (role) {
      userQuery = userQuery.eq("qc_roles.role_key", role);
    }
    if (isActive !== undefined) {
      const activeBool = isActive === "true" || isActive === "1";
      userQuery = userQuery.eq("is_active", activeBool);
    }
    // text search
    if (q && q.trim()) {
      const searchTerm = `%${q.trim().toLowerCase()}%`;
      userQuery = userQuery.or(`name.ilike.${searchTerm},email.ilike.${searchTerm}`);
    }

    const { data: users, error: usersError } = await userQuery;
    if (usersError) throw usersError;

    if (!users.length) {
      return res.status(200).json({ success: true, date: targetDate, items: [], total: 0 });
    }

    const emails = users.map(u => u.email);
    const userMap = {};
    for (const u of users) {
      userMap[u.email] = {
        email: u.email,
        name: u.name || "",
        is_active: u.is_active,
        role_key: u.qc_roles.role_key,
        display_name: u.qc_roles.display_name,
      };
    }

    // Lấy target năng suất cho các role xuất hiện
    const roleKeys = [...new Set(users.map(u => u.qc_roles.role_key))];
    const { data: rolesData } = await supabase
      .from("qc_roles")
      .select("role_key, qc_productivity_targets(low_threshold, medium_threshold)")
      .in("role_key", roleKeys);

    const targetMap = {};
    (rolesData || []).forEach(r => {
      const t = r.qc_productivity_targets?.[0] || {};
      targetMap[r.role_key] = {
        low_threshold: t.low_threshold || 10,
        medium_threshold: t.medium_threshold || 16,
      };
    });

    // Lấy logs trong ngày cho các operator này
    const startOfDay = `${targetDate}T00:00:00+07:00`;
    const endOfDay = `${targetDate}T23:59:59+07:00`;

    const { data: logs, error: logsError } = await supabase
      .from("qc_logs")
      .select("operator, created_at")
      .eq("page", "qc")
      .gte("created_at", startOfDay)
      .lte("created_at", endOfDay)
      .in("operator", emails);

    if (logsError) throw logsError;

    // Aggregate hourly
    const report = {};
    logs.forEach(log => {
      const email = log.operator;
      if (!userMap[email]) return;
      const vnDate = new Date(new Date(log.created_at).getTime() + 7 * 60 * 60 * 1000);
      const hour = vnDate.getUTCHours();

      if (!report[email]) {
        report[email] = {
          ...userMap[email],
          low_threshold: targetMap[userMap[email].role_key]?.low_threshold || 10,
          medium_threshold: targetMap[userMap[email].role_key]?.medium_threshold || 16,
          total: 0,
          hourly: Array(24).fill(0),
        };
      }
      report[email].total += 1;
      report[email].hourly[hour] += 1;
    });

    // Thêm user không có log (nếu muốn hiển thị total=0)
    emails.forEach(email => {
      if (!report[email]) {
        report[email] = {
          ...userMap[email],
          low_threshold: targetMap[userMap[email].role_key]?.low_threshold || 10,
          medium_threshold: targetMap[userMap[email].role_key]?.medium_threshold || 16,
          total: 0,
          hourly: Array(24).fill(0),
        };
      }
    });

    let results = Object.values(report);

    // Filter minTotal, hour range
    if (minTotal) {
      const min = Number(minTotal);
      results = results.filter(r => r.total >= min);
    }
    if (hourStart || hourEnd) {
      const hs = Math.max(0, Math.min(23, Number(hourStart) || 0));
      const he = Math.max(0, Math.min(23, Number(hourEnd) || 23));
      results = results.filter(r => r.hourly.slice(hs, he + 1).reduce((a, b) => a + b, 0) > 0);
    }

    // Sort
    const sortKey = sortBy || "total";
    const direction = sortDir === "asc" ? 1 : -1;
    results.sort((a, b) => {
      if (sortKey === "name") {
        const av = (a.name || a.email).toLowerCase();
        const bv = (b.name || b.email).toLowerCase();
        return av.localeCompare(bv) * direction;
      }
      if (sortKey === "role") {
        return (a.role_key || "").localeCompare(b.role_key || "") * direction;
      }
      if (sortKey === "total") {
        return (a.total - b.total) * direction;
      }
      if (sortKey.startsWith("hour-")) {
        const hr = Number(sortKey.split("-")[1]);
        return ((a.hourly[hr] || 0) - (b.hourly[hr] || 0)) * direction;
      }
      return 0;
    });

    const totalCount = results.length;
    const startIdx = (pageNum - 1) * pageSize;
    const items = results.slice(startIdx, startIdx + pageSize);

    return res.status(200).json({
      success: true,
      date: targetDate,
      items,
      total: totalCount,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: error.message });
  }
}