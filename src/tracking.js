export function createTrackerSource() {
  const scriptPath = path.join(__dirname, "tracker-script.js");
  const widgetPath = path.join(__dirname, "widget.js");

  let source = fs.readFileSync(scriptPath, "utf8");
  const widgetSource = fs.readFileSync(widgetPath, "utf8");

  // Inject widget code
  source = source.replace("// __WIDGET_CODE__", widgetSource);

  // Replace the __PAGE_CONFIG__ placeholder with the actual config object
  source = source.replace(
    "__PAGE_CONFIG__",
    JSON.stringify(PAGE_CONFIG, null, 2)
  );

  return source;
}