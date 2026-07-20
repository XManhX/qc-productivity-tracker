import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PAGE_CONFIG } from "./page-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createTrackerSource() {
  const scriptPath = path.join(__dirname, "tracker-script.js");
  const widgetPath = path.join(__dirname, "widget.js");
  const watchdogPath = path.join(__dirname, "watchdog.js");

  let source = fs.readFileSync(scriptPath, "utf8");
  const widgetSource = fs.readFileSync(widgetPath, "utf8");
  const watchdogSource = fs.readFileSync(watchdogPath, "utf8");

  // Inject widget code
  source = source.replace("// __WIDGET_CODE__", widgetSource);

  source = source.replace("// __WATCHDOG_CODE__", watchdogSource);

  // Replace __PAGE_CONFIG__ with actual config object
  source = source.replace(
    "__PAGE_CONFIG__",
    JSON.stringify(PAGE_CONFIG, null, 2)
  );

  return source;
}