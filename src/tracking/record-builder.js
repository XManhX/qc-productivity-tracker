import { DEBUG } from "./config.js";
const log = (...args) => DEBUG && console.log("[QCTracker Record]", ...args);

export function buildRecord(
  pageType,
  action,
  startFields,
  endFields,
  operatorEmail,
  startTime,
  endTime,
) {
  log("Building record:", { pageType, action, startFields, endFields });
  const id = Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  const merged = { ...startFields, ...endFields };

  const asn = merged.asn || "";
  const returnTn = merged.return_tn || "";
  const extraData = { ...merged };

  const record = {
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
  log("Record built:", record);
  return record;
}
