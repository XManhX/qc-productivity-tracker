export const PAGE_CONFIG = {
  qc: {
    pathIncludes: "/v2/returninbound/qc",
    actionSelector: ".btn-confirm > button",
    requiredFields: ["scan_value"],
    fields: {
      scan_value: ["sheet_id"],
    },
    urlParam: "sheet_id",
  },
  judgement: {
    pathIncludes: "/v2/returninbound/judgement",
    actionSelector: ".confirm-judged-btn > button",
    requiredFields: ["scan_value"],
    fields: {
      scan_value: ["#rms-judging-input-asnID"],
    },
    urlParam: "id",
  },
  rimassreceive: {
    pathIncludes: "/v2/returninbound/rimassreceive",
    containerSelector: ".ssc-form-item-content",
    actionText: "Save",
    requiredFields: ["device_id", "scan_value"],
    fields: {
      device_id: ["#rms-receiving-input-deviceID"],
      scan_value: ["inbound_id"],
    },
  },
};
