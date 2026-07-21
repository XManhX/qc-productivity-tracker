export const PAGE_CONFIG = {
  qc: {
    pathIncludes: "/v2/returninbound/qc",
    containerSelector: ".btn-confirm",
    actionText: "complete",
    actionTextMatch: "contains",
    requiredFields: ["scan_value"],
    fields: {
      scan_value: ["sheet_id"],
    },
    urlParam: "sheet_id",
  },
  judgement: {
    pathIncludes: "/v2/returninbound/judgement",
    containerSelector: ".confirm-judged-btn",
    actionText: "confirm judged",
    actionTextMatch: "contains",
    requiredFields: ["scan_value"],
    fields: {
      scan_value: ["#rms-judging-input-asnID"],
    },
    urlParam: "id",
  },
  rimassreceive: {
    pathIncludes: "/v2/returninbound/rimassreceive",
    actionSelector: ".ssc-form-item-content button.ssc-btn-type-primary",
    containerSelector: ".ssc-form-item-content",
    actionText: "save",
    actionTextMatch: "contains",
    requiredFields: ["device_id", "scan_value"],
    fields: {
      device_id: ["#rms-receiving-input-deviceID"],
      scan_value: ["inbound_id"],
    },
  },
};
