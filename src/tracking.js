// src/tracking.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PAGE_CONFIG } from './selectors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createTrackerSource() {
  const scriptPath = path.join(__dirname, 'tracker-script.js');
  let source = fs.readFileSync(scriptPath, 'utf8');

  // Thay thế toàn bộ dòng `const PAGE_CONFIG = {};` bằng `const PAGE_CONFIG = <JSON>;`
  const configJson = JSON.stringify(PAGE_CONFIG, null, 2);
  source = source.replace(
    /const PAGE_CONFIG = \{\};/,
    `const PAGE_CONFIG = ${configJson};`
  );

  return source;
}