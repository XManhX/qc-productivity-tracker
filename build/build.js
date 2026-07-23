import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"),
);

const API_BASE_URL =
  process.env.API_BASE_URL || "https://qc-productivity-tracker.vercel.app";
const VERSION = pkg.version;

const header = fs
  .readFileSync(path.join(__dirname, "userscript.header.txt"), "utf8")
  .replace(/__VERSION__/g, VERSION)
  .replace(/__API_BASE_URL__/g, API_BASE_URL);

async function build() {
  const result = await esbuild.build({
    entryPoints: ["src/tracking/core.js"],
    bundle: true,
    format: "iife",
    globalName: "QCTracker",
    write: false,
    platform: "browser",
    define: {
      __VERSION__: JSON.stringify(VERSION),
      __API_BASE_URL__: JSON.stringify(API_BASE_URL),
    },
  });

  const bundleCode = result.outputFiles[0].text;
  const finalCode = header + "\n" + `(function() {\n${bundleCode}\n})();`;

  const outDir = path.join(__dirname, "../public/install");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "qc-productivity-tracker.user.js");
  fs.writeFileSync(outFile, finalCode, "utf8");
  console.log(`✅ Built userscript: ${outFile}`);
  console.log(`   Version: ${VERSION}`);
  console.log(`   API Base URL: ${API_BASE_URL}`);
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
