const PAGE_CONFIG = {
  qc: {
    pathIncludes: "/v2/returninbound/qc",
    actionText: "Complete",
    requiredFields: ["asn", "return_tn", "order_sn"],
    fields: {
      asn: ["asn"],
      return_tn: ["return tn", "return_tn", "returnno", "return no"],
      order_sn: ["order sn", "order_sn", "ordersn"],
    },
  },
  judgement: {
    pathIncludes: "/v2/returninbound/judgement",
    actionText: "Confirm Judged",
    requiredFields: ["asn", "return_tn", "order_sn", "lmtn", "uid"],
    fields: {
      asn: ["asn"],
      return_tn: ["return tn", "return_tn", "returnno", "return no"],
      order_sn: ["order sn", "order_sn", "ordersn"],
      lmtn: ["lmtn"],
      uid: ["uid"],
    },
  },
  rimassreceive: {
    pathIncludes: "/v2/returninbound/rimassreceive",
    actionText: "Confirm Received",
    requiredFields: [
      "device_id",
      "asn",
      "return_tn",
      "order_sn",
      "lmtn",
      "uid",
    ],
    fields: {
      device_id: ["device id", "device_id", "deviceid"],
      asn: ["asn"],
      return_tn: ["return tn", "return_tn", "returnno", "return no"],
      order_sn: ["order sn", "order_sn", "ordersn"],
      lmtn: ["lmtn"],
      uid: ["uid"],
    },
  },
};
module.exports = { PAGE_CONFIG };
