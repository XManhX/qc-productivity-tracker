// src/tracker-script.js
// Đây là file JS thông thường, không phải module.
// Sẽ được đọc và nhúng vào userscript khi build.

(function () {
  "use strict";

  // ===== LOG NGAY KHI SCRIPT BẮT ĐẦU =====
  console.log("[QC Tracker] Script started at", new Date().toISOString());

  // Kiểm tra môi trường Tampermonkey
  if (typeof GM_xmlhttpRequest === 'undefined' || typeof GM_setValue === 'undefined') {
    console.warn('[QC Tracker] Tampermonkey APIs not available. Script will not work.');
    return;
  }

  // ===== CẤU HÌNH =====
  const CONFIG = {
    VERSION: "__VERSION__",
    API_BASE_URL: "__API_BASE_URL__",
    LOGIN_INFO_URL: "https://wms.ssc.shopee.vn/api/v2/apps/system/user/get_login_info",
    AUTH_ENDPOINT: "/api/qc-productivity/authz",
    LOG_ENDPOINT: "/api/qc-productivity/log",
    DEBUG: true,  // Bật debug để kiểm tra
    AUTH_CACHE_MS: 5 * 60 * 1000,
    DUPLICATE_WINDOW_MS: 3000,
  };

  console.log("[QC Tracker] Config:", CONFIG);

  // PAGE_CONFIG sẽ được thay thế bởi build script
  const PAGE_CONFIG = {};

  let fieldTimestamps = {};

  // ===== HÀM LOG DEBUG =====
  function logDebug(...args) {
    if (CONFIG.DEBUG) {
      console.log("[QC Tracker]", ...args);
    }
  }

  logDebug("Debug mode is ON");

  // ===== CÁC HÀM TIỆN ÍCH =====
  function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function getTodayKey() {
    return new Date().toISOString().split('T')[0];
  }

  function getPageType(href) {
    const entry = Object.entries(PAGE_CONFIG).find(([, cfg]) =>
      href.includes(cfg.pathIncludes)
    );
    return entry ? entry[0] : "unknown";
  }

  // ===== LƯU TRỮ LOCAL =====
  function getStorage(key, fallback = null) {
    try {
      const value = GM_getValue(key);
      return value === undefined ? fallback : value;
    } catch (e) {
      logDebug("getStorage error", e);
      return fallback;
    }
  }

  function setStorage(key, value) {
    try {
      GM_setValue(key, value);
    } catch (e) {
      logDebug("setStorage error", e);
    }
  }

  // ===== GỬI REQUEST QUA GM_xmlhttpRequest =====
  function gmRequest(method, url, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
      try {
        logDebug(`gmRequest: ${method} ${url}`);
        GM_xmlhttpRequest({
          method,
          url,
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
          data: data ? JSON.stringify(data) : undefined,
          onload: function (response) {
            logDebug(`gmRequest response status: ${response.status}`);
            if (response.status < 200 || response.status >= 300) {
              reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
              return;
            }
            let parsedData = null;
            try {
              parsedData = response.responseText ? JSON.parse(response.responseText) : {};
            } catch (e) {
              reject(new Error(`Invalid JSON: ${response.responseText}`));
              return;
            }
            resolve({ status: response.status, data: parsedData });
          },
          onerror: function (error) {
            logDebug("gmRequest error", error);
            reject(error);
          },
          ontimeout: function () {
            reject(new Error('Request timeout'));
          },
          timeout: 10000
        });
      } catch (e) {
        logDebug("gmRequest exception", e);
        reject(e);
      }
    });
  }

  // ===== FLOATING WIDGET =====
  function updateFloatingWidget() {
    logDebug("updateFloatingWidget called");
    const today = getTodayKey();
    const stats = getStorage(`stats_${today}`, { qc: 0, judgement: 0, rimassreceive: 0 });

    let widget = document.getElementById("qc-tracker-floating-widget");
    if (!widget) {
      logDebug("Creating floating widget");
      widget = document.createElement("div");
      widget.id = "qc-tracker-floating-widget";

      const savedPos = getStorage("widget_position", { top: "80px", right: "20px" });

      widget.style.cssText = `
        position: fixed;
        top: ${savedPos.top};
        right: ${savedPos.right};
        left: ${savedPos.left || 'auto'};
        bottom: ${savedPos.bottom || 'auto'};
        width: 200px;
        background: rgba(33, 33, 33, 0.9);
        color: #fff;
        padding: 12px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 999999;
        font-family: Arial, sans-serif;
        font-size: 13px;
        user-select: none;
        border: 1px solid #ff5722;
      `;

      const header = document.createElement("div");
      header.id = "qc-tracker-widget-header";
      header.innerText = "📊 NĂNG SUẤT HÔM NAY";
      header.style.cssText = "font-weight: bold; border-bottom: 1px solid #555; padding-bottom: 6px; margin-bottom: 8px; cursor: move; color: #ff5722; text-align: center;";
      widget.appendChild(header);

      const content = document.createElement("div");
      content.id = "qc-tracker-widget-content";
      widget.appendChild(content);

      document.body.appendChild(widget);
      makeWidgetDraggable(widget, header);
    }

    const contentEl = document.getElementById("qc-tracker-widget-content");
    if (contentEl) {
      contentEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>1. Đã QC:</span> <strong style="color:#00e676">${stats.qc}</strong></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>2. Đã Judge:</span> <strong style="color:#29b6f6">${stats.judgement}</strong></div>
        <div style="display:flex; justify-content:space-between;"><span>3. Đã Nhận:</span> <strong style="color:#ffca28">${stats.rimassreceive}</strong></div>
      `;
    }
  }

  function makeWidgetDraggable(elmnt, header) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    header.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e = e || window.event;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;

      const newTop = (elmnt.offsetTop - pos2) + "px";
      const newLeft = (elmnt.offsetLeft - pos1) + "px";

      elmnt.style.top = newTop;
      elmnt.style.left = newLeft;
      elmnt.style.right = "auto";
      elmnt.style.bottom = "auto";
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
      setStorage("widget_position", {
        top: elmnt.style.top,
        left: elmnt.style.left
      });
    }
  }

  // ===== API INTERCEPTOR =====
  function initApiInterceptor() {
    logDebug("initApiInterceptor called");
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      const url = typeof args[0] === "string" ? args[0] : args[0].url;

      Object.entries(PAGE_CONFIG).forEach(async ([pageType, cfg]) => {
        if (cfg.apiWatchUrl && url.includes(cfg.apiWatchUrl)) {
          logDebug(`Intercepting ${pageType} API: ${url}`);
          try {
            const cloneResp = response.clone();
            const json = await cloneResp.json();

            if (json && json.retcode === 0 && json.data && json.data.list && json.data.list.length > 0) {
              const item = json.data.list[0];
              const inboundId = item.inbound_id || item.asn || "";
              const returnTn = item.return_tn || "";

              if (inboundId) {
                logDebug(`Intercepted ${pageType} data:`, { inboundId, returnTn });

                setStorage(`intercepted_${pageType}_${inboundId}`, {
                  inbound_id: inboundId,
                  return_tn: returnTn,
                  intercepted_at: nowISO()
                });

                if (pageType === "qc") {
                  const lastQcInboundId = getStorage("last_qc_inbound_id", "");
                  if (lastQcInboundId && lastQcInboundId !== inboundId) {
                    const isJudged = getStorage(`judgement_completed_${lastQcInboundId}`, false);
                    if (!isJudged) {
                      alert(`⚠️ CẢNH BÁO: Đơn [${lastQcInboundId}] vừa QC xong NHƯNG CHƯA ĐƯỢC thực hiện Judgement! Vui lòng kiểm tra lại quy trình.`);
                    }
                  }
                  setStorage("last_qc_inbound_id", inboundId);
                }

                if (pageType === "judgement") {
                  setStorage(`judgement_completed_${inboundId}`, true);
                }
              }
            }
          } catch (err) {
            logDebug("Error parsing intercepted fetch", err);
          }
        }
      });

      return response;
    };
  }

  // ===== THEO DÕI FOCUS INPUT =====
  function setupFieldFocusListeners(pageType) {
    const cfg = PAGE_CONFIG[pageType];
    if (!cfg) return;

    Object.entries(cfg.fields).forEach(([fieldName, keywords]) => {
      for (const keyword of keywords) {
        let inputEl = null;
        if (keyword.startsWith("#")) {
          const target = document.querySelector(keyword);
          if (target) {
            inputEl = target.tagName === "INPUT" || target.tagName === "TEXTAREA" ? target : target.querySelector("input, textarea");
          }
        } else {
          const parent = document.querySelector(`[data-for="${keyword}"]`);
          if (parent) inputEl = parent.querySelector("input, textarea");
        }

        if (inputEl && !inputEl.dataset.qcTimeBound) {
          inputEl.dataset.qcTimeBound = "1";
          inputEl.addEventListener("focus", () => {
            if (!fieldTimestamps[fieldName]) {
              fieldTimestamps[fieldName] = nowISO();
              logDebug(`Field ${fieldName} focused at ${fieldTimestamps[fieldName]}`);
            }
          });
        }
      }
    });
  }

  // ===== LẤY EMAIL USER =====
  async function getCurrentUserEmail() {
    try {
      logDebug("Fetching user email from", CONFIG.LOGIN_INFO_URL);
      const resp = await fetch(CONFIG.LOGIN_INFO_URL, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) {
        logDebug(`getCurrentUserEmail HTTP error: ${resp.status}`);
        return "";
      }
      const data = await resp.json();
      if (data?.retcode !== 0) {
        logDebug(`getCurrentUserEmail retcode: ${data.retcode}`);
        return "";
      }
      const email = normalizeText(data?.data?.email || "").toLowerCase();
      logDebug(`User email: ${email}`);
      return email;
    } catch (e) {
      logDebug("getCurrentUserEmail error", e);
      return "";
    }
  }

  // ===== LẤY GIÁ TRỊ INPUT =====
  function getInputValueByKeywords(keywords = []) {
    for (const keyword of keywords) {
      if (keyword.startsWith("#")) {
        const targetEl = document.querySelector(keyword);
        if (targetEl) {
          if (targetEl.tagName === "INPUT" || targetEl.tagName === "TEXTAREA") {
            return normalizeText(targetEl.value || "");
          }
          const inputEl = targetEl.querySelector("input, textarea");
          if (inputEl) return normalizeText(inputEl.value || "");
        }
      } else {
        const parentEl = document.querySelector(`[data-for="${keyword}"]`);
        if (parentEl) {
          const inputEl = parentEl.querySelector("input, textarea");
          if (inputEl) return normalizeText(inputEl.value || "");
        }
      }
    }
    return "";
  }

  // ===== TÌM NÚT ACTION =====
  function findActionButton(actionText) {
    const buttons = Array.from(document.querySelectorAll("button"));
    return (
      buttons.find(
        (btn) =>
          normalizeText(btn.innerText).toLowerCase() ===
          actionText.toLowerCase(),
      ) || null
    );
  }

  // ===== THU THẬP CÁC TRƯỜNG =====
  function collectFields(pageType) {
    const cfg = PAGE_CONFIG[pageType];
    const result = {
      device_id: "",
      scan_value: "",
    };

    if (!cfg) return result;

    Object.entries(cfg.fields).forEach(([field, keywords]) => {
      result[field] = getInputValueByKeywords(keywords);
    });

    return result;
  }

  // ===== TẠO RECORD =====
  function makeRecord(pageType, userEmail) {
    const fieldsData = collectFields(pageType);
    const currentScanVal = fieldsData.scan_value;
    const extraApiData = getStorage(`intercepted_${pageType}_${currentScanVal}`, { inbound_id: "", return_tn: "" });

    const record = {
      version: CONFIG.VERSION,
      timestamp: nowISO(),
      page: pageType,
      action: PAGE_CONFIG[pageType]?.actionText || "",
      operator: userEmail || "",
      url: location.href,
      ...fieldsData,
      api_inbound_id: extraApiData.inbound_id,
      api_return_tn: extraApiData.return_tn,
      field_timestamps: { ...fieldTimestamps }
    };

    logDebug("Record created:", record);
    return record;
  }

  function shouldSkipRecord(record, pageType) {
    const requiredFields = PAGE_CONFIG[pageType]?.requiredFields || [];
    const missing = requiredFields.filter((field) => !record[field]);
    if (missing.length) {
      logDebug(`Skip record: missing fields ${missing.join(', ')}`);
      return true;
    }
    return false;
  }

  // ===== AUTHZ =====
  async function checkAuthorization(userEmail) {
    if (!userEmail) return { allowed: false, reason: "missing_user_email" };

    const cacheKey = "qc_authz_" + userEmail;
    const cached = getStorage(cacheKey, null);

    if (cached && cached.expireAt && Date.now() < cached.expireAt) {
      logDebug("Authz cached:", cached.value);
      return cached.value;
    }

    try {
      const url = CONFIG.API_BASE_URL + CONFIG.AUTH_ENDPOINT;
      logDebug("Calling Authz:", url);
      const resp = await gmRequest("POST", url, {
        email: userEmail,
        page: location.pathname,
      });

      const value = {
        allowed: !!resp?.data?.allowed,
        reason: resp?.data?.reason || "",
        user: resp?.data?.user || null,
        session_token: resp?.data?.session_token || "",
      };

      logDebug("Authz response:", value);

      setStorage(cacheKey, {
        expireAt: Date.now() + CONFIG.AUTH_CACHE_MS,
        value,
      });

      return value;
    } catch (e) {
      logDebug("checkAuthorization error", e);
      return { allowed: false, reason: "authz_api_error" };
    }
  }

  // ===== GỬI LOG =====
  async function sendRecord(record, sessionToken = "") {
    try {
      const headers = {};
      if (sessionToken) {
        headers["X-QC-Session-Token"] = sessionToken;
        logDebug("Sending with token:", sessionToken.substring(0, 20) + "..."); // chỉ log một phần
      } else {
        logDebug("Sending WITHOUT session token!");
      }

      const url = CONFIG.API_BASE_URL + CONFIG.LOG_ENDPOINT;
      logDebug("Sending log to", url);
      const resp = await gmRequest("POST", url, record, headers);

      const success = resp.status >= 200 && resp.status < 300;
      logDebug(`Send record ${success ? 'success' : 'failed'} (status ${resp.status})`);
      if (!success && resp.data && resp.data.error) {
        logDebug("Server error detail:", resp.data.error);
      }
      return success;
    } catch (e) {
      logDebug("sendRecord error", e);
      const pending = getStorage("qc_pending_logs", []);
      pending.push({ record, sessionToken });
      setStorage("qc_pending_logs", pending);
      return false;
    }
  }

  // ===== FLUSH PENDING LOGS =====
  async function flushPendingLogs() {
    const pending = getStorage("qc_pending_logs", []);
    if (!Array.isArray(pending) || pending.length === 0) return;

    logDebug(`Flushing ${pending.length} pending logs`);
    const remain = [];
    for (const item of pending) {
      const ok = await sendRecord(item.record, item.sessionToken || "");
      if (!ok) remain.push(item);
    }

    setStorage("qc_pending_logs", remain);
    if (remain.length === 0) {
      logDebug("All pending logs flushed");
    } else {
      logDebug(`${remain.length} pending logs remain`);
    }
  }

  // ===== XỬ LÝ KHI CLICK ACTION =====
  async function handleActionClick(pageType, userEmail, sessionToken = "") {
    logDebug("handleActionClick called for", pageType);
    const record = makeRecord(pageType, userEmail);

    if (shouldSkipRecord(record, pageType)) {
      logDebug("skip record due to missing required fields");
      return;
    }

    // Chống duplicate
    const fingerprint = [
      record.page,
      record.action,
      record.operator,
      record.device_id,
      record.scan_value,
    ].join("|");

    const lastFingerprint = getStorage("qc_last_fingerprint", "");
    const lastTime = getStorage("qc_last_fingerprint_time", 0);

    if (
      fingerprint === lastFingerprint &&
      Date.now() - lastTime < CONFIG.DUPLICATE_WINDOW_MS
    ) {
      logDebug("duplicate record skipped (within window)");
      return;
    }

    setStorage("qc_last_fingerprint", fingerprint);
    setStorage("qc_last_fingerprint_time", Date.now());

    const success = await sendRecord(record, sessionToken);
    if (success) {
      logDebug("Record sent successfully");
      fieldTimestamps = {};

      // Tăng số đếm
      const today = getTodayKey();
      const stats = getStorage(`stats_${today}`, { qc: 0, judgement: 0, rimassreceive: 0 });
      if (stats.hasOwnProperty(pageType)) {
        stats[pageType] += 1;
        setStorage(`stats_${today}`, stats);
        updateFloatingWidget();
        logDebug(`Updated stats for ${pageType}: ${stats[pageType]}`);
      }
    } else {
      logDebug("Record send failed, saved to pending");
    }
  }

  // ===== INIT =====
  async function init() {
    console.log("[QC Tracker] init() started");

    initApiInterceptor();

    const pageType = getPageType(location.href);
    console.log("[QC Tracker] Page type:", pageType);

    if (pageType === "unknown") {
      console.log("[QC Tracker] Page not supported");
      return;
    }

    updateFloatingWidget();

    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      console.warn("[QC Tracker] No user email");
      return;
    }

    const authz = await checkAuthorization(userEmail);
    console.log("[QC Tracker] Authz result:", authz);
    if (!authz.allowed) {
      console.warn("[QC Tracker] Not authorized:", authz.reason);
      return;
    }

    await flushPendingLogs();

    const bind = () => {
      const button = findActionButton(PAGE_CONFIG[pageType]?.actionText);
      if (button && button.dataset.qcTrackerBound !== "1") {
        button.dataset.qcTrackerBound = "1";
        button.addEventListener("click", async function () {
          console.log("[QC Tracker] Button clicked");
          await handleActionClick(pageType, userEmail, authz.session_token || "");
        }, true);
        console.log("[QC Tracker] Bound action button");
      } else if (button) {
        console.log("[QC Tracker] Button already bound");
      } else {
        console.warn("[QC Tracker] Action button not found");
      }
      setupFieldFocusListeners(pageType);
    };

    bind();

    // Observer cho các button được thêm sau
    const observer = new MutationObserver(() => {
      const button = findActionButton(PAGE_CONFIG[pageType]?.actionText);
      if (button && button.dataset.qcTrackerBound !== "1") {
        console.log("[QC Tracker] Detected new button, binding...");
        bind();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log("[QC Tracker] Observer started");

    console.log("[QC Tracker] init() completed");
  }

  // ===== CHẠY INIT =====
  console.log("[QC Tracker] Calling init()...");
  init().catch(err => console.error("[QC Tracker] Fatal error:", err));
})();