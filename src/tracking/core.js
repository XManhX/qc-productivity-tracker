import {
  PAGE_PATHS,
  API_BASE_URL,
  LOG_ENDPOINT,
  FLUSH_INTERVAL_MS,
  REQUEST_TIMEOUT_MS,
  STATS_SYNC_INTERVAL_MS,
  DEBUG,
} from "./config.js";
import { initInterceptor, destroyInterceptor } from "./api-interceptor.js";
import { buildRecord } from "./record-builder.js";
import { syncStats, incrementLocalStat, getEmail } from "./stats.js";
import { WidgetManager } from "./widget.js";

const log = (...args) => DEBUG && console.log("[QCTracker Core]", ...args);

let currentPageType = null;
let isDestroyed = false;
let flushInterval = null;
let statsInterval = null;
let pendingStart = null; // { startTime, fields }

function sendRecord(record) {
  log("Sending record:", record);
  return new Promise((resolve) => {
    globalThis.GM_xmlhttpRequest({
      method: "POST",
      url: API_BASE_URL + LOG_ENDPOINT,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify(record),
      timeout: REQUEST_TIMEOUT_MS,
      onload: (r) => {
        const success = r.status >= 200 && r.status < 300;
        log(
          "Record send response:",
          r.status,
          success ? "OK" : "Failed",
          r.responseText,
        );
        resolve(success);
      },
      onerror: (e) => {
        log("Record send error:", e);
        resolve(false);
      },
      ontimeout: () => {
        log("Record send timeout");
        resolve(false);
      },
    });
  });
}

function handleCapture(action, extractedFields) {
  if (isDestroyed) return;

  const email = getEmail();
  if (!email) {
    log("No operator email. Cleaning up.");
    cleanup();
    return;
  }
  if (!currentPageType) return;

  log("handleCapture:", action, extractedFields);

  if (action === "start") {
    pendingStart = {
      startTime: new Date().toISOString(),
      fields: { ...extractedFields },
    };
    log("Pending start:", pendingStart);
  } else if (action === "end") {
    if (!pendingStart) {
      log('"end" without pending start – ignored');
      return;
    }

    const endTime = new Date().toISOString();
    const record = buildRecord(
      currentPageType,
      "complete",
      pendingStart.fields,
      extractedFields,
      email,
      pendingStart.startTime,
      endTime,
    );
    pendingStart = null;
    log("Record prepared, sending...");
    sendRecord(record).then((sent) => {
      if (sent) {
        log("Record sent successfully, updating stats");
        const stats = incrementLocalStat(currentPageType);
        WidgetManager.updateStats(stats);
      } else {
        const pending = globalThis.GM_getValue("qc_pending_logs", []);
        pending.push(record);
        globalThis.GM_setValue("qc_pending_logs", pending);
      }
    });
  } else {
    // Xử lý các action phụ (check, update, ...): merge vào pendingStart nếu có
    if (pendingStart) {
      log("Merging action", action, "into pendingStart");
      Object.assign(pendingStart.fields, extractedFields);
    } else {
      log("Action", action, "ignored because no pending start");
    }
  }
}

function flushPendingLogs() {
  const pending = globalThis.GM_getValue("qc_pending_logs", []);
  if (!pending.length) return;
  globalThis.GM_setValue("qc_pending_logs", []);
  (async () => {
    for (const record of pending) {
      try {
        await sendRecord(record);
      } catch (e) {}
    }
  })();
}

function cleanup() {
  log("Cleanup");
  isDestroyed = true;
  destroyInterceptor();
  if (flushInterval) clearInterval(flushInterval);
  if (statsInterval) clearInterval(statsInterval);
  flushInterval = null;
  statsInterval = null;
  WidgetManager.setVisible(false);
  pendingStart = null;
  currentPageType = null;
}

async function initPage() {
  cleanup();
  isDestroyed = false;

  const pathname = location.pathname;
  const pageType = Object.entries(PAGE_PATHS).find(([, paths]) =>
    paths.some((p) => pathname === p || pathname.startsWith(p + "?")),
  )?.[0];

  if (!pageType) {
    log("Not a tracked page, hiding widget");
    WidgetManager.setVisible(false);
    return;
  }
  currentPageType = pageType;
  log("Page type:", pageType);

  const email = getEmail();
  if (!email) {
    log("No operator email found, hiding widget");
    WidgetManager.setVisible(false);
    return;
  }
  log("Operator:", email);

  initInterceptor(pageType, handleCapture);
  WidgetManager.setVisible(true);
  syncStats((stats) => WidgetManager.updateStats(stats));

  flushInterval = setInterval(flushPendingLogs, FLUSH_INTERVAL_MS);
  statsInterval = setInterval(() => {
    syncStats((stats) => WidgetManager.updateStats(stats));
  }, STATS_SYNC_INTERVAL_MS);
}

// Khởi tạo widget manager
WidgetManager.init(
  (key, fallback) => globalThis.GM_getValue(key, fallback),
  (key, value) => globalThis.GM_setValue(key, value),
);

initPage().catch((e) => console.error("[QCTracker] Init error:", e));

// Theo dõi chuyển trang SPA
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    initPage();
  }
}).observe(document, { subtree: true, childList: true });

window.addEventListener("beforeunload", () => {
  flushPendingLogs();
  cleanup();
});
