-- sql/qc_hourly_aggregate.sql
-- Creates a function qc_hourly_aggregate that returns per-operator hourly counts for a VN date.
-- Usage: run this SQL in your Supabase (Postgres) SQL editor or with psql against the DB.

CREATE OR REPLACE FUNCTION public.qc_hourly_aggregate(
  p_date date,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0,
  p_q text DEFAULT NULL,
  p_min_total integer DEFAULT NULL,
  p_hour_start integer DEFAULT NULL,
  p_hour_end integer DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_sort_by text DEFAULT 'total',
  p_sort_dir text DEFAULT 'desc'
)
RETURNS TABLE (
  email text,
  name text,
  is_active boolean,
  total bigint,
  hour0 bigint, hour1 bigint, hour2 bigint, hour3 bigint, hour4 bigint, hour5 bigint,
  hour6 bigint, hour7 bigint, hour8 bigint, hour9 bigint, hour10 bigint, hour11 bigint,
  hour12 bigint, hour13 bigint, hour14 bigint, hour15 bigint, hour16 bigint, hour17 bigint,
  hour18 bigint, hour19 bigint, hour20 bigint, hour21 bigint, hour22 bigint, hour23 bigint,
  total_count bigint
)
LANGUAGE sql STABLE
AS $$
WITH grouped AS (
  SELECT
    lower(qc_logs.operator) AS email,
    coalesce(qc_users.name, '') AS name,
    qc_users.is_active,
    count(*) AS total,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 0 THEN 1 ELSE 0 END) AS hour0,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 1 THEN 1 ELSE 0 END) AS hour1,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 2 THEN 1 ELSE 0 END) AS hour2,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 3 THEN 1 ELSE 0 END) AS hour3,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 4 THEN 1 ELSE 0 END) AS hour4,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 5 THEN 1 ELSE 0 END) AS hour5,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 6 THEN 1 ELSE 0 END) AS hour6,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 7 THEN 1 ELSE 0 END) AS hour7,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 8 THEN 1 ELSE 0 END) AS hour8,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 9 THEN 1 ELSE 0 END) AS hour9,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 10 THEN 1 ELSE 0 END) AS hour10,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 11 THEN 1 ELSE 0 END) AS hour11,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 12 THEN 1 ELSE 0 END) AS hour12,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 13 THEN 1 ELSE 0 END) AS hour13,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 14 THEN 1 ELSE 0 END) AS hour14,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 15 THEN 1 ELSE 0 END) AS hour15,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 16 THEN 1 ELSE 0 END) AS hour16,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 17 THEN 1 ELSE 0 END) AS hour17,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 18 THEN 1 ELSE 0 END) AS hour18,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 19 THEN 1 ELSE 0 END) AS hour19,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 20 THEN 1 ELSE 0 END) AS hour20,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 21 THEN 1 ELSE 0 END) AS hour21,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 22 THEN 1 ELSE 0 END) AS hour22,
    sum(CASE WHEN extract(hour from qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = 23 THEN 1 ELSE 0 END) AS hour23
  FROM public.qc_logs
  LEFT JOIN public.qc_users ON lower(qc_users.email) = lower(qc_logs.operator)
  WHERE qc_logs.page = 'qc'
    AND (qc_logs.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = p_date
  GROUP BY lower(qc_logs.operator), qc_users.name, qc_users.is_active
)
SELECT g.email, g.name, g.is_active, g.total,
  g.hour0, g.hour1, g.hour2, g.hour3, g.hour4, g.hour5, g.hour6, g.hour7, g.hour8, g.hour9, g.hour10, g.hour11,
  g.hour12, g.hour13, g.hour14, g.hour15, g.hour16, g.hour17, g.hour18, g.hour19, g.hour20, g.hour21, g.hour22, g.hour23,
  count(*) OVER() AS total_count
FROM grouped g
WHERE (
  p_q IS NULL
  OR (g.name ILIKE '%' || p_q || '%' OR g.email ILIKE '%' || p_q || '%')
)
AND (
  p_is_active IS NULL
  OR (g.is_active IS NOT NULL AND g.is_active = p_is_active)
)
AND (
  p_min_total IS NULL
  OR g.total >= p_min_total
)
AND (
  p_hour_start IS NULL
  OR p_hour_end IS NULL
  OR (
    (CASE WHEN p_hour_start <= 0 AND p_hour_end >= 0 THEN g.hour0 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 1 AND p_hour_end >= 1 THEN g.hour1 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 2 AND p_hour_end >= 2 THEN g.hour2 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 3 AND p_hour_end >= 3 THEN g.hour3 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 4 AND p_hour_end >= 4 THEN g.hour4 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 5 AND p_hour_end >= 5 THEN g.hour5 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 6 AND p_hour_end >= 6 THEN g.hour6 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 7 AND p_hour_end >= 7 THEN g.hour7 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 8 AND p_hour_end >= 8 THEN g.hour8 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 9 AND p_hour_end >= 9 THEN g.hour9 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 10 AND p_hour_end >= 10 THEN g.hour10 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 11 AND p_hour_end >= 11 THEN g.hour11 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 12 AND p_hour_end >= 12 THEN g.hour12 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 13 AND p_hour_end >= 13 THEN g.hour13 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 14 AND p_hour_end >= 14 THEN g.hour14 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 15 AND p_hour_end >= 15 THEN g.hour15 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 16 AND p_hour_end >= 16 THEN g.hour16 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 17 AND p_hour_end >= 17 THEN g.hour17 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 18 AND p_hour_end >= 18 THEN g.hour18 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 19 AND p_hour_end >= 19 THEN g.hour19 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 20 AND p_hour_end >= 20 THEN g.hour20 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 21 AND p_hour_end >= 21 THEN g.hour21 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 22 AND p_hour_end >= 22 THEN g.hour22 ELSE 0 END)
    + (CASE WHEN p_hour_start <= 23 AND p_hour_end >= 23 THEN g.hour23 ELSE 0 END)
  ) > 0
)
ORDER BY
  CASE WHEN p_sort_by = 'name' AND lower(p_sort_dir) = 'asc' THEN g.name END ASC,
  CASE WHEN p_sort_by = 'name' AND lower(p_sort_dir) = 'desc' THEN g.name END DESC,
  CASE WHEN p_sort_by = 'total' AND lower(p_sort_dir) = 'asc' THEN g.total END ASC,
  CASE WHEN p_sort_by = 'total' AND lower(p_sort_dir) = 'desc' THEN g.total END DESC,
  CASE WHEN p_sort_by = 'hour-0' AND lower(p_sort_dir) = 'asc' THEN g.hour0 END ASC,
  CASE WHEN p_sort_by = 'hour-0' AND lower(p_sort_dir) = 'desc' THEN g.hour0 END DESC,
  CASE WHEN p_sort_by = 'hour-1' AND lower(p_sort_dir) = 'asc' THEN g.hour1 END ASC,
  CASE WHEN p_sort_by = 'hour-1' AND lower(p_sort_dir) = 'desc' THEN g.hour1 END DESC,
  CASE WHEN p_sort_by = 'hour-2' AND lower(p_sort_dir) = 'asc' THEN g.hour2 END ASC,
  CASE WHEN p_sort_by = 'hour-2' AND lower(p_sort_dir) = 'desc' THEN g.hour2 END DESC,
  CASE WHEN p_sort_by = 'hour-3' AND lower(p_sort_dir) = 'asc' THEN g.hour3 END ASC,
  CASE WHEN p_sort_by = 'hour-3' AND lower(p_sort_dir) = 'desc' THEN g.hour3 END DESC,
  CASE WHEN p_sort_by = 'hour-4' AND lower(p_sort_dir) = 'asc' THEN g.hour4 END ASC,
  CASE WHEN p_sort_by = 'hour-4' AND lower(p_sort_dir) = 'desc' THEN g.hour4 END DESC,
  CASE WHEN p_sort_by = 'hour-5' AND lower(p_sort_dir) = 'asc' THEN g.hour5 END ASC,
  CASE WHEN p_sort_by = 'hour-5' AND lower(p_sort_dir) = 'desc' THEN g.hour5 END DESC,
  CASE WHEN p_sort_by = 'hour-6' AND lower(p_sort_dir) = 'asc' THEN g.hour6 END ASC,
  CASE WHEN p_sort_by = 'hour-6' AND lower(p_sort_dir) = 'desc' THEN g.hour6 END DESC,
  CASE WHEN p_sort_by = 'hour-7' AND lower(p_sort_dir) = 'asc' THEN g.hour7 END ASC,
  CASE WHEN p_sort_by = 'hour-7' AND lower(p_sort_dir) = 'desc' THEN g.hour7 END DESC,
  CASE WHEN p_sort_by = 'hour-8' AND lower(p_sort_dir) = 'asc' THEN g.hour8 END ASC,
  CASE WHEN p_sort_by = 'hour-8' AND lower(p_sort_dir) = 'desc' THEN g.hour8 END DESC,
  CASE WHEN p_sort_by = 'hour-9' AND lower(p_sort_dir) = 'asc' THEN g.hour9 END ASC,
  CASE WHEN p_sort_by = 'hour-9' AND lower(p_sort_dir) = 'desc' THEN g.hour9 END DESC,
  CASE WHEN p_sort_by = 'hour-10' AND lower(p_sort_dir) = 'asc' THEN g.hour10 END ASC,
  CASE WHEN p_sort_by = 'hour-10' AND lower(p_sort_dir) = 'desc' THEN g.hour10 END DESC,
  CASE WHEN p_sort_by = 'hour-11' AND lower(p_sort_dir) = 'asc' THEN g.hour11 END ASC,
  CASE WHEN p_sort_by = 'hour-11' AND lower(p_sort_dir) = 'desc' THEN g.hour11 END DESC,
  CASE WHEN p_sort_by = 'hour-12' AND lower(p_sort_dir) = 'asc' THEN g.hour12 END ASC,
  CASE WHEN p_sort_by = 'hour-12' AND lower(p_sort_dir) = 'desc' THEN g.hour12 END DESC,
  CASE WHEN p_sort_by = 'hour-13' AND lower(p_sort_dir) = 'asc' THEN g.hour13 END ASC,
  CASE WHEN p_sort_by = 'hour-13' AND lower(p_sort_dir) = 'desc' THEN g.hour13 END DESC,
  CASE WHEN p_sort_by = 'hour-14' AND lower(p_sort_dir) = 'asc' THEN g.hour14 END ASC,
  CASE WHEN p_sort_by = 'hour-14' AND lower(p_sort_dir) = 'desc' THEN g.hour14 END DESC,
  CASE WHEN p_sort_by = 'hour-15' AND lower(p_sort_dir) = 'asc' THEN g.hour15 END ASC,
  CASE WHEN p_sort_by = 'hour-15' AND lower(p_sort_dir) = 'desc' THEN g.hour15 END DESC,
  CASE WHEN p_sort_by = 'hour-16' AND lower(p_sort_dir) = 'asc' THEN g.hour16 END ASC,
  CASE WHEN p_sort_by = 'hour-16' AND lower(p_sort_dir) = 'desc' THEN g.hour16 END DESC,
  CASE WHEN p_sort_by = 'hour-17' AND lower(p_sort_dir) = 'asc' THEN g.hour17 END ASC,
  CASE WHEN p_sort_by = 'hour-17' AND lower(p_sort_dir) = 'desc' THEN g.hour17 END DESC,
  CASE WHEN p_sort_by = 'hour-18' AND lower(p_sort_dir) = 'asc' THEN g.hour18 END ASC,
  CASE WHEN p_sort_by = 'hour-18' AND lower(p_sort_dir) = 'desc' THEN g.hour18 END DESC,
  CASE WHEN p_sort_by = 'hour-19' AND lower(p_sort_dir) = 'asc' THEN g.hour19 END ASC,
  CASE WHEN p_sort_by = 'hour-19' AND lower(p_sort_dir) = 'desc' THEN g.hour19 END DESC,
  CASE WHEN p_sort_by = 'hour-20' AND lower(p_sort_dir) = 'asc' THEN g.hour20 END ASC,
  CASE WHEN p_sort_by = 'hour-20' AND lower(p_sort_dir) = 'desc' THEN g.hour20 END DESC,
  CASE WHEN p_sort_by = 'hour-21' AND lower(p_sort_dir) = 'asc' THEN g.hour21 END ASC,
  CASE WHEN p_sort_by = 'hour-21' AND lower(p_sort_dir) = 'desc' THEN g.hour21 END DESC,
  CASE WHEN p_sort_by = 'hour-22' AND lower(p_sort_dir) = 'asc' THEN g.hour22 END ASC,
  CASE WHEN p_sort_by = 'hour-22' AND lower(p_sort_dir) = 'desc' THEN g.hour22 END DESC,
  CASE WHEN p_sort_by = 'hour-23' AND lower(p_sort_dir) = 'asc' THEN g.hour23 END ASC,
  CASE WHEN p_sort_by = 'hour-23' AND lower(p_sort_dir) = 'desc' THEN g.hour23 END DESC
LIMIT p_limit OFFSET p_offset;
$$;

COMMENT ON FUNCTION public.qc_hourly_aggregate IS 'Return per-operator hourly counts for a VN calendar date. Use parameters to filter, page, and sort.';

-- Example usage (run in Supabase SQL editor or psql):
-- SELECT * FROM public.qc_hourly_aggregate('2026-07-19', 25, 0, 'nguyen', 10, 6, 18, true, 'total', 'desc');

-- Notes:
-- - The function converts timestamps to Asia/Ho_Chi_Minh timezone by using "created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'" and compares the date portion to p_date.
-- - It returns 24 hourly columns (hour0..hour23) plus a window column total_count representing the total number of operators matching filters (before LIMIT/OFFSET).
-- - Adjust permissions or schema names if your tables are in a different schema.
-- - For very large daily volumes, consider adding an indexed materialized view or a nightly aggregation job.
