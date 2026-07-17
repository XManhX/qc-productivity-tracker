import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createTrackerSource } from "../src/tracking.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"),
);

const DIST_DIR = path.join(__dirname, "../public/install");
const OUTPUT_FILE = path.join(DIST_DIR, "qc-productivity-tracker.user.js");

if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

const apiBaseUrl =
  process.env.API_BASE_URL ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

const rawSource = createTrackerSource();
const version = pkg.version || "1.0.0";

const finalSource = rawSource
  .replace(/__VERSION__/g, version)
  .replace(/__API_BASE_URL__/g, apiBaseUrl);

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
