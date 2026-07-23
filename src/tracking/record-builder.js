export function buildRecord(
  pageType,
  action,
  startFields,
  endFields,
  operatorEmail,
  startTime,
  endTime,
) {
  const id = Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  // Merge fields, ưu tiên endFields nếu trùng key
  const mergedFields = { ...startFields, ...endFields };

  return {
    id,
    idempotency_key: id,
    version: "__VERSION__",
    page: pageType,
    action: action,
    operator: operatorEmail,
    url: location.href,
    page_start_time: startTime,
    page_end_time: endTime,
    ...mergedFields,
  };
}
