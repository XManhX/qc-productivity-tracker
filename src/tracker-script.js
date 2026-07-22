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
  };

  // ==================== UTILITIES ====================
  const log = (...args) => CONFIG.DEBUG && console.log("[QC Tracker]", ...args);
  const warn = (...args) => console.warn("[QC Tracker]", ...args);
  const error = (...args) => console.error("[QC Tracker]", ...args);
  const normalize = (s) => (s || "").replace(/\s+/g, " ").trim();
  const nowISO = () => new Date().toISOString();
  const todayKey = () => new Date().toISOString().split("T")[0];
  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

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

  // ==================== STORAGE ====================
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
  const deleteStore = (key) => {
    try {
      GM_deleteValue(key);
    } catch (e) {
      warn("Failed to delete store:", key, e);
    }
  };

  // ==================== DAILY CLEANUP ====================
  const cleanOldData = () => {
    if (typeof GM_listValues !== "function") {
      log("GM_listValues not available, skipping cleanup");
      return;
    }
    const today = todayKey();
    try {
      const allKeys = GM_listValues();
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      const keysToDelete = [];
      for (const key of allKeys) {
        if (
          key.startsWith("user_email") ||
          key.startsWith("qc_authz_") ||
          key === "qc_pending_logs" ||
          key === "qc_last_fingerprint" ||
          key === "qc_last_fingerprint_time"
        )
          continue;
        const parts = key.split("_");
        const datePart = parts.find((p) => datePattern.test(p));
        if (datePart && datePart !== today) {
          keysToDelete.push(key);
        }
      }
      const deleteChunk = (startIdx = 0, chunkSize = 50) => {
        const end = Math.min(startIdx + chunkSize, keysToDelete.length);
        for (let i = startIdx; i < end; i++) {
          deleteStore(keysToDelete[i]);
          log("Deleted old key:", keysToDelete[i]);
        }
        if (end < keysToDelete.length) {
          setTimeout(() => deleteChunk(end, chunkSize), 0);
        }
      };
      if (keysToDelete.length) deleteChunk(0);
    } catch (e) {
      warn("Error during daily cleanup:", e);
    }
  };

  // ==================== DEDUP LOGIC ====================
  const DEDUP_KEY_PREFIX = "qc_dedup_";
  const buildDedupKey = (record) => {
    const date = todayKey();
    const normalized = [record.page, record.action, record.scan_value]
      .map((s) => normalize(String(s)).toLowerCase())
      .join("|");
    return DEDUP_KEY_PREFIX + date + "_" + normalized;
  };
  const isRecordedToday = (record) =>
    getStore(buildDedupKey(record), null) !== null;
  const markRecordedToday = (record) => setStore(buildDedupKey(record), true);

  // ==================== HTTP HELPERS ====================
  const gmRequest = (method, url, data = null, headers = {}) =>
    new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        headers: { "Content-Type": "application/json", ...headers },
        data: data ? JSON.stringify(data) : undefined,
        timeout: CONFIG.REQUEST_TIMEOUT_MS,
        onload: (resp) => {
          if (resp.status < 200 || resp.status >= 300)
            return reject(new Error(`HTTP ${resp.status}: ${resp.statusText}`));
          try {
            resolve({
              status: resp.status,
              data: JSON.parse(resp.responseText || "{}"),
            });
          } catch (e) {
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
  // BẢO MẬT: WidgetManager phải dùng textContent (không innerHTML) khi hiển thị dữ liệu từ API.
  const widgetReady =
    typeof WidgetManager !== "undefined" && WidgetManager.init;
  if (widgetReady) {
    WidgetManager.init(getStore, setStore);
  } else {
    console.error("[QC Tracker] WidgetManager not found");
  }

  const widgetSetVisible = (visible) => {
    if (widgetReady && typeof WidgetManager.setVisible === "function") {
      WidgetManager.setVisible(visible);
    }
  };
  const widgetUpdateStats = (stats) => {
    if (widgetReady && typeof WidgetManager.updateStats === "function") {
      WidgetManager.updateStats(stats);
    }
  };

  // ==================== EMAIL (cache tối ưu) ====================
  const getEmail = () => {
    const cached = getStore("user_email", "");
    const ts = getStore("user_email_timestamp", 0);
    if (
      cached &&
      isValidEmail(cached) &&
      Date.now() - ts < CONFIG.EMAIL_CACHE_MS
    ) {
      return cached;
    }

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
          if (typeof obj === "object" && obj !== null)
            val = obj.email || obj.user?.email || obj.userEmail || "";
        } catch {}
        const email = normalize(String(val)).toLowerCase();
        if (email && isValidEmail(email)) {
          setStore("user_email", email);
          setStore("user_email_timestamp", Date.now());
          return email;
        }
      }
    } catch (e) {
      warn("Error reading storage:", e);
    }
    return cached || "";
  };

  // ==================== FIELD EXTRACTION ====================
  const getInputByKeywords = (keywords) => {
    for (const kw of keywords) {
      let input = null;
      if (kw.startsWith("#")) {
        const target = document.querySelector(kw);
        if (target)
          input = target.matches("input,textarea")
            ? target
            : target.querySelector("input,textarea");
      } else {
        const parent = document.querySelector(`[data-for="${kw}"]`);
        if (parent) input = parent.querySelector("input,textarea");
      }
      if (input) {
        const val = normalize(input.value);
        if (val) return val;
      }
    }
    return "";
  };

  const setPageStartTimeIfNeeded = (scanValue) => {
    if (scanValue && scanValue !== state.lastScanValue) {
      state.lastScanValue = scanValue;
      state.pageStartTime = nowISO();
      log("Page start time set:", state.pageStartTime);
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
        setPageStartTimeIfNeeded(idFromUrl);
      }
    } else {
      setPageStartTimeIfNeeded(result.scan_value);
    }
    return result;
  };

  // ==================== API INTERCEPTOR (CHỈ PARSE KHI CẦN + CHỐNG OVERRIDE) ====================
  const cancelAllApiWaiters = () => {
    const waiters = state.apiWaiters;
    while (waiters.length) {
      const w = waiters.pop();
      clearTimeout(w.timeoutId);
      w.reject(new Error("Tracker destroyed or re-initialized"));
    }
  };

  const addApiWaiter = (urlPattern, method, timeoutMs, successCondition) => {
    return new Promise((resolve, reject) => {
      const waiter = {
        urlPattern,
        method,
        resolve,
        reject,
        timeoutId: null,
        successCondition,
      };
      waiter.timeoutId = setTimeout(() => {
        const idx = state.apiWaiters.indexOf(waiter);
        if (idx > -1) state.apiWaiters.splice(idx, 1);
        reject(new Error("API capture timeout"));
      }, timeoutMs);
      state.apiWaiters.push(waiter);
    });
  };

  if (!window.__qcFetchOverridden) {
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : "";
      const method = (
        init?.method || (input instanceof Request ? input.method : "GET")
      ).toUpperCase();

      const interestedWaiters = state.apiWaiters.filter(
        (w) => url.includes(w.urlPattern) && method === w.method,
      );

      const fetchPromise = originalFetch.call(this, input, init);

      if (interestedWaiters.length > 0) {
        fetchPromise
          .then((response) => {
            if (!response.ok) return;
            response
              .clone()
              .json()
              .then((data) => {
                for (let i = interestedWaiters.length - 1; i >= 0; i--) {
                  const w = interestedWaiters[i];
                  clearTimeout(w.timeoutId);
                  if (w.successCondition(data)) w.resolve(data);
                  else w.reject(new Error("API failed condition"));
                  const idx = state.apiWaiters.indexOf(w);
                  if (idx > -1) state.apiWaiters.splice(idx, 1);
                }
              })
              .catch(() => {});
          })
          .catch(() => {});
      }
      return fetchPromise;
    };
    window.__qcFetchOverridden = true;
  }

  if (!window.__qcXHROverridden) {
    const XHRProto = XMLHttpRequest.prototype;
    const originalOpen = XHRProto.open;
    const originalSend = XHRProto.send;
    XHRProto.open = function (method, url, ...rest) {
      this._qcMethod = method.toUpperCase();
      this._qcUrl = url;
      return originalOpen.call(this, method, url, ...rest);
    };
    XHRProto.send = function (body) {
      const xhr = this;
      const originalReady = xhr.onreadystatechange;
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          const interested = state.apiWaiters.filter(
            (w) =>
              xhr._qcUrl &&
              xhr._qcUrl.includes(w.urlPattern) &&
              xhr._qcMethod === w.method,
          );
          if (interested.length > 0) {
            try {
              const data = JSON.parse(xhr.responseText);
              for (let i = interested.length - 1; i >= 0; i--) {
                const w = interested[i];
                clearTimeout(w.timeoutId);
                if (w.successCondition(data)) w.resolve(data);
                else w.reject(new Error("API failed condition"));
                const idx = state.apiWaiters.indexOf(w);
                if (idx > -1) state.apiWaiters.splice(idx, 1);
              }
            } catch (e) {}
          }
        }
        if (originalReady) originalReady.apply(this, arguments);
      };
      return originalSend.call(this, body);
    };
    window.__qcXHROverridden = true;
  }

  // ==================== RECORD MANAGEMENT ====================
  const makeRecord = (pageType, userEmail, endTime = nowISO()) => {
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
      page_end_time: endTime,
    };
  };

  const shouldSkip = (record, pageType) => {
    if (!record.scan_value || !record.page_start_time) return true;
    const required = PAGE_CONFIG[pageType]?.requiredFields || [];
    return required.some((f) => !record[f]);
  };

  const getPendingLogs = () => getStore("qc_pending_logs", []);
  const setPendingLogs = (logs) => setStore("qc_pending_logs", logs);
  const addToPending = (record) => {
    const pending = getPendingLogs();
    pending.push(record);
    setPendingLogs(pending);
  };
  const removeFromPending = (record) => {
    const pending = getPendingLogs();
    const fp = createFingerprint(record);
    const filtered = pending.filter((r) => createFingerprint(r) !== fp);
    if (filtered.length !== pending.length) setPendingLogs(filtered);
  };
  const clearPending = () => setPendingLogs([]);
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

  const sendRecord = async (record) => {
    try {
      await gmRequest(
        "POST",
        CONFIG.API_BASE_URL + CONFIG.LOG_ENDPOINT,
        record,
      );
      return true;
    } catch (e) {
      warn("Send record failed:", e.message);
      return false;
    }
  };

  const flushPending = async () => {
    let pending = getPendingLogs();
    if (!pending.length) return;
    log(`Flushing ${pending.length} pending logs`);

    for (let i = 0; i < pending.length; ) {
      const record = pending[i];
      const sent = await sendRecord(record);
      if (!sent) {
        warn("Flush interrupted, remaining records will be retried later");
        break;
      }
      removeFromPending(record);
      pending = getPendingLogs();
    }
  };

  // ==================== STATS (OPTIMIZED) ====================
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

  const syncWidgetWithStats = async () => {
    if (state.isDestroyed) return;
    if (state.statsPromise) {
      log("Stats fetch already in progress, reusing promise");
      return state.statsPromise;
    }
    if (Date.now() - state.lastStatsSyncTime < CONFIG.STATS_THROTTLE_MS) {
      log("Stats sync throttled, skipping");
      return;
    }
    state.statsPromise = (async () => {
      try {
        const serverStats = await fetchStatsFromServer();
        if (state.isDestroyed) return;
        const fallbackStats = getStore(`stats_${todayKey()}`, {
          qc: 0,
          judgement: 0,
          rimassreceive: 0,
          lastUpdated: 0,
        });
        widgetUpdateStats(serverStats || fallbackStats);
        state.lastStatsSyncTime = Date.now();
      } catch (e) {
        warn("syncWidgetWithStats error:", e);
      } finally {
        state.statsPromise = null;
      }
    })();
    return state.statsPromise;
  };

  // ==================== AUTH ====================
  const checkAuth = async (email) => {
    if (!email || !isValidEmail(email))
      return { allowed: false, reason: "invalid_email" };
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
      warn("Auth error:", e.message);
      return cached?.value || { allowed: false, reason: "authz_error" };
    }
  };

  const ensureAuth = (email) => {
    if (state.authPromise) {
      log("Reusing existing auth promise");
      return state.authPromise;
    }
    state.authPromise = checkAuth(email)
      .then((auth) => {
        const prevAllowed = state.authStatus?.allowed;
        state.authStatus = auth;
        state.authPromise = null;

        if (auth.allowed) {
          widgetSetVisible(true);
          syncWidgetWithStats();
        } else {
          if (auth.reason !== "authz_error") {
            clearPending();
          }
          widgetSetVisible(false);
        }
        if (prevAllowed !== auth.allowed) {
          WidgetVisibilityWatcher.apply();
        }
        return auth;
      })
      .catch((err) => {
        const prevAllowed = state.authStatus?.allowed;
        state.authStatus = { allowed: false, reason: "authz_error" };
        state.authPromise = null;
        widgetSetVisible(false);
        if (prevAllowed !== false) {
          WidgetVisibilityWatcher.apply();
        }
        throw err;
      });
    return state.authPromise;
  };

  // ==================== ACTION PROCESSOR ====================
  const recordAndSend = async (pageType, userEmail, endTimeOverride) => {
    const record = makeRecord(pageType, userEmail, endTimeOverride);
    if (shouldSkip(record, pageType)) return;
    if (isRecordedToday(record)) {
      log("Duplicate in today's dedup set, skipping");
      return;
    }
    markRecordedToday(record);
    addToPending(record);

    const statsKey = `stats_${todayKey()}`;
    const stats = getStore(statsKey, {
      qc: 0,
      judgement: 0,
      rimassreceive: 0,
      lastUpdated: 0,
    });
    if (pageType === "qc") stats.qc++;
    else if (pageType === "judgement") stats.judgement++;
    else if (pageType === "rimassreceive") stats.rimassreceive++;
    stats.lastUpdated = Date.now();
    setStore(statsKey, stats);

    if (state.authStatus === null) {
      ensureAuth(userEmail);
    }
    if (state.authStatus?.allowed) {
      const sent = await sendRecord(record);
      if (sent) {
        removeFromPending(record);
      }
      await syncWidgetWithStats();
    } else {
      log("Record queued, waiting for auth");
    }
  };

  // ==================== BUTTON TRACKING & MARKING ====================
  const matchActionButton = (el, cfg) => {
    let current = el;
    while (current && current !== document.body) {
      if (
        current.matches(
          'button, input[type="submit"], a[role="button"], div[role="button"]',
        )
      ) {
        if (cfg.actionSelector && current.matches(cfg.actionSelector))
          return current;
        const text = normalize(cfg.actionText || "").toLowerCase();
        if (text) {
          const elText = normalize(current.textContent).toLowerCase();
          if (
            cfg.actionTextMatch === "contains"
              ? elText.includes(text)
              : elText === text
          )
            return current;
        }
      }
      current = current.parentElement;
    }
    return null;
  };

  // ==================== BUTTON MARKING (TỐI ƯU MUTATIONOBSERVER) ====================
  let buttonObserver = null;

  const markSingleButton = (el, cfg) => {
    let matched = false;
    if (cfg.actionSelector && el.matches(cfg.actionSelector)) {
      matched = true;
    } else if (cfg.actionText) {
      const text = normalize(cfg.actionText).toLowerCase();
      const elText = normalize(el.textContent).toLowerCase();
      const match =
        cfg.actionTextMatch === "contains"
          ? elText.includes(text)
          : elText === text;
      if (match) matched = true;
    }
    if (matched) {
      el.dataset.qcTracked = "true";
      if (el.disabled) {
        el.dataset.qcDisabled = "true";
        log("✅ Pre-marked button (disabled):", el);
      } else {
        log("✅ Pre-marked button:", el);
      }
    }
  };

  const processNodeForButtons = (node, cfg) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.dataset?.qcTracked !== undefined) return;
    if (
      node.matches(
        'button, input[type="submit"], a[role="button"], div[role="button"]',
      )
    ) {
      if (!node.dataset.qcTracked) {
        markSingleButton(node, cfg);
      }
    }
    const children = node.querySelectorAll(
      'button, input[type="submit"], a[role="button"], div[role="button"]',
    );
    children.forEach((child) => {
      if (!child.dataset.qcTracked) markSingleButton(child, cfg);
    });
  };

  const markAllTrackedButtons = (pageType) => {
    const cfg = PAGE_CONFIG[pageType];
    if (!cfg) return;

    if (buttonObserver) {
      buttonObserver.disconnect();
      buttonObserver = null;
    }

    const candidates = document.querySelectorAll(
      'button, input[type="submit"], a[role="button"], div[role="button"]',
    );
    candidates.forEach((el) => markSingleButton(el, cfg));

    if (!document.querySelector("[data-qc-tracked]")) {
      log("No buttons found yet, setting up MutationObserver for:", pageType);
      buttonObserver = new MutationObserver((mutations) => {
        let found = false;
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            processNodeForButtons(node, cfg);
            if (node.querySelector?.("[data-qc-tracked]")) found = true;
          }
        }
        if (found) {
          log("Buttons found, disconnecting observer");
          buttonObserver.disconnect();
          buttonObserver = null;
        }
      });
      buttonObserver.observe(document.body, { childList: true, subtree: true });
    }
  };

  // ==================== EVENT HANDLERS ====================
  const clickHandler = async (e) => {
    const pageType = state.currentPageType;
    const email = state.currentEmail;
    if (!pageType || !email) return;
    const cfg = PAGE_CONFIG[pageType];
    if (!cfg) return;

    const btn = matchActionButton(e.target, cfg);
    if (!btn || btn.disabled) return;

    btn.dataset.qcTracked = "true";
    log("✅ Action button clicked:", cfg.actionSelector || cfg.actionText, btn);

    if (cfg.apiCapture) {
      try {
        await addApiWaiter(
          cfg.apiCapture.urlPattern,
          cfg.apiCapture.method,
          CONFIG.API_CAPTURE_TIMEOUT_MS,
          cfg.apiCapture.successCondition ||
            ((data) => data && data.retcode === 0),
        );
        log("API capture succeeded, recording action");
      } catch (err) {
        warn("API capture failed:", err.message);
        return;
      }
    }

    recordAndSend(pageType, email).catch((e) =>
      error("recordAndSend error:", e),
    );
  };

  const inputHandler = (e) => {
    const pageType = state.currentPageType;
    if (!pageType) return;
    const cfg = PAGE_CONFIG[pageType];
    if (!cfg?.fields?.scan_value) return;
    const keywords = cfg.fields.scan_value;
    const target = e.target;
    for (const kw of keywords) {
      if (kw.startsWith("#")) {
        if (target.matches(kw) || target.closest(kw)) {
          const val = normalize(target.value);
          if (val) setPageStartTimeIfNeeded(val);
          return;
        }
      } else {
        const container = target.closest(`[data-for="${kw}"]`);
        if (container && target.matches("input,textarea")) {
          const val = normalize(target.value);
          if (val) setPageStartTimeIfNeeded(val);
          return;
        }
      }
    }
  };

  const beforeUnloadHandler = () => {
    const pending = getPendingLogs();
    if (pending.length) {
      const payload = JSON.stringify(pending);
      const url = CONFIG.API_BASE_URL + CONFIG.LOG_ENDPOINT;
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          url,
          new Blob([payload], { type: "application/json" }),
        );
      } else {
        try {
          GM_xmlhttpRequest({
            method: "POST",
            url,
            headers: { "Content-Type": "application/json" },
            data: payload,
          });
        } catch (e) {}
      }
      setPendingLogs([]);
    }
    cleanup();
  };

  const unloadHandler = () => cleanup();

  // ==================== NAVIGATION MONITOR ====================
  const NavigationMonitor = (() => {
    const callbacks = [];
    let installed = false;
    const notify = () =>
      callbacks.forEach((fn) => {
        try {
          fn();
        } catch (e) {
          warn("Nav callback error:", e);
        }
      });
    return {
      onNavigate(callback) {
        callbacks.push(callback);
        if (!installed) {
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
        }
      },
    };
  })();

  // ==================== IMMEDIATE STATE UPDATE ====================
  const updatePageInfo = () => {
    const pageType = getPageType(location.href);
    const email = getEmail();
    state.currentPageType = pageType !== "unknown" ? pageType : null;
    state.currentEmail = email || null;
    log("Page info updated:", state.currentPageType, state.currentEmail);
  };
  NavigationMonitor.onNavigate(updatePageInfo);
  updatePageInfo();

  // ==================== WIDGET VISIBILITY WATCHER (tối ưu) ====================
  const WidgetVisibilityWatcher = (() => {
    let lastDecision = null;
    const apply = async () => {
      let allowed;
      if (state.authStatus) {
        allowed = state.authStatus.allowed;
      } else {
        const email = state.currentEmail;
        if (!email) return;
        const auth = await ensureAuth(email);
        allowed = auth.allowed;
      }
      const decision = allowed ? "visible" : "hidden";
      if (decision !== lastDecision) {
        lastDecision = decision;
        widgetSetVisible(allowed);
        if (allowed) syncWidgetWithStats();
      }
    };
    NavigationMonitor.onNavigate(apply);
    apply();
    return { apply };
  })();

  // ==================== STORAGE LISTENER ====================
  if (typeof GM_addValueChangeListener === "function") {
    const statsKey = `stats_${todayKey()}`;
    try {
      GM_addValueChangeListener(statsKey, (name, oldVal, newVal) => {
        if (newVal !== undefined) {
          log("Stats updated via storage, updating widget");
          widgetUpdateStats(newVal);
        }
      });
    } catch (e) {
      warn("Storage listener error", e);
    }
  }

  // ==================== CLEANUP ====================
  const cleanup = () => {
    if (state.flushIntervalId) clearInterval(state.flushIntervalId);
    if (state.statsSyncIntervalId) clearInterval(state.statsSyncIntervalId);
    state.flushIntervalId = state.statsSyncIntervalId = null;
    cancelAllApiWaiters();
    state.isDestroyed = true;

    if (buttonObserver) {
      buttonObserver.disconnect();
      buttonObserver = null;
    }

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

  // ==================== INIT (DEBOUNCED) ====================
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
    state.initPromise = (async () => {
      try {
        log("Init for:", location.href);
        state.pendingReinitUrl = null;
        cleanup();
        state.isDestroyed = false;
        state.pageStartTime = null;
        state.lastScanValue = null;
        state.authStatus = null;
        state.authPromise = null;

        // Đăng ký lại các listener (lần đầu hoặc sau cleanup)
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

        markAllTrackedButtons(pageType);

        try {
          const auth = await ensureAuth(email);
          if (auth.allowed) {
            log("Authorization successful");
            await flushPending();
          } else {
            warn("User not authorized:", auth.reason);
          }
        } catch (e) {
          error("Auth failed:", e);
        }

        state.flushIntervalId = setInterval(() => {
          if (!state.isDestroyed && state.authStatus?.allowed)
            flushPending().catch(warn);
        }, CONFIG.FLUSH_INTERVAL_MS);

        await syncWidgetWithStats();
        state.statsSyncIntervalId = setInterval(() => {
          if (!state.isDestroyed) syncWidgetWithStats();
        }, CONFIG.STATS_SYNC_INTERVAL_MS);

        log("Init complete for:", pageType);
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

  // ==================== VISUAL HIGHLIGHT ====================
  (function applyStyle(css) {
    if (typeof GM_addStyle !== "undefined") {
      GM_addStyle(css);
      log("Styles applied via GM_addStyle");
      return;
    }
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    log("Styles applied via DOM fallback");
  })(`
    [data-qc-tracked="true"]:not([data-qc-disabled]) {
      outline: 2px solid #EE4D2D !important;
      outline-offset: 2px;
    }
    [data-qc-disabled="true"] {
      outline: 2px solid #999999 !important;
      outline-offset: 2px;
    }
  `);
})();
