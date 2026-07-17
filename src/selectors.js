export const PAGE_CONFIG = {
  qc: {
    pathIncludes: "/v2/returninbound/qc",
    actionText: "Complete",
    requiredFields: ["scan_value"],
    fields: {
      scan_value: ["sheet_id"],
    },
    // Thêm dòng này: khai báo tham số URL để lấy ID
    urlParam: "sheet_id", // <-- THÊM DÒNG NÀY
  },
  judgement: {
    pathIncludes: "/v2/returninbound/judgement",
    actionText: "Confirm Judged",
    requiredFields: ["scan_value"],
    fields: {
      scan_value: ["scanInput"],
    },
    urlParam: "id", // <-- ĐÃ CÓ SẴN
  },
  rimassreceive: {
    pathIncludes: "/v2/returninbound/rimassreceive",
    actionText: "Save",
    requiredFields: ["device_id", "scan_value"],
    fields: {
      device_id: ["#rms-receiving-input-deviceID"],
      scan_value: ["inbound_id"],
    },
    // Receive không có URL param
  },
};
