// src/tracking.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PAGE_CONFIG } from "./selectors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createTrackerSource() {
  const scriptPath = path.join(__dirname, "tracker-script.js");
  const widgetPath = path.join(__dirname, "widget.js");

  let source = fs.readFileSync(scriptPath, "utf8");
  const widgetSource = fs.readFileSync(widgetPath, "utf8");

  // Inject widget code
  source = source.replace("// __WIDGET_CODE__", widgetSource);

  // Inject page config
  const configJson = JSON.stringify(PAGE_CONFIG, null, 2);
  source = source.replace(
    /const PAGE_CONFIG = \{\};/,
    `const PAGE_CONFIG = ${configJson};`,
  );

  return source;
}
