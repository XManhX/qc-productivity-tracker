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
    // Query params for pagination and filters
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
    } = req.query;

    let targetDateStr = date;
    if (!targetDateStr) {
      const nowVN = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
      targetDateStr = nowVN.toISOString().split("T")[0];
    }

    const startOfDay = new Date(
      `${targetDateStr}T00:00:00+07:00`,
    ).toISOString();
    const endOfDay = new Date(`${targetDateStr}T23:59:59+07:00`).toISOString();

    // parse pagination params
    const pageNum = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(limit) || 25));

    // Try calling the DB-side aggregate function via RPC first
    try {
      const rpcParams = {
        p_date: targetDateStr,
        p_limit: pageSize,
        p_offset: (pageNum - 1) * pageSize,
        p_q: q || null,
        p_min_total: minTotal ? Number(minTotal) : null,
        p_hour_start: hourStart ? Number(hourStart) : null,
        p_hour_end: hourEnd ? Number(hourEnd) : null,
        p_is_active:
          typeof isActive !== "undefined"
            ? String(isActive) === "true" || String(isActive) === "1"
            : null,
        p_sort_by: sortBy,
        p_sort_dir: sortDir,
      };

      const { data: rpcRows, error: rpcError } = await supabase.rpc(
        "qc_hourly_aggregate",
        rpcParams,
      );
      if (!rpcError && Array.isArray(rpcRows)) {
        const totalCount =
          rpcRows.length > 0 ? Number(rpcRows[0].total_count || 0) : 0;
        const items = rpcRows.map((r) => {
          const hourly = [];
          for (let i = 0; i < 24; i++) hourly.push(Number(r[`hour${i}`] || 0));
          return {
            email: r.email,
            name: r.name,
            is_active: typeof r.is_active === "boolean" ? r.is_active : null,
            total: Number(r.total || 0),
            hourly,
          };
        });

        return res
          .status(200)
          .json({
            success: true,
            date: targetDateStr,
            items,
            total: totalCount,
          });
      }
      // if rpcError, fall through to in-memory fallback
    } catch (rpcCatchErr) {
      // log and continue to fallback
      console.error(
        "RPC qc_hourly_aggregate failed:",
        rpcCatchErr?.message || rpcCatchErr,
      );
    }

    // Fallback: in-memory aggregation (legacy)
    const { data: users, error: usersError } = await supabase
      .from("qc_users")
      .select("email, name, is_active");

    if (usersError) throw usersError;

    const userMap = users.reduce((acc, user) => {
      if (user.email)
        acc[user.email.toLowerCase()] = {
          name: user.name || "",
          is_active: user.is_active,
        };
      return acc;
    }, {});

    // 2. Fetch logs for the day (page = 'qc')
    const { data: logs, error } = await supabase
      .from("qc_logs")
      .select("operator, created_at")
      .eq("page", "qc")
      .gte("created_at", startOfDay)
      .lte("created_at", endOfDay);

    if (error) throw error;

    // 3. Aggregate in memory (still safe for moderate volumes); result per operator
    const report = {};
    logs.forEach((log) => {
      if (!log.operator) return;
      const email = log.operator.toLowerCase();
      const dateVN = new Date(
        new Date(log.created_at).getTime() + 7 * 60 * 60 * 1000,
      );
      const hour = dateVN.getUTCHours();

      if (!report[email]) {
        report[email] = {
          email,
          name: userMap[email]?.name || "",
          is_active: userMap[email]?.is_active ?? null,
          total: 0,
          hourly: Array(24).fill(0),
        };
      }

      report[email].total += 1;
      report[email].hourly[hour] += 1;
    });

    // 4. Convert to array and apply filters
    let results = Object.values(report);

    // text search q (name or email)
    if (q && q.trim()) {
      const qlower = q.trim().toLowerCase();
      results = results.filter((r) => {
        const name = (r.name || "").toLowerCase();
        const email = (r.email || "").toLowerCase();
        return name.includes(qlower) || email.includes(qlower);
      });
    }

    // isActive filter
    if (typeof isActive !== "undefined") {
      const truthy = String(isActive) === "true" || String(isActive) === "1";
      results = results.filter((r) => {
        if (r.is_active === null) return truthy ? false : true; // unknown treated as inactive
        return truthy ? !!r.is_active : true;
      });
    }

    // minTotal filter
    if (minTotal) {
      const min = Number(minTotal) || 0;
      results = results.filter((r) => Number(r.total) >= min);
    }

    // hour range filter: keep users having any count in hourStart..hourEnd
    if (hourStart || hourEnd) {
      const hs = Math.max(0, Math.min(23, Number(hourStart) || 0));
      const he = Math.max(0, Math.min(23, Number(hourEnd) || 23));
      results = results.filter((r) => {
        const sum = r.hourly.slice(hs, he + 1).reduce((a, b) => a + b, 0);
        return sum > 0;
      });
    }

    // 5. Sorting
    const sortKey = String(sortBy || "total");
    const direction =
      String(sortDir || "desc").toLowerCase() === "asc" ? 1 : -1;

    results.sort((a, b) => {
      let av, bv;
      if (sortKey === "name") {
        av = (a.name || a.email || "").toLowerCase();
        bv = (b.name || b.email || "").toLowerCase();
        if (av < bv) return -1 * direction;
        if (av > bv) return 1 * direction;
        return 0;
      }

      if (sortKey === "total") {
        av = Number(a.total) || 0;
        bv = Number(b.total) || 0;
        return (av - bv) * direction;
      }

      if (sortKey.startsWith("hour-")) {
        const hr = Number(sortKey.split("-")[1]) || 0;
        av = Number(a.hourly?.[hr] || 0);
        bv = Number(b.hourly?.[hr] || 0);
        return (av - bv) * direction;
      }

      return 0;
    });

    const totalCount = results.length;

    // 6. Paginate
    const start = (pageNum - 1) * pageSize;
    const end = start + pageSize;
    const items = results.slice(start, end);

    return res.status(200).json({
      success: true,
      date: targetDateStr,
      items,
      total: totalCount,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
