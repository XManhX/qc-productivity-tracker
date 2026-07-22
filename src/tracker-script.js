(function () {
  "use strict";

  // ==================== CONFIGURATION ====================
  const CONFIG = {
    VERSION: "__VERSION__",
    API_BASE_URL: "__API_BASE_URL__",
    AUTH_ENDPOINT: "/api/qc-productivity/authz",
    LOG_ENDPOINT: "/api/qc-productivity/log",
    DEBUG: false,
    AUTH_CACHE_MS: 5 * 60 * 1000,
    AUTH_RETRY_MAX: 2,
    AUTH_RETRY_DELAY_MS: 1000,
    EMAIL_CACHE_MS: 5 * 60 * 1000,
    FLUSH_INTERVAL_MS: 60 * 1000,
    INIT_DEBOUNCE_MS: 500,
    REQUEST_TIMEOUT_MS: 10000,
    STATS_SYNC_INTERVAL_MS: 30000,
    API_CAPTURE_TIMEOUT_MS: 15000,
    STATS_THROTTLE_MS: 5000,
    BUTTON_RESCAN_INTERVAL_MS: 2000, // quét lại nút mỗi 2 giây
  };

  // ==================== PAGE CONFIG ====================
  const PAGE_CONFIG = __PAGE_CONFIG__ || {};

  // ==================== STATE ====================
  const state = {
    pageStartTime: null,
    lastScanValue: null,
    lastUrl: location.href,
    initPromise: null,
    flushIntervalId: null,
    statsSyncIntervalId: null,
    buttonRescanIntervalId: null, // mới
    isDestroyed: false,
    pendingReinitUrl: null,
    authStatus: null,
    authPromise: null,
    currentPageType: null,
    currentEmail: null,
    apiWaiters: [],
    statsPromise: null,
    lastStatsSyncTime: 0,
    _listeners: {
      click: null,
      input: null,
      beforeunload: null,
      unload: null,
    },
    _sendingFingerprints: new Set(),
    initGeneration: 0,
  };

  // ... (các phần utilities, storage, dedup, http, widget, email, field extraction, api interceptor, record management, stats, auth, action processor, button tracking & marking giữ nguyên như bản trước, nhưng tôi sẽ viết gọn lại để tránh lặp) ...

  // ==================== BUTTON TRACKING & MARKING (CẬP NHẬT) ====================
  let buttonObserver = null;

  const markSingleButton = (el, cfg) => {
    let matched = false;
    if (cfg.actionSelector && el.matches(cfg.actionSelector)) matched = true;
    else if (cfg.actionText) {
      const text = normalize(cfg.actionText).toLowerCase();
      const elText = normalize(el.textContent).toLowerCase();
      matched =
        cfg.actionTextMatch === "contains"
          ? elText.includes(text)
          : elText === text;
    }
    if (matched) {
      el.dataset.qcTracked = "true";
      if (el.disabled) el.dataset.qcDisabled = "true";
    }
  };

  const processNodeForButtons = (node, cfg) => {
    if (
      node.nodeType !== Node.ELEMENT_NODE ||
      node.dataset?.qcTracked !== undefined
    )
      return;
    if (
      node.matches(
        'button, input[type="submit"], a[role="button"], div[role="button"]',
      )
    ) {
      if (!node.dataset.qcTracked) markSingleButton(node, cfg);
    }
    node
      .querySelectorAll(
        'button, input[type="submit"], a[role="button"], div[role="button"]',
      )
      .forEach((child) => {
        if (!child.dataset.qcTracked) markSingleButton(child, cfg);
      });
  };

  const markAllTrackedButtons = (pageType) => {
    const cfg = PAGE_CONFIG[pageType];
    if (!cfg) return;

    // Dọn observer cũ nếu có
    if (buttonObserver) {
      buttonObserver.disconnect();
      buttonObserver = null;
    }

    // Đánh dấu tất cả nút hiện tại
    const candidates = document.querySelectorAll(
      'button, input[type="submit"], a[role="button"], div[role="button"]',
    );
    candidates.forEach((el) => markSingleButton(el, cfg));

    // Tạo observer mới, KHÔNG tự disconnect
    buttonObserver = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        for (const node of mut.addedNodes) {
          processNodeForButtons(node, cfg);
        }
      }
    });
    buttonObserver.observe(document.body, { childList: true, subtree: true });
    log("Button observer started for page:", pageType);
  };

  // ==================== EVENT HANDLERS ====================
  // ... (clickHandler, inputHandler, beforeUnloadHandler, unloadHandler giữ nguyên) ...

  // ==================== NAVIGATION MONITOR ====================
  // ... (giữ nguyên) ...

  // ==================== WIDGET VISIBILITY WATCHER ====================
  // ... (giữ nguyên) ...

  // ==================== STORAGE LISTENER ====================
  // ... (giữ nguyên) ...

  // ==================== CLEANUP (CẬP NHẬT) ====================
  const cleanup = () => {
    if (state.flushIntervalId) clearInterval(state.flushIntervalId);
    if (state.statsSyncIntervalId) clearInterval(state.statsSyncIntervalId);
    if (state.buttonRescanIntervalId)
      clearInterval(state.buttonRescanIntervalId);
    state.flushIntervalId =
      state.statsSyncIntervalId =
      state.buttonRescanIntervalId =
        null;
    cancelAllApiWaiters();
    state._sendingFingerprints.clear();
    state.isDestroyed = true;

    if (buttonObserver) {
      buttonObserver.disconnect();
      buttonObserver = null;
    }

    widgetSetVisible(false);

    if (state._listeners.click) {
      document.removeEventListener("click", state._listeners.click, true);
      state._listeners.click = null;
    }
    if (state._listeners.input) {
      document.removeEventListener("input", state._listeners.input, true);
      state._listeners.input = null;
    }
    if (state._listeners.beforeunload) {
      window.removeEventListener("beforeunload", state._listeners.beforeunload);
      state._listeners.beforeunload = null;
    }
    if (state._listeners.unload) {
      window.removeEventListener("unload", state._listeners.unload);
      state._listeners.unload = null;
    }
  };

  // ==================== REFRESH PAGE STATE ====================
  // ... (giữ nguyên) ...

  // ==================== VISUAL HIGHLIGHT ====================
  const QC_STYLE_ID = "qc-tracker-styles";
  const QC_STYLE_CONTENT = `
    [data-qc-tracked="true"]:not([data-qc-disabled]) {
      outline: 2px solid #EE4D2D !important;
      outline-offset: 2px;
    }
    [data-qc-disabled="true"] {
      outline: 2px solid #999999 !important;
      outline-offset: 2px;
    }
  `;

  function applyStyles() {
    if (typeof GM_addStyle !== "undefined") {
      GM_addStyle(QC_STYLE_CONTENT);
      return;
    }
    // Fallback DOM style, but also observe head to re-apply if removed
    const ensureStyleElement = () => {
      if (!document.getElementById(QC_STYLE_ID)) {
        const styleEl = document.createElement("style");
        styleEl.id = QC_STYLE_ID;
        styleEl.textContent = QC_STYLE_CONTENT;
        document.head.appendChild(styleEl);
        log("Styles applied via DOM fallback");
      }
    };
    ensureStyleElement();
    // Dùng MutationObserver trên head để chống React xóa style
    const headObserver = new MutationObserver(() => ensureStyleElement());
    headObserver.observe(document.head, { childList: true });
    // Lưu lại để cleanup (thêm vào state nếu cần, nhưng ở đây ta có thể lưu vào biến cục bộ)
    // Vì script chỉ chạy một lần, ta có thể không cần cleanup observer này.
  }

  // Áp dụng style ngay từ đầu
  applyStyles();

  // ==================== INIT (CẬP NHẬT) ====================
  let debounceTimer = null;
  const debouncedInit = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(init, CONFIG.INIT_DEBOUNCE_MS);
  };

  const init = async () => {
    if (state.initPromise) {
      state.pendingReinitUrl = location.href;
      return state.initPromise;
    }
    const generation = ++state.initGeneration;
    state.initPromise = (async () => {
      try {
        log("Init for:", location.href, "generation:", generation);
        state.pendingReinitUrl = null;
        cleanup();
        state.isDestroyed = false;
        state.pageStartTime = null;
        state.lastScanValue = null;
        state.authStatus = null;
        state.authPromise = null;

        // Đảm bảo style tồn tại
        applyStyles();

        document.addEventListener("click", clickHandler, true);
        document.addEventListener("input", inputHandler, true);
        window.addEventListener("beforeunload", beforeUnloadHandler);
        window.addEventListener("unload", unloadHandler);
        state._listeners.click = clickHandler;
        state._listeners.input = inputHandler;
        state._listeners.beforeunload = beforeUnloadHandler;
        state._listeners.unload = unloadHandler;

        cleanOldData();

        const pageType = state.currentPageType || getPageType(location.href);
        if (pageType === "unknown") {
          state.currentPageType = null;
          state.currentEmail = null;
          widgetSetVisible(false);
          return;
        }
        state.currentPageType = pageType;

        const email = state.currentEmail || getEmail();
        if (!email) {
          state.currentEmail = null;
          warn("No email found");
          return;
        }
        state.currentEmail = email;

        refreshPageState();
        markAllTrackedButtons(pageType);

        // Bắt đầu quét định kỳ để đánh dấu nút (phòng trường hợp observer bỏ sót)
        state.buttonRescanIntervalId = setInterval(() => {
          if (!state.isDestroyed && state.currentPageType) {
            const cfg = PAGE_CONFIG[state.currentPageType];
            if (cfg) {
              const candidates = document.querySelectorAll(
                'button, input[type="submit"], a[role="button"], div[role="button"]',
              );
              candidates.forEach((el) => markSingleButton(el, cfg));
            }
          }
        }, CONFIG.BUTTON_RESCAN_INTERVAL_MS);

        try {
          const auth = await ensureAuth(email, generation);
          if (generation !== state.initGeneration) return;
          if (auth.allowed) {
            log("Authorization successful");
            await flushPending(generation);
          } else {
            warn("User not authorized:", auth.reason);
          }
        } catch (e) {
          if (generation !== state.initGeneration) return;
          error("Auth failed:", e);
        }

        if (generation !== state.initGeneration) return;

        state.flushIntervalId = setInterval(() => {
          if (!state.isDestroyed && state.authStatus?.allowed) {
            flushPending(state.initGeneration).catch(warn);
          }
        }, CONFIG.FLUSH_INTERVAL_MS);

        await syncWidgetWithStats(generation);
        if (generation !== state.initGeneration) return;

        state.statsSyncIntervalId = setInterval(() => {
          if (!state.isDestroyed) syncWidgetWithStats(state.initGeneration);
        }, CONFIG.STATS_SYNC_INTERVAL_MS);

        log("Init complete for:", pageType, "generation:", generation);
      } catch (e) {
        error("Fatal init error:", e);
      } finally {
        state.initPromise = null;
        if (state.pendingReinitUrl) {
          const nextUrl = state.pendingReinitUrl;
          state.pendingReinitUrl = null;
          if (nextUrl !== state.lastUrl) state.lastUrl = nextUrl;
          setTimeout(init, 0);
        }
      }
    })();
    return state.initPromise;
  };

  NavigationMonitor.onNavigate(() => {
    if (location.href !== state.lastUrl) {
      state.lastUrl = location.href;
      log("Navigation detected, scheduling re-init");
      debouncedInit();
    }
  });

  init()
    .then(() => log("Tracker started"))
    .catch((e) => error("Startup error:", e));
})();
