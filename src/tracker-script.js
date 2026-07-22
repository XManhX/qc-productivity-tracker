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
    _sendingFingerprints: new Set(),
    initGeneration: 0, // tăng dần mỗi lần init
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
    if (typeof GM_listValues !== "function") return;
    const today = todayKey();
    try {
      const allKeys = GM_listValues();
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      const keysToDelete = allKeys.filter((key) => {
        if (
          key.startsWith("user_email") ||
          key.startsWith("qc_authz_") ||
          key === "qc_pending_logs"
        )
          return false;
        const parts = key.split("_");
        const datePart = parts.find((p) => datePattern.test(p));
        return datePart && datePart !== today;
      });
      const deleteChunk = (startIdx = 0, chunkSize = 50) => {
        const end = Math.min(startIdx + chunkSize, keysToDelete.length);
        for (let i = startIdx; i < end; i++) deleteStore(keysToDelete[i]);
        if (end < keysToDelete.length)
          setTimeout(() => deleteChunk(end, chunkSize), 0);
      };
      if (keysToDelete.length) deleteChunk(0);
    } catch (e) {
      warn("Daily cleanup error:", e);
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
            return reject(new Error(`HTTP ${resp.status}`));
          try {
            resolve({
              status: resp.status,
              data: JSON.parse(resp.responseText || "{}"),
            });
          } catch (e) {
            reject(new Error("Invalid JSON response"));
          }
        },
        onerror: (err) => reject(new Error("Network error")),
        ontimeout: () => reject(new Error("Timeout")),
      });
    });

  const retryRequest = async (fn, maxRetries, delayMs) => {
    let lastError;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (e) {
        lastError = e;
        if (i < maxRetries) await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw lastError;
  };

  // ==================== WIDGET ====================
  // __WIDGET_CODE__
  const widgetReady =
    typeof WidgetManager !== "undefined" && WidgetManager.init;
  if (widgetReady) WidgetManager.init(getStore, setStore);
  else console.error("[QC Tracker] WidgetManager not found");

  const widgetSetVisible = (v) => widgetReady && WidgetManager.setVisible(v);
  const widgetUpdateStats = (s) => widgetReady && WidgetManager.updateStats(s);

  // ==================== EMAIL ====================
  const getEmail = () => {
    const cached = getStore("user_email", "");
    const ts = getStore("user_email_timestamp", 0);
    if (
      cached &&
      isValidEmail(cached) &&
      Date.now() - ts < CONFIG.EMAIL_CACHE_MS
    )
      return cached;
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
      warn("Email read error:", e);
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

  // ==================== API INTERCEPTOR ====================
  const cancelAllApiWaiters = () => {
    while (state.apiWaiters.length) {
      const w = state.apiWaiters.pop();
      clearTimeout(w.timeoutId);
      w.reject(new Error("Destroyed"));
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
    const origFetch = window.fetch;
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
      const interested = state.apiWaiters.filter(
        (w) => url.includes(w.urlPattern) && method === w.method,
      );
      const promise = origFetch.call(this, input, init);
      if (interested.length) {
        promise
          .then((resp) => {
            if (!resp.ok) return;
            resp
              .clone()
              .json()
              .then((data) => {
                for (let i = interested.length - 1; i >= 0; i--) {
                  const w = interested[i];
                  clearTimeout(w.timeoutId);
                  if (w.successCondition(data)) w.resolve(data);
                  else w.reject(new Error("Condition failed"));
                  const idx = state.apiWaiters.indexOf(w);
                  if (idx > -1) state.apiWaiters.splice(idx, 1);
                }
              })
              .catch(() => {});
          })
          .catch(() => {});
      }
      return promise;
    };
    window.__qcFetchOverridden = true;
  }

  if (!window.__qcXHROverridden) {
    const XHRProto = XMLHttpRequest.prototype;
    const origOpen = XHRProto.open;
    const origSend = XHRProto.send;
    XHRProto.open = function (method, url, ...rest) {
      this._qcMethod = method.toUpperCase();
      this._qcUrl = url;
      return origOpen.call(this, method, url, ...rest);
    };
    XHRProto.send = function (body) {
      const xhr = this;
      const origReady = xhr.onreadystatechange;
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          const interested = state.apiWaiters.filter(
            (w) =>
              xhr._qcUrl &&
              xhr._qcUrl.includes(w.urlPattern) &&
              xhr._qcMethod === w.method,
          );
          if (interested.length) {
            try {
              const data = JSON.parse(xhr.responseText);
              for (let i = interested.length - 1; i >= 0; i--) {
                const w = interested[i];
                clearTimeout(w.timeoutId);
                if (w.successCondition(data)) w.resolve(data);
                else w.reject(new Error("Condition failed"));
                const idx = state.apiWaiters.indexOf(w);
                if (idx > -1) state.apiWaiters.splice(idx, 1);
              }
            } catch {}
          }
        }
        if (origReady) origReady.apply(this, arguments);
      };
      return origSend.call(this, body);
    };
    window.__qcXHROverridden = true;
  }

  // ==================== RECORD MANAGEMENT ====================
  const makeRecord = (pageType, userEmail, endTime = nowISO()) => {
    const fields = collectFields(pageType);
    const cfg = PAGE_CONFIG[pageType] || {};
    return {
      id: Date.now() + "_" + Math.random().toString(36).substr(2, 9),
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

  const createFingerprint = (record) =>
    [
      record.page,
      record.action,
      record.operator,
      record.device_id,
      record.scan_value,
    ]
      .map((s) => normalize(String(s)).toLowerCase())
      .join("|");

  const addToPending = (record) => {
    const pending = getPendingLogs();
    const fp = createFingerprint(record);
    if (pending.some((r) => createFingerprint(r) === fp)) {
      log("Duplicate fingerprint in pending queue, skipping:", fp);
      return;
    }
    pending.push(record);
    setPendingLogs(pending);
  };

  const removeFromPendingById = (recordId) => {
    const pending = getPendingLogs();
    const filtered = pending.filter((r) => r.id !== recordId);
    if (filtered.length !== pending.length) setPendingLogs(filtered);
  };
  const clearPending = () => setPendingLogs([]);

  const sendRecord = async (record) => {
    const fp = createFingerprint(record);
    if (state._sendingFingerprints.has(fp)) {
      warn("Record is already being sent, skipping duplicate send:", fp);
      return false;
    }
    state._sendingFingerprints.add(fp);
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
    } finally {
      state._sendingFingerprints.delete(fp);
    }
  };

  const flushPending = async (generation) => {
    if (generation !== undefined && generation !== state.initGeneration) {
      log("flushPending cancelled (old generation)");
      return;
    }
    let pending = getPendingLogs();
    if (!pending.length) return;
    log(`Flushing ${pending.length} pending logs`);
    for (let i = 0; i < pending.length; i++) {
      // Kiểm tra lại generation mỗi vòng lặp để thoát sớm nếu có re‑init
      if (generation !== undefined && generation !== state.initGeneration) {
        log("flushPending interrupted by new init");
        break;
      }
      const record = pending[i];
      const sent = await sendRecord(record);
      if (sent) {
        removeFromPendingById(record.id);
        pending = getPendingLogs();
        i--;
      }
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
    } catch (e) {
      warn("fetchStats error:", e);
    }
    return null;
  };

  const syncWidgetWithStats = async (generation) => {
    if (state.isDestroyed) return;
    if (generation !== undefined && generation !== state.initGeneration) {
      log("syncWidgetWithStats cancelled (old generation)");
      return;
    }
    if (state.statsPromise) return state.statsPromise;
    if (Date.now() - state.lastStatsSyncTime < CONFIG.STATS_THROTTLE_MS) return;

    state.statsPromise = (async () => {
      try {
        const serverStats = await fetchStatsFromServer();
        // Kiểm tra lại generation sau khi fetch
        if (generation !== undefined && generation !== state.initGeneration)
          return;
        if (state.isDestroyed) return;
        const fallback = getStore(`stats_${todayKey()}`, {
          qc: 0,
          judgement: 0,
          rimassreceive: 0,
          lastUpdated: 0,
        });
        widgetUpdateStats(serverStats || fallback);
        state.lastStatsSyncTime = Date.now();
      } catch (e) {
        warn("syncStats error:", e);
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
    if (cached?.expireAt && Date.now() < cached.expireAt && cached.value)
      return cached.value;
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
      warn("Auth error:", e);
      return cached?.value || { allowed: false, reason: "authz_error" };
    }
  };

  const ensureAuth = async (email, generation) => {
    // Nếu đã có promise đang chạy nhưng khác generation thì hủy bỏ bằng cách tạo promise mới?
    // Thực tế, ta sẽ không reuse state.authPromise nếu generation khác, nhưng để đơn giản,
    // mỗi lần gọi ensureAuth với generation mới sẽ thay thế promise cũ.
    if (
      state.authPromise &&
      generation !== undefined &&
      generation !== state.initGeneration
    ) {
      // Hủy promise cũ bằng cách cho phép tạo mới
    }
    state.authPromise = (async () => {
      try {
        const auth = await checkAuth(email);
        // Kiểm tra generation sau khi auth xong
        if (generation !== undefined && generation !== state.initGeneration) {
          log("ensureAuth result ignored (old generation)");
          return auth; // vẫn trả về nhưng không cập nhật state
        }
        const prevAllowed = state.authStatus?.allowed;
        state.authStatus = auth;
        state.authPromise = null;

        if (auth.allowed) {
          widgetSetVisible(true);
          // syncWidgetWithStats nên được gọi với generation hiện tại để tránh conflict
          syncWidgetWithStats(generation);
        } else {
          if (auth.reason !== "authz_error") clearPending();
          widgetSetVisible(false);
        }
        if (prevAllowed !== auth.allowed) {
          WidgetVisibilityWatcher.apply();
        }
        return auth;
      } catch (err) {
        if (generation !== undefined && generation !== state.initGeneration) {
          // bỏ qua lỗi
          return { allowed: false, reason: "authz_error" };
        }
        state.authStatus = { allowed: false, reason: "authz_error" };
        state.authPromise = null;
        widgetSetVisible(false);
        WidgetVisibilityWatcher.apply();
        throw err;
      }
    })();
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
      // Gọi ensureAuth với generation hiện tại
      ensureAuth(userEmail, state.initGeneration);
    }
    if (state.authStatus?.allowed) {
      const sent = await sendRecord(record);
      if (sent) {
        removeFromPendingById(record.id);
      }
      // sync sau khi gửi, dùng generation hiện tại
      syncWidgetWithStats(state.initGeneration);
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
    if (buttonObserver) {
      buttonObserver.disconnect();
      buttonObserver = null;
    }
    const candidates = document.querySelectorAll(
      'button, input[type="submit"], a[role="button"], div[role="button"]',
    );
    candidates.forEach((el) => markSingleButton(el, cfg));
    if (!document.querySelector("[data-qc-tracked]")) {
      buttonObserver = new MutationObserver((mutations) => {
        let found = false;
        for (const mut of mutations) {
          for (const node of mut.addedNodes) {
            processNodeForButtons(node, cfg);
            if (node.querySelector?.("[data-qc-tracked]")) found = true;
          }
        }
        if (found) {
          buttonObserver.disconnect();
          buttonObserver = null;
        }
      });
      buttonObserver.observe(document.body, { childList: true, subtree: true });
    }
  };

  // ==================== EVENT HANDLERS ====================
  const clickHandler = async (e) => {
    if (state.isDestroyed) return;
    const pageType = state.currentPageType;
    const email = state.currentEmail;
    if (!pageType || !email) return;
    const cfg = PAGE_CONFIG[pageType];
    if (!cfg) return;
    const btn = matchActionButton(e.target, cfg);
    if (!btn || btn.disabled) return;
    btn.dataset.qcTracked = "true";
    if (cfg.apiCapture) {
      try {
        await addApiWaiter(
          cfg.apiCapture.urlPattern,
          cfg.apiCapture.method,
          CONFIG.API_CAPTURE_TIMEOUT_MS,
          cfg.apiCapture.successCondition ||
            ((data) => data && data.retcode === 0),
        );
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
    if (state.isDestroyed) return;
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
        } catch {}
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
      onNavigate(cb) {
        if (!callbacks.includes(cb)) callbacks.push(cb);
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

  // ==================== WIDGET VISIBILITY WATCHER ====================
  const WidgetVisibilityWatcher = (() => {
    let lastDecision = null;
    const apply = async () => {
      let allowed;
      if (state.authStatus) allowed = state.authStatus.allowed;
      else {
        const email = state.currentEmail;
        if (!email) return;
        const auth = await ensureAuth(email, state.initGeneration);
        allowed = auth.allowed;
      }
      const decision = allowed ? "visible" : "hidden";
      if (decision !== lastDecision) {
        lastDecision = decision;
        widgetSetVisible(allowed);
        if (allowed) syncWidgetWithStats(state.initGeneration);
      }
    };
    NavigationMonitor.onNavigate(apply);
    apply();
    return { apply };
  })();

  // ==================== STORAGE LISTENER ====================
  if (typeof GM_addValueChangeListener === "function") {
    try {
      GM_addValueChangeListener(
        `stats_${todayKey()}`,
        (name, oldVal, newVal) => {
          if (newVal !== undefined && !state.isDestroyed)
            widgetUpdateStats(newVal);
        },
      );
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
    state._sendingFingerprints.clear();
    state.isDestroyed = true;

    if (buttonObserver) {
      buttonObserver.disconnect();
      buttonObserver = null;
    }

    widgetSetVisible(false); // dừng guard, xóa widget

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
  const refreshPageState = () => {
    const pageType = state.currentPageType;
    if (!pageType) return;
    collectFields(pageType);
    log(
      "Page state refreshed, scan_value:",
      state.lastScanValue,
      "pageStartTime:",
      state.pageStartTime,
    );
  };

  // ==================== INIT ====================
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
    // Tăng generation, tạo snapshot
    const generation = ++state.initGeneration;
    state.initPromise = (async () => {
      try {
        log("Init for:", location.href, "generation:", generation);
        state.pendingReinitUrl = null;
        cleanup(); // dọn dẹp phiên cũ, bao gồm widget
        state.isDestroyed = false;
        state.pageStartTime = null;
        state.lastScanValue = null;
        state.authStatus = null;
        state.authPromise = null;

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

        try {
          const auth = await ensureAuth(email, generation);
          // Kiểm tra lại generation trước khi flush
          if (generation !== state.initGeneration) {
            log("Init auth result ignored, generation changed");
            return;
          }
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

        if (generation !== state.initGeneration) return; // dừng nếu có init mới hơn

        state.flushIntervalId = setInterval(() => {
          if (!state.isDestroyed && state.authStatus?.allowed) {
            // Dùng generation hiện tại để flush
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

  // ==================== VISUAL HIGHLIGHT ====================
  const style = `
    [data-qc-tracked="true"]:not([data-qc-disabled]) {
      outline: 2px solid #EE4D2D !important;
      outline-offset: 2px;
    }
    [data-qc-disabled="true"] {
      outline: 2px solid #999999 !important;
      outline-offset: 2px;
    }
  `;
  if (typeof GM_addStyle !== "undefined") GM_addStyle(style);
  else {
    const styleEl = document.createElement("style");
    styleEl.textContent = style;
    document.head.appendChild(styleEl);
  }
})();
