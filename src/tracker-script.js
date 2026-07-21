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
    STATS_SYNC_INTERVAL_MS: 30000,
  };

  const PAGE_CONFIG = __PAGE_CONFIG__ || {};

  // ==================== STATE MANAGEMENT ====================
  const state = {
    pageStartTime: null,
    lastScanValue: null,
    lastUrl: location.href,
    fieldObserver: null,
    initPromise: null,
    flushIntervalId: null,
    statsSyncIntervalId: null,
    isDestroyed: false,
    pendingReinitUrl: null,
    authStatus: null,
    authPromise: null,
    pendingClicks: [],
    currentPageType: null,
    currentEmail: null,
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

  if (typeof WidgetManager !== "undefined" && WidgetManager.init) {
    WidgetManager.init(getStore, setStore);
  } else {
    console.error(
      "[QC Tracker] WidgetManager not found or missing init method",
    );
  }

  // ==================== EMAIL EXTRACTION ====================
  const getEmail = () => {
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
        if (value) return value;
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

  // ==================== DELEGATED CLICK HANDLER ====================
  const matchActionButton = (el, cfg) => {
    let current = el;
    while (current && current !== document.body) {
      if (
        current.matches(
          'button, input[type="submit"], a[role="button"], div[role="button"]',
        )
      ) {
        if (cfg.actionSelector && current.matches(cfg.actionSelector)) {
          return current;
        }
        const text = normalize(cfg.actionText || "").toLowerCase();
        if (text) {
          const elText = normalize(current.textContent).toLowerCase();
          const matchMode = cfg.actionTextMatch || "exact";
          if (
            matchMode === "contains" ? elText.includes(text) : elText === text
          ) {
            return current;
          }
        }
      }
      current = current.parentElement;
    }
    return null;
  };

  document.addEventListener(
    "click",
    (e) => {
      const pageType = state.currentPageType;
      const email = state.currentEmail;
      if (!pageType || !email) return;

      const cfg = PAGE_CONFIG[pageType];
      if (!cfg) return;

      const btn = matchActionButton(e.target, cfg);
      if (!btn) return;

      if (btn.disabled) {
        log("Delegated click: button is disabled, ignored");
        return;
      }

      log(
        "Delegated action button clicked:",
        cfg.actionSelector || cfg.actionText,
      );
      processAction(pageType, email);
    },
    true,
  );

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
    if (!record.scan_value) {
      log("Skipping: missing scan_value");
      return true;
    }

    if (!record.page_start_time) {
      log("Skipping: missing page_start_time");
      return true;
    }

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
    if (CONFIG.DUPLICATE_WINDOW_MS <= 0) return false;

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
  const syncWidgetWithStats = async () => {
    const serverStats = await fetchStatsFromServer();
    if (serverStats) {
      WidgetManager.updateStats(serverStats);
    } else {
      const localStats = getStore(`stats_${todayKey()}`, {
        qc: 0,
        judgement: 0,
        rimassreceive: 0,
        lastUpdated: 0,
      });
      WidgetManager.updateStats(localStats);
    }
  };

  // ==================== AUTHORIZATION ====================
  const checkAuth = async (email) => {
    if (!email || !isValidEmail(email)) {
      return { allowed: false, reason: "invalid_email" };
    }

    const cacheKey = `qc_authz_${email}`;
    const cached = getStore(cacheKey, null);

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
      if (cached?.value) {
        log("Using expired auth cache as fallback");
        return cached.value;
      }
      return { allowed: false, reason: "authz_error" };
    }
  };

  // ==================== AUTH HELPER ====================
  const handlePendingClicks = () => {
    const pending = state.pendingClicks.splice(0);
    pending.forEach(({ pageType, userEmail }) => {
      processAction(pageType, userEmail);
    });
  };

  const ensureAuth = (email) => {
    if (state.authPromise) {
      log("Reusing existing auth promise");
      return state.authPromise;
    }

    state.authPromise = checkAuth(email)
      .then((auth) => {
        state.authStatus = auth;
        state.authPromise = null;
        handlePendingClicks();
        WidgetVisibilityWatcher.applyVisibility();
        return auth;
      })
      .catch((err) => {
        state.authStatus = { allowed: false, reason: "authz_error" };
        state.authPromise = null;
        WidgetVisibilityWatcher.applyVisibility();
        throw err;
      });

    return state.authPromise;
  };

  // ==================== ACTION HANDLER ====================
  const processAction = async (pageType, userEmail) => {
    if (!state.authStatus) {
      log("Auth not ready, queuing click...");
      state.pendingClicks.push({ pageType, userEmail, time: Date.now() });
      ensureAuth(userEmail);
      return;
    }

    if (!state.authStatus.allowed) {
      log("Action blocked: unauthorized", state.authStatus.reason);
      return;
    }

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

      if (pageType === "qc") stats.qc = (stats.qc || 0) + 1;
      else if (pageType === "judgement")
        stats.judgement = (stats.judgement || 0) + 1;
      else if (pageType === "rimassreceive")
        stats.rimassreceive = (stats.rimassreceive || 0) + 1;
      stats.lastUpdated = Date.now();
      setStore(key, stats);

      log("Action completed and recorded successfully");
      await syncWidgetWithStats();
    }
  };

  // ==================== UNIFIED URL MONITOR ====================
  const NavigationMonitor = (() => {
    const callbacks = [];
    let installed = false;

    const notify = () => {
      callbacks.forEach((fn) => {
        try {
          fn();
        } catch (e) {
          warn("Navigation callback error:", e);
        }
      });
    };

    const install = () => {
      if (installed) return;
      installed = true;

      const origPush = history.pushState;
      history.pushState = function (...args) {
        origPush.apply(this, args);
        notify();
      };
      const origReplace = history.replaceState;
      history.replaceState = function (...args) {
        origReplace.apply(this, args);
        notify();
      };
      window.addEventListener("popstate", notify);
      window.addEventListener("hashchange", notify);
    };

    return {
      onNavigate(callback) {
        callbacks.push(callback);
        install(); // safe to call multiple times, installs only once
      },
    };
  })();

  // ==================== WIDGET VISIBILITY WATCHER ====================
  const WidgetVisibilityWatcher = (() => {
    let lastDecision = null;

    const shouldWidgetBeVisible = async () => {
      const pageType = getPageType(location.href);
      if (pageType === "unknown") return false;
      const email = getEmail();
      if (!email) return false;
      const auth = await ensureAuth(email);
      return auth.allowed;
    };

    const applyVisibility = async () => {
      const visible = await shouldWidgetBeVisible();
      const newDecision = visible ? "visible" : "hidden";
      if (newDecision !== lastDecision) {
        lastDecision = newDecision;
        WidgetManager.setVisible(visible);
        if (visible) {
          syncWidgetWithStats();
        }
      }
    };

    // Đăng ký callback để tự động cập nhật khi URL thay đổi
    NavigationMonitor.onNavigate(applyVisibility);

    // Lần đầu tiên
    applyVisibility();

    return { applyVisibility };
  })();

  // ==================== FIELD LISTENERS ====================
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

  // ==================== STORAGE CHANGE LISTENER ====================
  const setupStorageListener = () => {
    if (typeof GM_addValueChangeListener !== "function") {
      warn("GM_addValueChangeListener not available");
      return;
    }

    const statsKey = `stats_${todayKey()}`;
    try {
      GM_addValueChangeListener(statsKey, (name, oldValue, newValue) => {
        log("Storage changed:", name, "updating widget...");
        WidgetManager.updateStats(newValue);
      });
    } catch (e) {
      warn("Failed to setup storage listener:", e);
    }
  };

  // ==================== CLEANUP ====================
  const cleanup = () => {
    if (state.fieldObserver) {
      state.fieldObserver.disconnect();
      state.fieldObserver = null;
    }

    if (state.flushIntervalId) {
      clearInterval(state.flushIntervalId);
      state.flushIntervalId = null;
    }

    if (state.statsSyncIntervalId) {
      clearInterval(state.statsSyncIntervalId);
      state.statsSyncIntervalId = null;
    }

    state.isDestroyed = true;
  };

  // ==================== INITIALIZATION ====================
  const init = async () => {
    if (state.initPromise) {
      log("Init already in progress, scheduling re-init for current URL");
      state.pendingReinitUrl = location.href;
      return state.initPromise;
    }

    state.initPromise = (async () => {
      try {
        log("Starting initialization for:", location.href);
        state.pendingReinitUrl = null;

        cleanup();
        state.isDestroyed = false;

        state.pageStartTime = null;
        state.lastScanValue = null;
        state.authStatus = null;
        state.authPromise = null;
        state.pendingClicks = [];

        const pageType = getPageType(location.href);
        if (pageType === "unknown") {
          state.currentPageType = null;
          state.currentEmail = null;
          log("Unsupported page, initialization skipped");
          return;
        }

        log("Page type detected:", pageType);
        state.currentPageType = pageType;

        const initialId = getIdFromUrl(pageType);
        if (initialId) {
          setPageStartTimeIfNeeded(initialId);
        }

        const email = getEmail();
        if (!email) {
          state.currentEmail = null;
          warn("No email found, initialization aborted");
          return;
        }
        state.currentEmail = email;

        setupFieldListeners(pageType);

        ensureAuth(email)
          .then((auth) => {
            if (!auth.allowed) {
              warn("User not authorized:", auth.reason);
            } else {
              log("Authorization successful");
            }
          })
          .catch((e) => {
            error("Auth failed:", e);
            state.pendingClicks = [];
          });

        await flushPending();

        state.flushIntervalId = setInterval(() => {
          if (!state.isDestroyed) {
            flushPending().catch((e) => warn("Periodic flush failed:", e));
          }
        }, CONFIG.FLUSH_INTERVAL_MS);

        await syncWidgetWithStats();

        state.statsSyncIntervalId = setInterval(async () => {
          if (!state.isDestroyed) {
            await syncWidgetWithStats();
          }
        }, CONFIG.STATS_SYNC_INTERVAL_MS);

        state.fieldObserver = new MutationObserver(() => {
          setupFieldListeners(pageType);
        });

        state.fieldObserver.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        });

        log("Initialization complete for page:", pageType);
      } catch (e) {
        error("Fatal initialization error:", e);
      } finally {
        state.initPromise = null;

        if (state.pendingReinitUrl) {
          const nextUrl = state.pendingReinitUrl;
          state.pendingReinitUrl = null;

          if (nextUrl !== state.lastUrl) {
            state.lastUrl = nextUrl;
          }

          setTimeout(() => init(), 0);
        }
      }
    })();

    return state.initPromise;
  };

  // ==================== BEFOREUNLOAD (single listener) ====================
  window.addEventListener("beforeunload", () => {
    const pending = getStore("qc_pending_logs", []);
    if (pending.length) {
      // Gửi đồng bộ nếu có thể, vì beforeunload không đảm bảo async
      try {
        GM_xmlhttpRequest({
          method: "POST",
          url: CONFIG.API_BASE_URL + CONFIG.LOG_ENDPOINT,
          headers: { "Content-Type": "application/json" },
          data: JSON.stringify(pending),
        });
      } catch (e) {
        // bỏ qua lỗi khi gửi khẩn cấp
      }
      setStore("qc_pending_logs", []);
    }
    cleanup();
  });

  // ==================== MAIN ENTRY POINT ====================
  if (
    typeof GM_xmlhttpRequest === "undefined" ||
    typeof GM_setValue === "undefined"
  ) {
    warn("Required Tampermonkey APIs not available");
    return;
  }

  // Đăng ký init vào NavigationMonitor (thay vì ghi đè history riêng)
  NavigationMonitor.onNavigate(() => {
    if (location.href !== state.lastUrl) {
      state.lastUrl = location.href;
      log("Navigation detected, re-initializing...");
      init();
    }
  });

  setupStorageListener();

  init()
    .then(() => {
      log("Tracker started successfully");
    })
    .catch((e) => {
      error("Failed to start tracker:", e);
    });
})();
