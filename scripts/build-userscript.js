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

const version = pkg.version || "1.0.0";

// 1. Read the metadata template from an external file
const headerTemplate = fs.readFileSync(
  path.join(__dirname, "userscript.header.txt"),
  "utf8",
);

// 2. Replace placeholders in the metadata
const metadata = headerTemplate
  .replace(/__VERSION__/g, version)
  .replace(/__API_BASE_URL__/g, apiBaseUrl);

// 3. Create the main script source and replace its placeholders
const trackerSource = createTrackerSource()
  .replace(/__VERSION__/g, version)
  .replace(/__API_BASE_URL__/g, apiBaseUrl);

// 4. Combine metadata and script source and write to file
fs.writeFileSync(OUTPUT_FILE, metadata + "\n" + trackerSource, "utf8");
console.log(`✅ Userscript built successfully at: ${OUTPUT_FILE}`);
