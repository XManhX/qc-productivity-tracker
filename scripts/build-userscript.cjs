// scripts/build-userscript.cjs
const fs = require("fs");
const path = require("path");
const { createTrackerSource } = require("../src/tracking.cjs");

const pkg = require("../package.json");

// Cấu hình các đường dẫn
const DIST_DIR = path.join(__dirname, "../install");
const OUTPUT_FILE = path.join(DIST_DIR, "qc-productivity-tracker.user.js");

// Tạo thư mục public nếu chưa tồn tại
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// Thay thế các biến môi trường cấu hình
const rawSource = createTrackerSource();
const version = pkg.version || "1.0.0";
const apiBaseUrl = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : (process.env.API_BASE_URL || "http://localhost:3000");

const finalSource = rawSource
  .replace(/__VERSION__/g, version)
  .replace(/__API_BASE_URL__/g, apiBaseUrl);

// Thêm Metadata Block cho Tampermonkey/Userscript
const metadata = `// ==UserScript==
// @name         Shopee WMS QC Productivity Tracker
// @namespace    http://tampermonkey.net/
// @version      ${version}
// @description  Track QC, Judgement and Receiving productivity with draggable floating dashboard.
// @author       QC Team
// @match        https://wms.ssc.shopee.vn/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      wms.ssc.shopee.vn
// @connect      *
// @run-at       document-end
// ==/UserScript==

`;

fs.writeFileSync(OUTPUT_FILE, metadata + finalSource, "utf8");
console.log(`✅ Userscript built successfully at: ${OUTPUT_FILE}`);