import {
  PAGE_PATHS,
  API_BASE_URL,
  LOG_ENDPOINT,
  FLUSH_INTERVAL_MS,
  STATS_SYNC_INTERVAL_MS,
} from "./config.js";
import { initInterceptor, destroyInterceptor } from "./api-interceptor.js";
import { buildRecord } from "./record-builder.js";
import { syncStats, incrementLocalStat, getEmail } from "./stats.js";
import { WidgetManager } from "./widget.js";

let currentPageType = null;
let currentEmail = null;
let isDestroyed = false;
let flushInterval = null;
let statsInterval = null;

// Lưu trạng thái start đang chờ
let pendingStart = null; // { startTime, fields }

function sendRecord(record) {
  return new Promise((resolve) => {
    globalThis.GM_xmlhttpRequest({
      method: "POST",
      url: API_BASE_URL + LOG_ENDPOINT,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify(record),
      timeout: 10000,
      onload: (r) => resolve(r.status >= 200 && r.status < 300),
      onerror: () => resolve(false),
      ontimeout: () => resolve(false),
    });
  });
}

function handleCapture(action, extractedFields) {
  if (isDestroyed || !currentPageType || !currentEmail) return;

  if (action === "start") {
    // Lưu lại thời điểm và fields của start, ghi đè nếu có start trước đó chưa end
    pendingStart = {
      startTime: new Date().toISOString(),
      fields: { ...extractedFields }, // clone để tránh reference
    };
    // Có thể cập nhật UI hoặc không
  } else if (action === "end") {
    if (!pendingStart) {
      console.warn(
        '[QCTracker] Received "end" without a pending "start". Ignoring.',
      );
      return;
    }

    const endTime = new Date().toISOString();
    const record = buildRecord(
      currentPageType,
      "complete",
      pendingStart.fields,
      extractedFields,
      currentEmail,
      pendingStart.startTime,
      endTime,
    );

    // Xóa pending start ngay sau khi tạo record
    pendingStart = null;

    // Gửi record
    sendRecord(record).then((sent) => {
      if (sent) {
        const stats = incrementLocalStat(currentPageType);
        WidgetManager.updateStats(stats);
      } else {
        // Lưu vào pending logs để retry
        const pending = globalThis.GM_getValue("qc_pending_logs", []);
        pending.push(record);
        globalThis.GM_setValue("qc_pending_logs", pending);
      }
    });
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
  isDestroyed = true;
  destroyInterceptor();
  if (flushInterval) clearInterval(flushInterval);
  if (statsInterval) clearInterval(statsInterval);
  WidgetManager.setVisible(false);
  pendingStart = null; // hủy start đang chờ
}

async function initPage() {
  cleanup();
  isDestroyed = false;

  const pathname = location.pathname;
  const pageType = Object.entries(PAGE_PATHS).find(([, paths]) =>
    paths.some((p) => pathname === p || pathname.startsWith(p + "?")),
  )?.[0];

  if (!pageType) {
    WidgetManager.setVisible(false);
    return;
  }
  currentPageType = pageType;

  const email = getEmail();
  if (!email) {
    WidgetManager.setVisible(false);
    return;
  }
  currentEmail = email;

  // Khởi tạo interceptor cho trang hiện tại
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
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    initPage();
  }
});
observer.observe(document, { subtree: true, childList: true });

window.addEventListener("beforeunload", () => {
  flushPendingLogs();
  cleanup();
});
