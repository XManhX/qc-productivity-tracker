(function () {
  "use strict";

  const CONFIG = {
    VERSION: "__VERSION__",
    API_BASE_URL: "__API_BASE_URL__",
    AUTH_ENDPOINT: "/api/qc-productivity/authz",
    LOG_ENDPOINT: "/api/qc-productivity/log",
    DEBUG: true,
    AUTH_CACHE_MS: 5 * 60 * 1000,
    DUPLICATE_WINDOW_MS: 3000,
    EMAIL_CACHE_MS: 5 * 60 * 1000,
  };

  const PAGE_CONFIG = {};

  // ==================== BIẾN TOÀN CỤC ====================
  let fieldTimestamps = {};
  let pageStartTime = null;
  let lastScanValue = null;        // để phát hiện scan_value thay đổi
  let lastUrl = location.href;
  let observer = null;             // MutationObserver toàn cục

  const log = (...args) => CONFIG.DEBUG && console.log("[QC Tracker]", ...args);
  const normalize = (s) => (s || "").replace(/\s+/g, " ").trim();
  const nowISO = () => new Date().toISOString();
  const todayKey = () => new Date().toISOString().split("T")[0];

  // ==================== HÀM TIỆN ÍCH ====================
  const getPageType = (href) => {
    const entry = Object.entries(PAGE_CONFIG).find(([, cfg]) =>
      href.includes(cfg.pathIncludes),
    );
    return entry ? entry[0] : "unknown";
  };

  const getIdFromUrl = (pageType) => {
    const cfg = PAGE_CONFIG[pageType];
    if (!cfg || !cfg.urlParam) return "";
    const params = new URLSearchParams(window.location.search);
    return params.get(cfg.urlParam) || "";
  };

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
    } catch {}
  };

  const gmRequest = (method, url, data = null, headers = {}) =>
    new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        headers: { "Content-Type": "application/json", ...headers },
        data: data ? JSON.stringify(data) : undefined,
        onload: (resp) => {
          if (resp.status < 200 || resp.status >= 300)
            return reject(new Error(`HTTP ${resp.status}`));
          try {
            resolve({
              status: resp.status,
              data: JSON.parse(resp.responseText || "{}"),
            });
          } catch {
            reject(new Error("Invalid JSON"));
          }
        },
        onerror: reject,
        ontimeout: () => reject(new Error("Timeout")),
        timeout: 10000,
      });
    });

  // ==================== WIDGET ====================
  // __WIDGET_CODE__

  // ==================== GET EMAIL ====================
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
        if (val) {
          try {
            const obj = JSON.parse(val);
            if (obj.email) val = obj.email;
            else if (obj.user && obj.user.email) val = obj.user.email;
          } catch {}
          const email = normalize(val).toLowerCase();
          if (email) {
            log("Email from storage (key:", key, "):", email);
            setStore("user_email", email);
            setStore("user_email_timestamp", Date.now());
            return email;
          }
        }
      }
    } catch {}

    let email = getStore("user_email", "");
    const ts = getStore("user_email_timestamp", 0);
    if (email && Date.now() - ts < CONFIG.EMAIL_CACHE_MS) {
      log("Email from GM cache:", email);
      return email;
    }

    log("No email found in storage");
    return "";
  };

  // ==================== FIELD EXTRACTION ====================
  const getInputByKeywords = (keywords = []) => {
    for (const kw of keywords) {
      if (kw.startsWith("#")) {
        const target = document.querySelector(kw);
        if (target) {
          const input =
            target.tagName === "INPUT" || target.tagName === "TEXTAREA"
              ? target
              : target.querySelector("input, textarea");
          if (input) return normalize(input.value);
        }
      } else {
        const parent = document.querySelector(`[data-for="${kw}"]`);
        if (parent) {
          const input = parent.querySelector("input, textarea");
          if (input) return normalize(input.value);
        }
      }
    }
    return "";
  };

  // Reset pageStartTime khi phát hiện scan_value mới
  const setPageStartTimeIfNeeded = (scanValue) => {
    if (scanValue && scanValue !== lastScanValue) {
      lastScanValue = scanValue;
      pageStartTime = nowISO();
      log("Page start time reset for new scan_value:", pageStartTime);
    }
  };

  const collectFields = (pageType) => {
    const cfg = PAGE_CONFIG[pageType];
    if (!cfg) return { device_id: "", scan_value: "" };
    const result = {};
    Object.entries(cfg.fields).forEach(([field, keywords]) => {
      result[field] = getInputByKeywords(keywords);
    });

    // Nếu không lấy được từ input, thử lấy từ URL
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
    }

    if (result.scan_value) {
      setPageStartTimeIfNeeded(result.scan_value);
    }

    return result;
  };

  // ==================== ACTION BUTTON ====================
  const findActionButton = (text) => {
    const btns = Array.from(document.querySelectorAll("button"));
    return (
      btns.find(
        (b) => normalize(b.innerText).toLowerCase() === text.toLowerCase(),
      ) || null
    );
  };

  // ==================== RECORD ====================
  const makeRecord = (pageType, userEmail, page_end_time) => {
    const fields = collectFields(pageType);
    return {
      version: CONFIG.VERSION,
      page: pageType,
      action: PAGE_CONFIG[pageType]?.actionText || "",
      operator: userEmail,
      url: location.href,
      device_id: fields.device_id || "",
      scan_value: fields.scan_value || "",
      page_start_time: pageStartTime,
      page_end_time: page_end_time,
    };
  };

  const shouldSkip = (record, pageType) => {
    const required = PAGE_CONFIG[pageType]?.requiredFields || [];
    return required.some((f) => !record[f]);
  };

  const sendRecord = async (record) => {
    try {
      const resp = await gmRequest(
        "POST",
        CONFIG.API_BASE_URL + CONFIG.LOG_ENDPOINT,
        record,
      );
      log("Log sent, status:", resp.status);
      return true;
    } catch (e) {
      log("Send failed, queued:", e);
      const pending = getStore("qc_pending_logs", []);
      pending.push(record);
      setStore("qc_pending_logs", pending);
      return false;
    }
  };

  const flushPending = async () => {
    const pending = getStore("qc_pending_logs", []);
    if (!pending.length) return;
    log(`Flushing ${pending.length} pending logs`);
    const remain = [];
    for (const record of pending) {
      const ok = await sendRecord(record);
      if (!ok) remain.push(record);
    }
    setStore("qc_pending_logs", remain);
  };

  // ==================== AUTHZ ====================
  const checkAuth = async (email) => {
    if (!email) return { allowed: false, reason: "missing_email" };
    const cacheKey = "qc_authz_" + email;
    const cached = getStore(cacheKey, null);
    if (cached && cached.expireAt && Date.now() < cached.expireAt) {
      return cached.value;
    }
    try {
      const resp = await gmRequest(
        "POST",
        CONFIG.API_BASE_URL + CONFIG.AUTH_ENDPOINT,
        { email, page: location.pathname },
      );
      const value = {
        allowed: !!resp?.data?.allowed,
        reason: resp?.data?.reason || "",
      };
      setStore(cacheKey, {
        expireAt: Date.now() + CONFIG.AUTH_CACHE_MS,
        value,
      });
      return value;
    } catch {
      return { allowed: false, reason: "authz_error" };
    }
  };

  // ==================== XỬ LÝ HOÀN THÀNH (click nút) ====================
  const handleActionComplete = async (pageType, userEmail) => {
    const page_end_time = nowISO(); // lấy thời điểm click
    const record = makeRecord(pageType, userEmail, page_end_time);

    if (shouldSkip(record, pageType)) {
      log("Skipped due to missing required fields");
      return;
    }

    // Chống trùng lặp
    const fingerprint = [
      record.page,
      record.action,
      record.operator,
      record.device_id,
      record.scan_value,
    ].join("|");
    const lastFinger = getStore("qc_last_fingerprint", "");
    const lastTime = getStore("qc_last_fingerprint_time", 0);
    if (
      fingerprint === lastFinger &&
      Date.now() - lastTime < CONFIG.DUPLICATE_WINDOW_MS
    ) {
      log("Duplicate within window, skipped");
      return;
    }
    setStore("qc_last_fingerprint", fingerprint);
    setStore("qc_last_fingerprint_time", Date.now());

    const ok = await sendRecord(record);
    if (ok) {
      fieldTimestamps = {};
      // Cập nhật thống kê trong ngày
      const stats = getStore(`stats_${todayKey()}`, {
        qc: 0,
        judgement: 0,
        rimassreceive: 0,
      });
      if (stats.hasOwnProperty(pageType)) {
        stats[pageType] += 1;
        setStore(`stats_${todayKey()}`, stats);
        updateWidget();
      }
    }
  };

  // ==================== FIELD LISTENERS ====================
  const setupFieldListeners = (pageType) => {
    const cfg = PAGE_CONFIG[pageType];
    if (!cfg) return;
    Object.entries(cfg.fields).forEach(([field, keywords]) => {
      for (const kw of keywords) {
        let input = null;
        if (kw.startsWith("#")) {
          const target = document.querySelector(kw);
          if (target)
            input =
              target.tagName === "INPUT" || target.tagName === "TEXTAREA"
                ? target
                : target.querySelector("input, textarea");
        } else {
          const parent = document.querySelector(`[data-for="${kw}"]`);
          if (parent) input = parent.querySelector("input, textarea");
        }
        if (input && !input.dataset.qcTimeBound) {
          input.dataset.qcTimeBound = "1";
          input.addEventListener("focus", () => {
            if (!fieldTimestamps[field]) {
              fieldTimestamps[field] = nowISO();
            }
          });
        }
      }
    });
  };

  // ==================== INIT (chính) ====================
  const init = async () => {
    log("Initializing...");

    // Dọn dẹp observer cũ nếu có
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    // Reset các biến liên quan đến phiên làm việc hiện tại
    pageStartTime = null;
    lastScanValue = null;
    fieldTimestamps = {};

    const pageType = getPageType(location.href);
    if (pageType === "unknown") {
      log("Unsupported page");
      return;
    }

    // Lấy scan_value từ URL (nếu có) để set page start time sớm
    const initialId = getIdFromUrl(pageType);
    if (initialId) {
      setPageStartTimeIfNeeded(initialId);
    }

    updateWidget();

    const email = getEmail();
    if (!email) {
      console.warn("[QC Tracker] No email found in localStorage or cache");
      return;
    }

    const auth = await checkAuth(email);
    if (!auth.allowed) {
      console.warn("[QC Tracker] Not authorized:", auth.reason);
      return;
    }

    await flushPending();

    // Hàm bind sự kiện cho nút actionText
    const bindButton = () => {
      const btn = findActionButton(PAGE_CONFIG[pageType]?.actionText);
      if (btn && !btn.dataset.qcTrackerBound) {
        btn.dataset.qcTrackerBound = "1";
        btn.addEventListener(
          "click",
          () => {
            log("Action button clicked, recording completion...");
            handleActionComplete(pageType, email);
          },
          true
        );
        log("Button bound for", pageType);
      }
      setupFieldListeners(pageType);
    };

    bindButton();

    // Theo dõi DOM để bắt nút xuất hiện muộn (SPA)
    observer = new MutationObserver(() => {
      const btn = findActionButton(PAGE_CONFIG[pageType]?.actionText);
      if (btn && !btn.dataset.qcTrackerBound) {
        bindButton();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Đồng bộ dữ liệu giữa các tab
    if (typeof GM_addValueChangeListener !== "undefined") {
      GM_addValueChangeListener((key, oldValue, newValue) => {
        if (key && key.startsWith("stats_")) {
          log("Storage changed, updating widget...");
          updateWidget();
        }
      });
    }

    log("Init complete for pageType:", pageType);
  };

  // ==================== PHÁT HIỆN CHUYỂN TRANG SPA (KHÔNG POLLING) ====================
  (function patchHistoryAPI() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    function triggerUrlChange() {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        log("SPA navigation detected (History API), re-initializing...");
        init();
      }
    }

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      triggerUrlChange();
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      triggerUrlChange();
    };

    window.addEventListener("popstate", triggerUrlChange);
  })();

  // ==================== KHỞI ĐỘNG ====================
  if (
    typeof GM_xmlhttpRequest === "undefined" ||
    typeof GM_setValue === "undefined"
  ) {
    console.warn("[QC Tracker] Tampermonkey APIs missing");
    return;
  }

  init()
    .then(() => {
      log("SPA monitoring activated (instant detection via History API)");
    })
    .catch((e) => console.error("[QC Tracker] Fatal:", e));
})();