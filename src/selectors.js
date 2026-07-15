// src/selectors.js
const PAGE_CONFIG = {
  qc: {
    pathIncludes: "/v2/returninbound/qc",
    actionText: "Complete",
    apiWatchUrl: "/api/apps/process/returninbound/riqc/scan_sheet_id",
    requiredFields: ["scan_value"],
    fields: {
      scan_value: ["sheet_id"]
    },
  },
  judgement: {
    pathIncludes: "/v2/returninbound/judgement",
    actionText: "Confirm Judged",
    apiWatchUrl: "/api/apps/process/returninbound/judge/scan_sheet_id",
    requiredFields: ["scan_value"],
    fields: {
      scan_value: ["scanInput"]
    },
  },
  rimassreceive: {
    pathIncludes: "/v2/returninbound/rimassreceive",
    actionText: "Confirm Received",
    apiWatchUrl: "/api/apps/process/returninbound/receiving/scan_sheet_id",
    requiredFields: ["device_id", "scan_value"],
    fields: {
      device_id: ["#rms-receiving-input-deviceID"],
      scan_value: ["inbound_id"]
    },
  },
};

module.exports = { PAGE_CONFIG };