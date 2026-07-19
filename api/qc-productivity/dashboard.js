// api/qc-productivity/dashboard.js
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
      role,          // mới: lọc theo role_key
    } = req.query;

    let targetDateStr = date;
    if (!targetDateStr) {
      const nowVN = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
      targetDateStr = nowVN.toISOString().split("T")[0];
    }

    const startOfDay = new Date(`${targetDateStr}T00:00:00+07:00`).toISOString();
    const endOfDay = new Date(`${targetDateStr}T23:59:59+07:00`).toISOString();

    const pageNum = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(limit) || 25));

    // ----- Lấy danh sách users kèm role và target -----
    let userQuery = supabase
      .from("qc_users")
      .select(`
        email, name, is_active,
        qc_roles ( role_key, display_name ),
        qc_productivity_targets ( low_threshold, medium_threshold )
      `)
      .eq("qc_roles.is_active", true)  // chỉ lấy role đang active
      .order("email");

    // Nếu filter theo role (role_key)
    if (role) {
      userQuery = userQuery.eq("qc_roles.role_key", role);
    }

    const { data: users, error: usersError } = await userQuery;
    if (usersError) throw usersError;

    // Tạo map email -> user info (bao gồm role_key, ngưỡng)
    const userMap = {};
    users.forEach((u) => {
      if (u.email) {
        userMap[u.email.toLowerCase()] = {
          name: u.name || "",
          is_active: u.is_active,
          role_key: u.qc_roles?.role_key || "",
          display_name: u.qc_roles?.display_name || "",
          low_threshold: u.qc_productivity_targets?.low_threshold || 10,
          medium_threshold: u.qc_productivity_targets?.medium_threshold || 16,
        };
      }
    });

    // Áp dụng filter is_active (sau khi đã có user map)
    let filteredEmails = Object.keys(userMap);
    if (isActive !== undefined) {
      const truthy = String(isActive) === "true" || String(isActive) === "1";
      filteredEmails = filteredEmails.filter(email => {
        const u = userMap[email];
        if (u.is_active === null) return truthy ? false : true;
        return truthy ? !!u.is_active : true;
      });
    }

    // Nếu có filter search q, giới hạn emails
    if (q && q.trim()) {
      const qlower = q.trim().toLowerCase();
      filteredEmails = filteredEmails.filter(email => {
        const u = userMap[email];
        const name = (u.name || "").toLowerCase();
        return name.includes(qlower) || email.includes(qlower);
      });
    }

    // Lấy logs trong ngày cho các operator còn lại
    const { data: logs, error: logsError } = await supabase
      .from("qc_logs")
      .select("operator, created_at")
      .eq("page", "qc")
      .gte("created_at", startOfDay)
      .lte("created_at", endOfDay)
      .in("operator", filteredEmails);

    if (logsError) throw logsError;

    // Aggregate in-memory
    const report = {};
    logs.forEach((log) => {
      const email = log.operator?.toLowerCase();
      if (!email || !userMap[email]) return;  // chỉ giữ lại user có trong danh sách đã lọc

      const dateVN = new Date(new Date(log.created_at).getTime() + 7 * 60 * 60 * 1000);
      const hour = dateVN.getUTCHours();

      if (!report[email]) {
        report[email] = {
          email,
          name: userMap[email].name,
          is_active: userMap[email].is_active,
          role_key: userMap[email].role_key,
          display_name: userMap[email].display_name,
          low_threshold: userMap[email].low_threshold,
          medium_threshold: userMap[email].medium_threshold,
          total: 0,
          hourly: Array(24).fill(0),
        };
      }
      report[email].total += 1;
      report[email].hourly[hour] += 1;
    });

    // Có thể bổ sung thêm user không có log (total=0) nếu muốn hiển thị
    // Hiện tại chỉ hiển thị user có ít nhất 1 log; nếu muốn hiển thị tất cả user thoả filter, cần duyệt qua filteredEmails và thêm những email chưa có trong report.

    let results = Object.values(report);

    // Lọc theo minTotal
    if (minTotal) {
      const min = Number(minTotal) || 0;
      results = results.filter(r => r.total >= min);
    }

    // Lọc theo khoảng giờ (chỉ giữ user có ít nhất 1 scan trong khoảng)
    if (hourStart || hourEnd) {
      const hs = Math.max(0, Math.min(23, Number(hourStart) || 0));
      const he = Math.max(0, Math.min(23, Number(hourEnd) || 23));
      results = results.filter(r => {
        const sum = r.hourly.slice(hs, he + 1).reduce((a, b) => a + b, 0);
        return sum > 0;
      });
    }

    // Sắp xếp
    const sortKey = String(sortBy || "total");
    const direction = String(sortDir || "desc").toLowerCase() === "asc" ? 1 : -1;

    results.sort((a, b) => {
      if (sortKey === "name") {
        const av = (a.name || a.email || "").toLowerCase();
        const bv = (b.name || b.email || "").toLowerCase();
        if (av < bv) return -1 * direction;
        if (av > bv) return 1 * direction;
        return 0;
      }
      if (sortKey === "role") {
        const av = (a.role_key || "").toLowerCase();
        const bv = (b.role_key || "").toLowerCase();
        return av.localeCompare(bv) * direction;
      }
      if (sortKey === "total") {
        return (Number(a.total) - Number(b.total)) * direction;
      }
      if (sortKey.startsWith("hour-")) {
        const hr = Number(sortKey.split("-")[1]) || 0;
        return (Number(a.hourly[hr] || 0) - Number(b.hourly[hr] || 0)) * direction;
      }
      return 0;
    });

    const totalCount = results.length;
    const startIdx = (pageNum - 1) * pageSize;
    const items = results.slice(startIdx, startIdx + pageSize);

    return res.status(200).json({
      success: true,
      date: targetDateStr,
      items,
      total: totalCount,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: error.message });
  }
}