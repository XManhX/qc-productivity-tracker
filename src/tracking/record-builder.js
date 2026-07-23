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
  // Merge fields, ưu tiên endFields nếu trùng
  const merged = { ...startFields, ...endFields };

  // Tách riêng asn và return_tn
  const asn = merged.asn || "";
  const returnTn = merged.return_tn || "";

  // Gom tất cả các field còn lại vào extra_data, bao gồm cả asn, return_tn để đầy đủ
  const extraData = { ...merged };

  return {
    id,
    idempotency_key: id,
    version: "__VERSION__",
    page: pageType,
    action: action,
    operator: operatorEmail,
    url: location.href,
    asn,
    return_tn: returnTn,
    page_start_time: startTime,
    page_end_time: endTime,
    extra_data: extraData,
  };
}
