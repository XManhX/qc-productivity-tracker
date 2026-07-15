const fs = require("fs");
const path = require("path");
const { createTrackerSource } = require("../src/tracking");

const VERSION = process.env.npm_package_version || "1.0.0";
const API_BASE_URL =
  process.env.API_BASE_URL || "https://your-api.company-domain.com";
const HOST_BASE_URL =
  process.env.HOST_BASE_URL || "https://tm-qc-tools.company-domain.com";
const API_HOST = new URL(API_BASE_URL).host;

const userScriptHeader = `// ==UserScript==
// @name QC Productivity Tracker
// @namespace sea-qc-tools
// @version ${VERSION}
// @description Track QC productivity actions on WMS return inbound pages
// @match https://wms.ssc.shopee.vn/v2/returninbound/qc*
// @match https://wms.ssc.shopee.vn/v2/returninbound/judgement*
// @match https://wms.ssc.shopee.vn/v2/returninbound/rimassreceive*
// @grant GM_getValue
// @grant GM_setValue
// @grant GM_xmlhttpRequest
// @grant GM_notification
// @connect ${API_HOST}
// @downloadURL ${HOST_BASE_URL}/tracker.user.js
// @updateURL ${HOST_BASE_URL}/tracker.meta.js
// ==/UserScript==

`;

const metaScript = `// ==UserScript==
// @name QC Productivity Tracker
// @namespace sea-qc-tools
// @version ${VERSION}
// @description Track QC productivity actions on WMS return inbound pages
// @match https://wms.ssc.shopee.vn/v2/returninbound/qc*
// @match https://wms.ssc.shopee.vn/v2/returninbound/judgement*
// @match https://wms.ssc.shopee.vn/v2/returninbound/rimassreceive*
// @grant GM_getValue
// @grant GM_setValue
// @grant GM_xmlhttpRequest
// @grant GM_notification
// @connect ${API_HOST}
// @downloadURL ${HOST_BASE_URL}/tracker.user.js
// @updateURL ${HOST_BASE_URL}/tracker.meta.js
// ==/UserScript==
`;

function build() {
  const publicDir = path.resolve(__dirname, "../public");
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const source = createTrackerSource()
    .replace(/__VERSION__/g, VERSION)
    .replace(/__API_BASE_URL__/g, API_BASE_URL);

  fs.writeFileSync(
    path.join(publicDir, "tracker.user.js"),
    userScriptHeader + source,
    "utf8",
  );
  fs.writeFileSync(path.join(publicDir, "tracker.meta.js"), metaScript, "utf8");

  console.log("✅ Build completed");
  console.log("VERSION:", VERSION);
  console.log("API_BASE_URL:", API_BASE_URL);
  console.log("HOST_BASE_URL:", HOST_BASE_URL);
}

build();
