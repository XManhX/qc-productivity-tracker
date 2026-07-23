export const API_BASE_URL = __API_BASE_URL__;
export const LOG_ENDPOINT = "/api/qc-productivity/log";
export const VERSION = __VERSION__;

export const PAGE_PATHS = {
  qc: ["/v2/returninbound/qc"],
  judgement: ["/v2/returninbound/judgement"],
  rimassreceive: ["/v2/returninbound/rimassreceive"],
};

export const CAPTURE_CONFIGS = {
  qc: [
    {
      path: "/api/apps/process/returninbound/riqc/scan_sheet_id",
      method: "GET",
      action: "start",
      successCondition: (data) => data && data.retcode === 0,
      extractFields: (requestBody, responseData) => ({
        asn: responseData?.data?.list?.[0]?.asn || "",
        return_tn: responseData?.data?.list?.[0]?.return_tn || "",
      }),
    },
    {
      path: "/api/apps/process/returninbound/riqc/complete_qc_task",
      method: "POST",
      action: "end",
      successCondition: (data) => data && data.retcode === 0,
      extractFields: (requestBody, responseData) => ({
        goto_judge: responseData?.data?.goto_judge,
      }),
    },
  ],
  judgement: [
    {
      path: "/api/apps/process/returninbound/judge/scan_sheet_id",
      method: "POST",
      action: "start",
      successCondition: (data) => data && data.retcode === 0,
      extractFields: (requestBody, responseData) => ({
        asn: responseData?.data?.list?.[0]?.inbound_id || "",
        return_tn: responseData?.data?.list?.[0]?.return_tn || "",
      }),
    },
    {
      path: "/api/apps/process/returninbound/judge/confirm_judge",
      method: "POST",
      action: "end",
      successCondition: (data) => data && data.retcode === 0,
      extractFields: (requestBody, responseData) => ({}),
    },
  ],
  rimassreceive: [
    {
      path: "/api/apps/process/returninbound/receiving/scan_sheet_id",
      method: "POST",
      action: "start",
      successCondition: (data) => data && data.retcode === 0,
      extractFields: (requestBody, responseData) => ({
        asn: responseData?.data?.list?.[0]?.inbound_id || "",
        return_tn: responseData?.data?.list?.[0]?.return_tn || "",
      }),
    },
    {
      path: "/api/apps/process/returninbound/receiving/save_received_item",
      method: "POST",
      action: "end",
      successCondition: (data) => data && data.retcode === 0,
      captureCondition: (responseData) => {
        const d = responseData?.data;
        return (
          d &&
          d.is_item_all_received &&
          d.is_sku_all_received &&
          d.is_asn_all_received
        );
      },
      extractFields: (requestBody, responseData) => ({
        device_id: requestBody?.device_id || "",
        inbound_id: requestBody?.inbound_id || "",
        is_item_all_received: responseData?.data?.is_item_all_received || false,
        is_sku_all_received: responseData?.data?.is_sku_all_received || false,
        is_asn_all_received: responseData?.data?.is_asn_all_received || false,
      }),
    },
  ],
};

export const DEBUG = true;
export const EMAIL_CACHE_MS = 5 * 60 * 1000;
export const FLUSH_INTERVAL_MS = 60 * 1000;
export const REQUEST_TIMEOUT_MS = 10000;
export const STATS_SYNC_INTERVAL_MS = 30000;
export const STATS_THROTTLE_MS = 5000;
