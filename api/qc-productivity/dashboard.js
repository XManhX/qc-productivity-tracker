import { createClient } from "@supabase/supabase-js";

// Khởi tạo Supabase client (nên dùng singleton hoặc tái sử dụng)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);

/**
 * Lấy ngày hôm nay theo múi giờ Việt Nam (UTC+7)
 */
function getTodayVN() {
  const now = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
  return now.toISOString().split("T")[0];
}

/**
 * Validator đơn giản cho tham số query
 */
function validateDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(dateStr + "T00:00:00+07:00");
  return isNaN(d.getTime()) ? null : dateStr;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  try {
    // ---------- 1. Parse & validate query params ----------
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
      role,
    } = req.query;

    // Ngày target: ưu tiên tham số, nếu không có hoặc không hợp lệ thì dùng hôm nay
    const targetDate = validateDate(date) || getTodayVN();

    // Phân trang
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(limit, 10) || 25));

    // Sắp xếp
    const sortDirection = sortDir === "asc" ? 1 : -1;

    // Các bộ lọc cần parse
    const filterRole = role?.trim() || null;
    const searchTerm = q?.trim()?.toLowerCase() || null;

    // Chỉ lọc isActive nếu giá trị rõ ràng là "true" hoặc "1"
    const filterActive =
      isActive === "true" || isActive === "1"
        ? true
        : isActive === "false" || isActive === "0"
          ? false
          : null;

    // minTotal: chỉ lọc nếu là số hợp lệ
    const filterMinTotal =
      minTotal && !isNaN(Number(minTotal)) ? Number(minTotal) : null;

    // Khoảng giờ
    const hs = hourStart
      ? Math.max(0, Math.min(23, Number(hourStart) || 0))
      : null;
    const he = hourEnd
      ? Math.max(0, Math.min(23, Number(hourEnd) || 23))
      : null;

    // ---------- 2. Xây dựng query lấy users ----------
    let userQuery = supabase
      .from("qc_users")
      .select(
        `email, name, is_active, role_id, qc_roles!inner(role_key, display_name)`,
      )
      .order("email");

    // Áp dụng các filter (chỉ khi có giá trị thực)
    if (filterRole) userQuery = userQuery.eq("qc_roles.role_key", filterRole);
    if (filterActive !== null)
      userQuery = userQuery.eq("is_active", filterActive);
    if (searchTerm) {
      // Sử dụng tham số hóa để tránh SQL injection (Supabase đã tự bảo vệ)
      userQuery = userQuery.or(
        `name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`,
      );
    }

    // ---------- 3. Thực hiện truy vấn song song ----------
    const { data: users, error: usersError } = await userQuery;
    if (usersError) throw usersError;

    // Nếu không có user, trả về ngay
    if (!users.length) {
      return res.status(200).json({
        success: true,
        date: targetDate,
        items: [],
        total: 0,
      });
    }

    // Map user info
    const userMap = new Map();
    const roleKeys = new Set();
    for (const u of users) {
      userMap.set(u.email, {
        email: u.email,
        name: u.name || "",
        is_active: u.is_active,
        role_key: u.qc_roles.role_key,
        display_name: u.qc_roles.display_name,
      });
      roleKeys.add(u.qc_roles.role_key);
    }

    // Lấy targets cho các role (song song)
    const [{ data: rolesData, error: rolesError }] = await Promise.all([
      supabase
        .from("qc_roles")
        .select(
          "role_key, qc_productivity_targets(low_threshold, medium_threshold)",
        )
        .in("role_key", [...roleKeys]),
    ]);
    if (rolesError) throw rolesError;

    const targetMap = {};
    (rolesData || []).forEach((r) => {
      const t = r.qc_productivity_targets?.[0] || {};
      targetMap[r.role_key] = {
        low_threshold: t.low_threshold || 10,
        medium_threshold: t.medium_threshold || 16,
      };
    });

    // ---------- 4. Lấy logs và tổng hợp ----------
    const startOfDay = `${targetDate}T00:00:00+07:00`;
    const endOfDay = `${targetDate}T23:59:59+07:00`;

    const { data: logs, error: logsError } = await supabase
      .from("qc_logs")
      .select("operator, created_at")
      .eq("page", "qc")
      .gte("created_at", startOfDay)
      .lte("created_at", endOfDay)
      .in("operator", [...userMap.keys()]);

    if (logsError) throw logsError;

    // Tổng hợp theo giờ (dùng Map để nhanh)
    const report = new Map();

    // Khởi tạo báo cáo cho mọi user (kể cả không có log)
    for (const [email, info] of userMap) {
      const targets = targetMap[info.role_key] || {
        low_threshold: 10,
        medium_threshold: 16,
      };
      report.set(email, {
        ...info,
        low_threshold: targets.low_threshold,
        medium_threshold: targets.medium_threshold,
        total: 0,
        hourly: new Array(24).fill(0),
      });
    }

    // Điền dữ liệu từ logs
    for (const log of logs) {
      const email = log.operator;
      if (!userMap.has(email)) continue;
      const vnDate = new Date(
        new Date(log.created_at).getTime() + 7 * 60 * 60 * 1000,
      );
      const hour = vnDate.getUTCHours();
      const entry = report.get(email);
      entry.total += 1;
      entry.hourly[hour] += 1;
    }

    let results = Array.from(report.values());

    // ---------- 5. Áp dụng filter post-processing ----------
    if (filterMinTotal !== null) {
      results = results.filter((r) => r.total >= filterMinTotal);
    }
    if (hs !== null && he !== null) {
      results = results.filter(
        (r) => r.hourly.slice(hs, he + 1).reduce((a, b) => a + b, 0) > 0,
      );
    }

    // ---------- 6. Sắp xếp ----------
    results.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return (
            (a.name || a.email).localeCompare(b.name || b.email) * sortDirection
          );
        case "role":
          return a.role_key.localeCompare(b.role_key) * sortDirection;
        case "total":
          return (a.total - b.total) * sortDirection;
        default:
          if (sortBy.startsWith("hour-")) {
            const hourIndex = parseInt(sortBy.split("-")[1], 10);
            return (
              ((a.hourly[hourIndex] || 0) - (b.hourly[hourIndex] || 0)) *
              sortDirection
            );
          }
          return 0;
      }
    });

    // ---------- 7. Phân trang và trả về ----------
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
    console.error("Dashboard error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
}
