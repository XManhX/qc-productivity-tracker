(function () {
  "use strict";

  // ==================== CONFIGURATION ====================
  const CONFIG = {
    VERSION: "__VERSION__",
    API_BASE_URL: "__API_BASE_URL__",
    AUTH_ENDPOINT: "/api/qc-productivity/authz",
    LOG_ENDPOINT: "/api/qc-productivity/log",
    DEBUG: true,
    AUTH_CACHE_MS: 5 * 60 * 1000,
    AUTH_RETRY_MAX: 2,
    AUTH_RETRY_DELAY_MS: 1000,
    DUPLICATE_WINDOW_MS: 3000,
    EMAIL_CACHE_MS: 5 * 60 * 1000,
    FLUSH_INTERVAL_MS: 60 * 1000,
    INIT_DEBOUNCE_MS: 500,
    REQUEST_TIMEOUT_MS: 10000,
    STATS_SYNC_INTERVAL_MS: 30000, // NEW: cập nhật widget định kỳ
  };

  const PAGE_CONFIG = __PAGE_CONFIG__ || {};

  // ==================== STATE MANAGEMENT ====================
  const state = {
    pageStartTime: null,
    lastScanValue: null,
    lastUrl: location.href,
    observer: null,
    initPromise: null,
    flushIntervalId: null,
    statsSyncIntervalId: null,
    isDestroyed: false,
    pendingReinitUrl: null, // URL cần khởi tạo lại sau khi init hiện tại kết thúc
  };

  // ==================== UTILITY FUNCTIONS ====================
  const log = (...args) => CONFIG.DEBUG && console.log("[QC Tracker]", ...args);
  const warn = (...args) => console.warn("[QC Tracker]", ...args);
  const error = (...args) => console.error("[QC Tracker]", ...args);

  const normalize = (s) => (s || "").replace(/\s+/g, " ").trim();
  const nowISO = () => new Date().toISOString();
  const todayKey = () => new Date().toISOString().split("T")[0];

  const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delay);
    };
  };

  // ==================== PAGE DETECTION ====================
  const getPageType = (href) => {
    const entry = Object.entries(PAGE_CONFIG).find(([, cfg]) =>
      href.includes(cfg.pathIncludes),
    );
    return entry ? entry[0] : "unknown";
  };

  const getIdFromUrl = (pageType) => {
    const cfg = PAGE_CONFIG[pageType];
    if (!cfg?.urlParam) return "";
    const params = new URLSearchParams(window.location.search);
    return params.get(cfg.urlParam) || "";
  };

  // ==================== STORAGE HELPERS ====================
  const getStore = (key, fallback = null) => {
    try {
      const v = GM_getValue(key);
      return v === undefined ? fallback : v;
    } catch {
      return fallback;
    }
  };

  const setStore = (key, val) => {
    try {
      GM_setValue(key, val);
    } catch (e) {
      warn("Failed to set store:", key, e);
    }
  };

  // ==================== HTTP REQUEST ====================
  const gmRequest = (method, url, data = null, headers = {}) =>
    new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        headers: { "Content-Type": "application/json", ...headers },
        data: data ? JSON.stringify(data) : undefined,
        timeout: CONFIG.REQUEST_TIMEOUT_MS,
        onload: (resp) => {
          if (resp.status < 200 || resp.status >= 300) {
            return reject(new Error(`HTTP ${resp.status}: ${resp.statusText}`));
          }
          try {
            const parsed = JSON.parse(resp.responseText || "{}");
            resolve({ status: resp.status, data: parsed });
          } catch (parseError) {
            warn("Failed to parse response:", resp.responseText);
            reject(new Error("Invalid JSON response"));
          }
        },
        onerror: (err) => reject(new Error(`Network error: ${err}`)),
        ontimeout: () => reject(new Error("Request timeout")),
      });
    });

  const retryRequest = async (fn, maxRetries, delayMs) => {
    let lastError;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (e) {
        lastError = e;
        if (i < maxRetries) {
          log(`Retry ${i + 1}/${maxRetries} after ${delayMs}ms`);
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }
    throw lastError;
  };

  // ==================== WIDGET ====================
  // __WIDGET_CODE__

  // ==================== WATCHDOG ====================
  // __WATCHDOG_CODE__

  // ==================== EMAIL EXTRACTION ====================
  const getEmail = () => {
    // Try to get from storage first (fresh data)
    try {
      const keys = [
        "user_email",
        "email",
        "user",
        "userInfo",
        "profile",
        "useremail",
        "userEmail",
      ];
      for (const key of keys) {
        let val = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (!val) continue;

        try {
          const obj = JSON.parse(val);
          if (typeof obj === "object" && obj !== null) {
            val = obj.email || obj.user?.email || obj.userEmail || "";
          }
        } catch {
          // Keep original string value
        }

        const email = normalize(String(val)).toLowerCase();
        if (email && isValidEmail(email)) {
          log("Email found in storage (key:", key, "):", email);
          setStore("user_email", email);
          setStore("user_email_timestamp", Date.now());
          return email;
        }
      }
    } catch (e) {
      warn("Error reading storage:", e);
    }

    // Fallback to cached value with expiry check
    const cachedEmail = getStore("user_email", "");
    const cacheTimestamp = getStore("user_email_timestamp", 0);

    if (
      cachedEmail &&
      isValidEmail(cachedEmail) &&
      Date.now() - cacheTimestamp < CONFIG.EMAIL_CACHE_MS
    ) {
      log("Email from cache:", cachedEmail);
      return cachedEmail;
    }

    warn("No valid email found");
    return "";
  };

  // ==================== FIELD EXTRACTION ====================
  const getInputByKeywords = (keywords = []) => {
    for (const kw of keywords) {
      let input = null;

      if (kw.startsWith("#")) {
        const target = document.querySelector(kw);
        if (target) {
          input =
            target.tagName === "INPUT" || target.tagName === "TEXTAREA"
              ? target
              : target.querySelector("input, textarea");
        }
      } else {
        const parent = document.querySelector(`[data-for="${kw}"]`);
        if (parent) {
          input = parent.querySelector("input, textarea");
        }
      }

      if (input) {
        const value = normalize(input.value);
        if (value) return value; // Return first non-empty value
      }
    }
    return "";
  };

  const setPageStartTimeIfNeeded = (scanValue) => {
    if (scanValue && scanValue !== state.lastScanValue) {
      state.lastScanValue = scanValue;
      state.pageStartTime = nowISO();
      log(
        "Page start time set/reset:",
        state.pageStartTime,
        "for scan:",
        scanValue,
      );
    }
  };

  const collectFields = (pageType) => {
    const cfg = PAGE_CONFIG[pageType];
    if (!cfg) return { device_id: "", scan_value: "" };

    const result = {};
    Object.entries(cfg.fields).forEach(([field, keywords]) => {
      result[field] = getInputByKeywords(keywords);
    });

    // If scan_value not found in inputs, try URL as fallback
    if (!result.scan_value) {
      const idFromUrl = getIdFromUrl(pageType);
      if (idFromUrl) {
        result.scan_value = idFromUrl;
        log(
          `${pageType}: scan_value taken from URL (${cfg.urlParam}):`,
          idFromUrl,
        );
        setPageStartTimeIfNeeded(idFromUrl);
      }
    } else {
      setPageStartTimeIfNeeded(result.scan_value);
    }

    return result;
  };

  // ==================== ACTION BUTTON DETECTION ====================
  const findActionButton = (cfg) => {
    // 1. Ưu tiên selector
    if (cfg.actionSelector) {
      return document.querySelector(cfg.actionSelector);
    }

    // 2. Fallback: tìm theo text, giới hạn trong container nếu có
    const container = cfg.containerSelector
      ? document.querySelector(cfg.containerSelector)
      : document;
    if (!container) return null;

    const text = normalize(cfg.actionText || "").toLowerCase();
    if (!text) return null;

    const buttons = container.querySelectorAll("button");
    return (
      Array.from(buttons).find(
        (btn) => normalize(btn.innerText).toLowerCase() === text,
      ) || null
    );
  };

  // ==================== RECORD MANAGEMENT ====================
  const makeRecord = (pageType, userEmail, page_end_time) => {
    const fields = collectFields(pageType);
    const cfg = PAGE_CONFIG[pageType] || {};

    return {
      version: CONFIG.VERSION,
      page: pageType,
      action: normalize(cfg.actionText || ""),
      operator: userEmail,
      url: location.href,
      device_id: fields.device_id || "",
      scan_value: fields.scan_value || "",
      page_start_time: state.pageStartTime,
      page_end_time: page_end_time,
    };
  };

  const shouldSkip = (record, pageType) => {
    // Must have scan_value
    if (!record.scan_value) {
      log("Skipping: missing scan_value");
      return true;
    }

    // Must have page_start_time
    if (!record.page_start_time) {
      log("Skipping: missing page_start_time");
      return true;
    }

    // Check other required fields
    const required = PAGE_CONFIG[pageType]?.requiredFields || [];
    if (required.some((f) => !record[f])) {
      log("Skipping: missing required fields");
      return true;
    }

    return false;
  };

  const createFingerprint = (record) => {
    return [
      record.page,
      record.action,
      record.operator,
      record.device_id,
      record.scan_value,
    ]
      .map((s) => normalize(String(s)).toLowerCase())
      .join("|");
  };

  const isDuplicate = (fingerprint) => {
    const lastFinger = getStore("qc_last_fingerprint", "");
    const lastTime = getStore("qc_last_fingerprint_time", 0);

    if (
      fingerprint === lastFinger &&
      Date.now() - lastTime < CONFIG.DUPLICATE_WINDOW_MS
    ) {
      log("Duplicate detected within window, skipped");
      return true;
    }
    return false;
  };

  const markFingerprint = (fingerprint) => {
    setStore("qc_last_fingerprint", fingerprint);
    setStore("qc_last_fingerprint_time", Date.now());
  };

  const sendRecord = async (record) => {
    try {
      const resp = await gmRequest(
        "POST",
        CONFIG.API_BASE_URL + CONFIG.LOG_ENDPOINT,
        record,
      );
      log("Log sent successfully, status:", resp.status);
      return true;
    } catch (e) {
      warn("Failed to send log, queuing:", e.message);
      const pending = getStore("qc_pending_logs", []);
      pending.push(record);
      // Limit queue size to prevent memory issues
      if (pending.length > 100) {
        warn("Pending logs queue exceeded 100, removing oldest");
        pending.shift();
      }
      setStore("qc_pending_logs", pending);
      return false;
    }
  };

  const flushPending = async () => {
    const pending = getStore("qc_pending_logs", []);
    if (!pending.length) return;

    log(`Flushing ${pending.length} pending logs`);
    const remaining = [];
    for (const record of pending) {
      try {
        await gmRequest(
          "POST",
          CONFIG.API_BASE_URL + CONFIG.LOG_ENDPOINT,
          record,
        );
        log("Pending log sent successfully");
      } catch {
        remaining.push(record);
      }
    }
    setStore("qc_pending_logs", remaining);

    if (remaining.length) {
      warn(`${remaining.length} logs still pending after flush`);
    }
  };

  // ==================== STATS FROM SERVER ====================
  // NEW: fetch thống kê từ API backend
  const fetchStatsFromServer = async () => {
    const operator = getEmail();
    if (!operator) return null;
    try {
      const resp = await retryRequest(
        () =>
          gmRequest(
            "GET",
            `${CONFIG.API_BASE_URL}${CONFIG.LOG_ENDPOINT}?operator=${encodeURIComponent(operator)}`,
          ),
        CONFIG.AUTH_RETRY_MAX,
        CONFIG.AUTH_RETRY_DELAY_MS,
      );
      if (resp.status === 200 && resp.data) {
        const stats = {
          qc: Number(resp.data.qc) || 0,
          judgement: Number(resp.data.judgement) || 0,
          rimassreceive: Number(resp.data.rimassreceive) || 0,
          lastUpdated: Date.now(),
        };
        // Cập nhật local store để fallback khi offline
        setStore(`stats_${todayKey()}`, stats);
        return stats;
      }
      return null;
    } catch (e) {
      warn("fetchStatsFromServer failed:", e.message);
      return null;
    }
  };

  // ==================== WIDGET UPDATE HELPER ====================
  // NEW: cập nhật widget với dữ liệu từ server hoặc fallback local
  const syncWidgetWithStats = async () => {
    if (typeof updateWidget !== "function") return;
    const serverStats = await fetchStatsFromServer();
    if (serverStats) {
      updateWidget(serverStats);
    } else {
      // Fallback local
      const localStats = getStore(`stats_${todayKey()}`, {
        qc: 0,
        judgement: 0,
        rimassreceive: 0,
        lastUpdated: 0,
      });
      updateWidget(localStats);
    }
  };

  // ==================== ACTION HANDLER ====================
  const handleActionComplete = async (pageType, userEmail) => {
    const page_end_time = nowISO();
    const record = makeRecord(pageType, userEmail, page_end_time);

    if (shouldSkip(record, pageType)) {
      log("Record skipped due to validation");
      return;
    }

    const fingerprint = createFingerprint(record);
    if (isDuplicate(fingerprint)) {
      return;
    }

    markFingerprint(fingerprint);

    const ok = await sendRecord(record);
    if (ok) {
      const key = `stats_${todayKey()}`;
      const stats = getStore(key, {
        qc: 0,
        judgement: 0,
        rimassreceive: 0,
      });

      // Tăng số tương ứng với pageType
      if (pageType === "qc") stats.qc = (stats.qc || 0) + 1;
      else if (pageType === "judgement")
        stats.judgement = (stats.judgement || 0) + 1;
      else if (pageType === "rimassreceive")
        stats.rimassreceive = (stats.rimassreceive || 0) + 1;
      stats.lastUpdated = Date.now();
      setStore(key, stats);

      log("Action completed and recorded successfully");
      // NEW: sau khi gửi thành công, đồng bộ lại widget từ server
      await syncWidgetWithStats();
    }
  };

  // ==================== AUTHORIZATION ====================
  const checkAuth = async (email) => {
    if (!email || !isValidEmail(email)) {
      return { allowed: false, reason: "invalid_email" };
    }

    const cacheKey = `qc_authz_${email}`;
    const cached = getStore(cacheKey, null);

    // Return cached value if still valid
    if (cached?.expireAt && Date.now() < cached.expireAt && cached.value) {
      log("Auth from cache:", cached.value);
      return cached.value;
    }

    try {
      const resp = await retryRequest(
        () =>
          gmRequest("POST", CONFIG.API_BASE_URL + CONFIG.AUTH_ENDPOINT, {
            email,
            page: location.pathname,
          }),
        CONFIG.AUTH_RETRY_MAX,
        CONFIG.AUTH_RETRY_DELAY_MS,
      );

      const value = {
        allowed: Boolean(resp?.data?.allowed),
        reason: resp?.data?.reason || "",
        widget_visible: resp?.data?.widget_visible !== false,
      };

      setStore(cacheKey, {
        expireAt: Date.now() + CONFIG.AUTH_CACHE_MS,
        value,
      });

      return value;
    } catch (e) {
      warn("Authorization failed after retries:", e.message);
      // Fallback to cached value even if expired
      if (cached?.value) {
        log("Using expired auth cache as fallback");
        return cached.value;
      }
      return { allowed: false, reason: "authz_error" };
    }
  };

  // ==================== EVENT LISTENERS SETUP ====================
  const setupButtonListener = (pageType, email) => {
    const cfg = PAGE_CONFIG[pageType];
    if (!cfg) return;

    const btn = findActionButton(cfg);
    if (!btn) return;

    // Nếu đã gắn listener rồi thì bỏ qua
    if (btn.dataset.qcTrackerBound === "1") return;

    const bindClick = () => {
      btn.dataset.qcTrackerBound = "1";
      btn.addEventListener(
        "click",
        () => {
          log("Action button clicked:", cfg.actionSelector || cfg.actionText);
          handleActionComplete(pageType, email);
        },
        true,
      );
      log("Listener bound to:", btn);
    };

    // Nếu đang enable → gắn ngay
    if (!btn.disabled) {
      bindClick();
    } else {
      // Đợi đến khi hết disabled
      log("Button is disabled, observing...");
      const observer = new MutationObserver(() => {
        if (!btn.disabled) {
          observer.disconnect();
          bindClick();
        }
      });
      observer.observe(btn, {
        attributes: true,
        attributeFilter: ["disabled"],
      });
    }
  };

  const setupFieldListeners = (pageType) => {
    const cfg = PAGE_CONFIG[pageType];
    if (!cfg?.fields) return;

    Object.entries(cfg.fields).forEach(([field, keywords]) => {
      for (const kw of keywords) {
        let input = null;

        if (kw.startsWith("#")) {
          const target = document.querySelector(kw);
          if (target) {
            input =
              target.tagName === "INPUT" || target.tagName === "TEXTAREA"
                ? target
                : target.querySelector("input, textarea");
          }
        } else {
          const parent = document.querySelector(`[data-for="${kw}"]`);
          if (parent) {
            input = parent.querySelector("input, textarea");
          }
        }

        if (input && !input.dataset.qcFieldBound) {
          input.dataset.qcFieldBound = "1";
          input.addEventListener("input", () => {
            const value = normalize(input.value);
            if (value && field === "scan_value") {
              setPageStartTimeIfNeeded(value);
            }
          });
        }
      }
    });
  };

  // ==================== SPA NAVIGATION DETECTION ====================
  const setupSPAMonitoring = () => {
    const debouncedInit = debounce(() => {
      if (!state.isDestroyed) {
        init();
      }
    }, CONFIG.INIT_DEBOUNCE_MS);

    const handleUrlChange = () => {
      if (location.href !== state.lastUrl) {
        state.lastUrl = location.href;
        log("SPA navigation detected, re-initializing...");
        debouncedInit();
      }
    };

    // Patch History API
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      handleUrlChange();
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      handleUrlChange();
    };

    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("hashchange", handleUrlChange);
  };

  // ==================== STORAGE CHANGE LISTENER ====================
  const setupStorageListener = () => {
    if (typeof GM_addValueChangeListener !== "function") {
      warn("GM_addValueChangeListener not available");
      return;
    }

    // Listen for stats changes for today only
    const statsKey = `stats_${todayKey()}`;
    try {
      GM_addValueChangeListener(statsKey, (name, oldValue, newValue) => {
        log("Storage changed:", name, "updating widget...");
        if (typeof updateWidget === "function") {
          updateWidget(newValue);
        }
      });
    } catch (e) {
      warn("Failed to setup storage listener:", e);
    }
  };

  // ==================== CLEANUP ====================
  const cleanup = () => {
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }

    if (state.flushIntervalId) {
      clearInterval(state.flushIntervalId);
      state.flushIntervalId = null;
    }

    if (state.statsSyncIntervalId) {
      // NEW
      clearInterval(state.statsSyncIntervalId);
      state.statsSyncIntervalId = null;
    }

    state.isDestroyed = true;
  };

  // ==================== INITIALIZATION ====================
  const init = async () => {
    // Nếu có init đang chạy, lưu URL hiện tại để chạy lại sau
    if (state.initPromise) {
      log("Init already in progress, scheduling re-init for current URL");
      state.pendingReinitUrl = location.href;
      return state.initPromise;
    }

    state.initPromise = (async () => {
      try {
        log("Starting initialization for:", location.href);
        state.pendingReinitUrl = null;

        // Cleanup previous observers
        cleanup();
        state.isDestroyed = false;

        // Reset page-specific state
        state.pageStartTime = null;
        state.lastScanValue = null;

        // Detect page type
        const pageType = getPageType(location.href);
        if (pageType === "unknown") {
          log("Unsupported page, initialization skipped");
          localStorage.setItem("widget_visible", "false");
          return;
        }

        log("Page type detected:", pageType);

        // Set initial scan_value from URL if available
        const initialId = getIdFromUrl(pageType);
        if (initialId) {
          setPageStartTimeIfNeeded(initialId);
        }

        // Get user email
        const email = getEmail();
        if (!email) {
          warn("No email found, initialization aborted");
          localStorage.setItem("widget_visible", "false");
          if (typeof updateWidget === "function")
            updateWidget({
              qc: 0,
              judgement: 0,
              rimassreceive: 0,
              lastUpdated: 0,
            });
          return;
        }

        localStorage.setItem("widget_visible", "true");

        // Check authorization
        const auth = await checkAuth(email);

        localStorage.setItem(
          "widget_visible",
          auth.widget_visible ? "true" : "false",
        );

        if (!auth.allowed) {
          warn("User not authorized:", auth.reason);
          return;
        }

        log("Authorization successful");

        // Flush any pending logs from previous sessions
        await flushPending();

        // Start periodic flush
        state.flushIntervalId = setInterval(() => {
          if (!state.isDestroyed) {
            flushPending().catch((e) => warn("Periodic flush failed:", e));
          }
        }, CONFIG.FLUSH_INTERVAL_MS);

        // NEW: Đồng bộ widget ngay sau khi xác thực thành công
        await syncWidgetWithStats();

        // NEW: Định kỳ đồng bộ widget từ server (mỗi 30s)
        state.statsSyncIntervalId = setInterval(async () => {
          if (!state.isDestroyed) {
            await syncWidgetWithStats();
          }
        }, CONFIG.STATS_SYNC_INTERVAL_MS);

        // Setup button and field listeners
        setupButtonListener(pageType, email);
        setupFieldListeners(pageType);

        // Setup MutationObserver for dynamic content
        state.observer = new MutationObserver(
          debounce(() => {
            setupButtonListener(pageType, email);
            setupFieldListeners(pageType);
          }, 300),
        );

        state.observer.observe(document.body, {
          childList: true,
          subtree: true,
        });

        // Cleanup on page unload
        window.addEventListener("beforeunload", cleanup, { once: true });

        log("Initialization complete for page:", pageType);
      } catch (e) {
        error("Fatal initialization error:", e);
      } finally {
        state.initPromise = null;

        // Sau khi init hiện tại kết thúc, nếu có URL khác đang chờ thì chạy lại
        if (state.pendingReinitUrl) {
          state.lastUrl = nextUrl;
        }

        // Gọi lại init bất đồng bộ (đảm bảo state.initPromise đã = null)
        setTimeout(() => init(), 0);
      }
    })();

    return state.initPromise;
  };

  // ==================== MAIN ENTRY POINT ====================
  if (
    typeof GM_xmlhttpRequest === "undefined" ||
    typeof GM_setValue === "undefined"
  ) {
    warn("Required Tampermonkey APIs not available");
    return;
  }

  // Setup SPA navigation monitoring
  setupSPAMonitoring();

  // Setup storage change listener
  setupStorageListener();

  // Start initialization
  init()
    .then(() => {
      log("Tracker started successfully");
    })
    .catch((e) => {
      error("Failed to start tracker:", e);
    });
})();
