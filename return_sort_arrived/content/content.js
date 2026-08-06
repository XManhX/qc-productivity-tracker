// content/content.js – hoàn chỉnh, an toàn, hiển thị ngay
// --- Helpers ---
function isExtensionContextValid() {
  try {
    return !!(chrome.runtime && chrome.runtime.id);
  } catch (e) {
    return false;
  }
}

function safeStorageGet(keys, callback) {
  if (!isExtensionContextValid()) {
    callback({});
    return;
  }
  chrome.storage.local.get(keys, (result) => {
    if (chrome.runtime.lastError) {
      callback({});
    } else {
      callback(result);
    }
  });
}

function safeGetURL(path) {
  if (!isExtensionContextValid()) return "";
  return chrome.runtime.getURL(path);
}

function safeRuntimeConnect(name) {
  if (!isExtensionContextValid()) return null;
  try {
    return chrome.runtime.connect({ name });
  } catch (e) {
    return null;
  }
}

// --- Keep-Alive ---
let keepAlivePort = null;
let keepAliveTimer = null;
let keepAliveAttempts = 0;
const MAX_KEEP_ALIVE_ATTEMPTS = 5;

function connectKeepAlive() {
  if (!isExtensionContextValid()) {
    keepAliveTimer = setTimeout(connectKeepAlive, 1000);
    return;
  }
  keepAlivePort = safeRuntimeConnect("as-keepalive");
  if (!keepAlivePort) {
    if (keepAliveAttempts < MAX_KEEP_ALIVE_ATTEMPTS) {
      const delay = Math.min(1000 * Math.pow(2, keepAliveAttempts), 30000);
      keepAliveAttempts++;
      keepAliveTimer = setTimeout(connectKeepAlive, delay);
    }
    return;
  }
  // console.log("[Content] Keep-alive connected");
  keepAlivePort.onDisconnect.addListener(() => {
    keepAlivePort = null;
    if (keepAliveAttempts < MAX_KEEP_ALIVE_ATTEMPTS) {
      const delay = Math.min(1000 * Math.pow(2, keepAliveAttempts), 30000);
      keepAliveAttempts++;
      keepAliveTimer = setTimeout(connectKeepAlive, delay);
    }
  });
  keepAliveAttempts = 0;
}

if (document.readyState === "complete") connectKeepAlive();
else window.addEventListener("load", connectKeepAlive);

// --- Main ---
(async () => {
  try {
    // Inject scripts (QR generator có thể inject sớm, không ảnh hưởng)
    const qrGenUrl = safeGetURL("content/qr-generator.js");
    if (qrGenUrl) {
      const script = document.createElement("script");
      script.src = qrGenUrl;
      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
    }

    // Import modules trước khi thiết lập listeners
    const { StateManager } = await import(
      chrome.runtime.getURL("content/stateManager.js")
    );
    const { AudioManager } = await import(
      chrome.runtime.getURL("content/audio.js")
    );
    const { UIManager } = await import(
      chrome.runtime.getURL("content/ui/popup.js")
    );

    // Lấy master data từ storage
    const stored = await new Promise((resolve) =>
      safeStorageGet(["masterData"], resolve),
    );
    const masterData = stored?.masterData || {};

    // Lấy email với fallback an toàn
    let email = "unknown@shopee.com";
    try {
      const storedEmail = localStorage.getItem("useremail");
      if (storedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(storedEmail)) {
        email = storedEmail;
      } else {
        // Fallback từ nội dung trang
        const match = document.body?.innerText.match(
          /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
        );
        if (match) {
          email = match[0];
          localStorage.setItem("useremail", email);
        }
      }
    } catch (e) {
      // Giữ email mặc định
    }

    const stateManager = new StateManager(masterData, email);
    const audioManager = new AudioManager();
    stateManager.audioManager = audioManager;

    // ========== ĐĂNG KÝ LISTENERS TRƯỚC KHI INJECT INTERCEPTOR ==========
    document.addEventListener("as-return-tn-detected", (e) => {
      stateManager.handleDetected(e.detail.sheetId);
    });

    document.addEventListener("as-return-tn-arrived", (e) => {
      stateManager.handleArrived(e.detail.returnTn, e.detail.sheetId);
    });

    document.addEventListener("as-return-tn-error", (e) => {
      stateManager.handleError(
        e.detail.sheetId,
        e.detail.retcode,
        e.detail.message,
      );
    });

    // Inject interceptor chỉ sau khi listener đã sẵn sàng
    const interceptorUrl = safeGetURL("content/interceptor.js");
    if (interceptorUrl) {
      const script = document.createElement("script");
      script.src = interceptorUrl;
      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
    }

    // Khởi tạo UI ngay lập tức
    function initUI() {
      new UIManager(stateManager, audioManager);
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initUI);
    } else {
      initUI();
    }

    // Cập nhật master data khi storage thay đổi
    safeStorageGet(["masterData"], (stored) => {
      if (stored?.masterData) {
        stateManager.updateMasterData(stored.masterData);
      }
    });

    if (isExtensionContextValid()) {
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.masterData)
          stateManager.updateMasterData(changes.masterData.newValue);
      });
    }
  } catch (e) {
    console.error("[Content] Initialization error:", e);
  }
})();