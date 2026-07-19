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

  // Inject widget code – thay thế placeholder __WIDGET_CODE__
  source = source.replace(
    /const widgetCode = __WIDGET_CODE__ \|\| .*?;/s,
    `const widgetCode = ${widgetSource};`,
  );
  // Nếu placeholder không nằm trong biểu thức như trên, có thể dùng:
  // source = source.replace('__WIDGET_CODE__', widgetSource);

  // Inject page config – thay thế placeholder __PAGE_CONFIG__
  const configJson = JSON.stringify(PAGE_CONFIG, null, 2);
  source = source.replace(
    /const PAGE_CONFIG = __PAGE_CONFIG__ \|\| \{[\s\S]*?\};/,
    `const PAGE_CONFIG = ${configJson};`,
  );
  // Nếu muốn đơn giản hơn: source = source.replace('__PAGE_CONFIG__', configJson);

  return source;
}
