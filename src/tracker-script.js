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
    EMAIL_CACHE_MS: 5 * 60 * 1000,
    FLUSH_INTERVAL_MS: 60 * 1000,
    INIT_DEBOUNCE_MS: 500, // dùng để debounce init
    REQUEST_TIMEOUT_MS: 10000,
    STATS_SYNC_INTERVAL_MS: 30000,
    API_CAPTURE_TIMEOUT_MS: 15000,
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
    // thêm để quản lý apiWaiters tập trung
    apiWaiters: [],
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
  /**
   * Xoá toàn bộ key của ngày cũ để giảm tải bộ nhớ.
   * Chừa lại các key không có tiền tố ngày (như user_email).
   * Cải tiến: kiểm tra GM_listValues tồn tại, xóa theo chunk.
   */
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
      // Xoá theo chunk để không chặn main thread
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

  // ==================== DEDUP LOGIC (No Duplicate per Day) ====================
  const DEDUP_KEY_PREFIX = "qc_dedup_";

  const buildDedupKey = (record) => {
    const date = todayKey();
    const normalized = [record.page, record.action, record.scan_value]
      .map((s) => normalize(String(s)).toLowerCase())
      .join("|");
    return DEDUP_KEY_PREFIX + date + "_" + normalized;
  };

  const isRecordedToday = (record) => {
    const key = buildDedupKey(record);
    return getStore(key, null) !== null;
  };

  const markRecordedToday = (record) => {
    const key = buildDedupKey(record);
    setStore(key, true);
  };

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
  // LƯU Ý BẢO MẬT: WidgetManager nên dùng textContent, không innerHTML với dữ liệu API.

  if (typeof WidgetManager !== "undefined" && WidgetManager.init) {
    WidgetManager.init(getStore, setStore);
  } else {
    console.error("[QC Tracker] WidgetManager not found");
  }

  // ==================== EMAIL ====================
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
    const cached = getStore("user_email", "");
    const ts = getStore("user_email_timestamp", 0);
    if (
      cached &&
      isValidEmail(cached) &&
      Date.now() - ts < CONFIG.EMAIL_CACHE_MS
    )
      return cached;
    return "";
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

  // ==================== API INTERCEPTOR & WAITER ====================
  // Cải tiến: apiWaiters nằm trong state, có hàm hủy khi cleanup.

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
      const timeoutId = setTimeout(() => {
        const idx = state.apiWaiters.indexOf(waiter);
        if (idx > -1) state.apiWaiters.splice(idx, 1);
        reject(new Error("API capture timeout"));
      }, timeoutMs);
      const waiter = {
        urlPattern,
        method,
        resolve,
        reject,
        timeoutId,
        successCondition,
      };
      state.apiWaiters.push(waiter);
    });
  };

  // Override fetch
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
    const fetchPromise = originalFetch.call(this, input, init);
    fetchPromise
      .then((response) => {
        if (!response.ok) return;
        response
          .clone()
          .json()
          .then((data) => {
            const waiters = state.apiWaiters;
            for (let i = waiters.length - 1; i >= 0; i--) {
              const w = waiters[i];
              if (url.includes(w.urlPattern) && method === w.method) {
                clearTimeout(w.timeoutId);
                if (w.successCondition(data)) {
                  w.resolve(data);
                } else {
                  w.reject(new Error("API failed condition"));
                }
                waiters.splice(i, 1);
              }
            }
          })
          .catch(() => {});
      })
      .catch(() => {});
    return fetchPromise;
  };

  // Override XMLHttpRequest
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
        try {
          const data = JSON.parse(xhr.responseText);
          const waiters = state.apiWaiters;
          for (let i = waiters.length - 1; i >= 0; i--) {
            const w = waiters[i];
            if (
              xhr._qcUrl &&
              xhr._qcUrl.includes(w.urlPattern) &&
              xhr._qcMethod === w.method
            ) {
              clearTimeout(w.timeoutId);
              if (w.successCondition(data)) {
                w.resolve(data);
              } else {
                w.reject(new Error("API failed condition"));
              }
              waiters.splice(i, 1);
            }
          }
        } catch (e) {}
      }
      if (originalReady) originalReady.apply(this, arguments);
    };
    return originalSend.call(this, body);
  };

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
    if (!record.scan_value || !record.page_start_time) {
      log("Skipping: missing scan_value or page_start_time");
      return true;
    }
    const required = PAGE_CONFIG[pageType]?.requiredFields || [];
    if (required.some((f) => !record[f])) return true;
    return false;
  };

  // ---------- PENDING LOGS ----------
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
      removeFromPending(record);
      return true;
    } catch (e) {
      warn("Send record failed, queued:", e.message);
      return false;
    }
  };

  const flushPending = async () => {
    const pending = getPendingLogs();
    if (!pending.length) return;
    log(`Flushing ${pending.length} pending logs`);
    for (const record of pending.slice()) {
      await sendRecord(record);
    }
  };

  // ==================== STATS ====================
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
    const serverStats = await fetchStatsFromServer();
    WidgetManager.updateStats(
      serverStats ||
        getStore(`stats_${todayKey()}`, {
          qc: 0,
          judgement: 0,
          rimassreceive: 0,
          lastUpdated: 0,
        }),
    );
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
          flushPending();
          WidgetManager.setVisible(true);
          syncWidgetWithStats();
        } else {
          clearPending();
          WidgetManager.setVisible(false);
        }
        if (prevAllowed !== auth.allowed)
          WidgetVisibilityWatcher.applyVisibility();
        return auth;
      })
      .catch((err) => {
        state.authStatus = { allowed: false, reason: "authz_error" };
        state.authPromise = null;
        clearPending();
        WidgetManager.setVisible(false);
        WidgetVisibilityWatcher.applyVisibility();
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

    if (state.authStatus?.allowed) {
      await sendRecord(record);
      await syncWidgetWithStats();
    } else if (!state.authStatus) {
      ensureAuth(userEmail);
    }
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

  document.addEventListener(
    "click",
    async (e) => {
      const pageType = state.currentPageType;
      const email = state.currentEmail;
      if (!pageType || !email) return;
      const cfg = PAGE_CONFIG[pageType];
      if (!cfg) return;

      const btn = matchActionButton(e.target, cfg);
      if (!btn || btn.disabled) return;

      log("Action button clicked:", cfg.actionSelector || cfg.actionText);

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
    },
    true,
  );

  // --- Input delegation cho scan_value (giữ nguyên) ---
  document.addEventListener(
    "input",
    (e) => {
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
    },
    true,
  );

  // ==================== NAVIGATION MONITOR (GIỮ NGUYÊN CODE GỐC) ====================
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

  // ==================== WIDGET VISIBILITY WATCHER (GIỮ NGUYÊN CODE GỐC) ====================
  const WidgetVisibilityWatcher = (() => {
    let lastDecision = null;
    const shouldBeVisible = async () => {
      const pt = getPageType(location.href);
      if (pt === "unknown") return false;
      const email = getEmail();
      if (!email) return false;
      const auth = await ensureAuth(email);
      return auth.allowed;
    };
    const apply = async () => {
      const visible = await shouldBeVisible();
      const decision = visible ? "visible" : "hidden";
      if (decision !== lastDecision) {
        lastDecision = decision;
        WidgetManager.setVisible(visible);
        if (visible) syncWidgetWithStats();
      }
    };
    NavigationMonitor.onNavigate(apply);
    apply();
    return { applyVisibility: apply };
  })();

  // ==================== STORAGE LISTENER ====================
  if (typeof GM_addValueChangeListener === "function") {
    const statsKey = `stats_${todayKey()}`;
    try {
      GM_addValueChangeListener(statsKey, (name, oldVal, newVal) => {
        log("Stats updated via storage, updating widget");
        WidgetManager.updateStats(newVal);
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
    // Hủy toàn bộ apiWaiters đang chờ
    cancelAllApiWaiters();
    state.isDestroyed = true;
  };

  // ==================== BEFOREUNLOAD (CẢI TIẾN: sendBeacon) ====================
  window.addEventListener("beforeunload", () => {
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
  });

  // ==================== INIT (CÓ DEBOUNCE NHẸ) ====================
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

        cleanOldData();

        const pageType = getPageType(location.href);
        if (pageType === "unknown") {
          state.currentPageType = state.currentEmail = null;
          return;
        }
        state.currentPageType = pageType;

        const email = getEmail();
        if (!email) {
          state.currentEmail = null;
          warn("No email found");
          return;
        }
        state.currentEmail = email;

        ensureAuth(email)
          .then((auth) => {
            if (!auth.allowed) warn("User not authorized:", auth.reason);
            else log("Authorization successful");
          })
          .catch((e) => error("Auth failed:", e));

        await flushPending();

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
      log("Navigation detected, re-init");
      debouncedInit();
    }
  });

  init()
    .then(() => log("Tracker started"))
    .catch((e) => error("Startup error:", e));
})();
