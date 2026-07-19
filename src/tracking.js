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
  let widgetSource = fs.readFileSync(widgetPath, "utf8");

  // Bọc widgetSource trong một hàm để gọi sau
  const widgetFn = `function() {\n${widgetSource}\n}`;
  source = source.replace(/__WIDGET_CODE__/g, widgetFn);

  // Chèn PAGE_CONFIG dưới dạng JSON
  const configJson = JSON.stringify(PAGE_CONFIG, null, 2);
  source = source.replace(/__PAGE_CONFIG__/g, configJson);

  return source;
}
