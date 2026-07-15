// scripts/build-userscript.cjs
const fs = require("fs");
const path = require("path");
const { createTrackerSource } = require("../src/tracking.cjs");

const pkg = require("../package.json");

// 1. ĐỔI ĐƯỜNG DẪN: Trỏ thẳng vào thư mục public để Vercel nhận diện được file tĩnh
const DIST_DIR = path.join(__dirname, "../public/install");
const OUTPUT_FILE = path.join(DIST_DIR, "qc-productivity-tracker.user.js");

// Tạo thư mục public/install nếu chưa tồn tại
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// Thay thế các biến môi trường cấu hình
const rawSource = createTrackerSource();
const version = pkg.version || "1.0.0";

// Tự động lấy URL của dự án (mặc định production nếu không chạy local)
const apiBaseUrl = process.env.VERCEL_URL 
  ? `https://qc-productivity-tracker.vercel.app` // Ưu tiên gán cứng domain chuẩn để tránh bị lỗi sub-domain tạm thời của Vercel
  : (process.env.API_BASE_URL || "http://localhost:3000");

const finalSource = rawSource
  .replace(/__VERSION__/g, version)
  .replace(/__API_BASE_URL__/g, apiBaseUrl);

// 2. BỔ SUNG: Metadata Block với updateURL và downloadURL để tự động cập nhật
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
// @updateURL    ${apiBaseUrl}/install/qc-productivity-tracker.user.js
// @downloadURL  ${apiBaseUrl}/install/qc-productivity-tracker.user.js
// @run-at       document-end
// ==/UserScript==

`;

fs.writeFileSync(OUTPUT_FILE, metadata + finalSource, "utf8");
console.log(`✅ Userscript built successfully at: ${OUTPUT_FILE}`);