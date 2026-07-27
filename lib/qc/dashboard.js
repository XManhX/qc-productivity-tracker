import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
);

function getTodayVN() {
    const now = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
    return now.toISOString().split("T")[0];
}

function validateDate(dateStr) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
    const d = new Date(dateStr + "T00:00:00+07:00");
    return isNaN(d.getTime()) ? null : dateStr;
}

export default async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ success: false, error: "Method not allowed" });
    }

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
            role,
        } = req.query;

        const targetDate = validateDate(date) || getTodayVN();

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(500, Math.max(1, parseInt(limit, 10) || 25));

        const sortDirection = sortDir === "asc" ? 1 : -1;

        // ---- Xử lý multi role: chuyển thành mảng ----
        let filterRoles = null;
        if (role) {
            const rawRoles = Array.isArray(role) ? role : role.split(",");
            filterRoles = rawRoles.map((s) => s.trim()).filter(Boolean);
            if (filterRoles.length === 0) filterRoles = null;
        }

        const searchTerm = q?.trim()?.toLowerCase() || null;
        const filterActive =
            isActive === "true" || isActive === "1"
                ? true
                : isActive === "false" || isActive === "0"
                    ? false
                    : null;
        const filterMinTotal =
            minTotal && !isNaN(Number(minTotal)) ? Number(minTotal) : null;
        const hs = hourStart
            ? Math.max(0, Math.min(23, Number(hourStart) || 0))
            : null;
        const he = hourEnd
            ? Math.max(0, Math.min(23, Number(hourEnd) || 23))
            : null;

        let userQuery = supabase
            .from("qc_users")
            .select(
                `email, name, is_active, role_id, qc_roles!inner(role_key, display_name)`,
            )
            .order("email");

        // Sửa thành dùng .in() nếu có mảng role
        if (filterRoles) {
            userQuery = userQuery.in("qc_roles.role_key", filterRoles);
        }
        if (filterActive !== null)
            userQuery = userQuery.eq("is_active", filterActive);
        if (searchTerm) {
            userQuery = userQuery.or(
                `name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`,
            );
        }

        const { data: users, error: usersError } = await userQuery;
        if (usersError) throw usersError;

        if (!users.length) {
            return res.status(200).json({
                success: true,
                date: targetDate,
                items: [],
                total: 0,
            });
        }

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

        const { data: stats, error: statsError } = await supabase.rpc(
            "get_dashboard_stats",
            {
                target_date: targetDate,
                user_emails: [...userMap.keys()],
            },
        );
        if (statsError) throw statsError;

        const report = new Map();
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

        (stats || []).forEach((row) => {
            const entry = report.get(row.email);
            if (entry) {
                entry.total = row.total;
                if (row.hourly) {
                    Object.entries(row.hourly).forEach(([hour, count]) => {
                        const h = parseInt(hour, 10);
                        if (h >= 0 && h < 24) entry.hourly[h] = count;
                    });
                }
            }
        });

        let results = Array.from(report.values());

        if (filterMinTotal !== null) {
            results = results.filter((r) => r.total >= filterMinTotal);
        }
        if (hs !== null && he !== null) {
            results = results.filter(
                (r) => r.hourly.slice(hs, he + 1).reduce((a, b) => a + b, 0) > 0,
            );
        }

        results.sort((a, b) => {
            switch (sortBy) {
                case "name":
                    return (
                        (a.name || a.email).localeCompare(b.name || b.email) *
                        sortDirection
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