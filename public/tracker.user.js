// ==UserScript==// @name         QC Productivity Tracker// @namespace    sea-qc-tools// @version      1.0.0// @description  Track QC productivity actions on WMS return inbound pages// @match        https://wms.ssc.shopee.vn/v2/returninbound/qc*// @match        https://wms.ssc.shopee.vn/v2/returninbound/judgement*// @match        https://wms.ssc.shopee.vn/v2/returninbound/rimassreceive*// @grant        GM_getValue// @grant        GM_setValue// @grant        GM_xmlhttpRequest// @grant        GM_notification// @connect      your-api.company-domain.com// @downloadURL  https://tm-qc-tools.company-domain.com/tracker.user.js// @updateURL    https://tm-qc-tools.company-domain.com/tracker.meta.js// ==/UserScript==
(function () {
  "use strict";
  const CONFIG = {
    VERSION: "1.0.0",
    API_BASE_URL: "https://your-api.company-domain.com",
    LOGIN_INFO_URL:
      "/api/v2/apps/system/user/get_login_info",
    AUTH_ENDPOINT: "/api/qc-productivity/authz",
    LOG_ENDPOINT: "/api/qc-productivity/log",
    DEBUG: false,
    AUTH_CACHE_MS: 5 * 60 * 1000,
    DUPLICATE_WINDOW_MS: 3000,
  };
  const PAGE_CONFIG = {
    qc: {
      pathIncludes: "/v2/returninbound/qc",
      actionText: "Complete",
      requiredFields: ["asn", "return_tn", "order_sn"],
      fields: {
        asn: ["asn"],
        return_tn: ["return tn", "return_tn", "returnno", "return no"],
        order_sn: ["order sn", "order_sn", "ordersn"],
      },
    },
    judgement: {
      pathIncludes: "/v2/returninbound/judgement",
      actionText: "Confirm Judged",
      requiredFields: ["asn", "return_tn", "order_sn", "lmtn", "uid"],
      fields: {
        asn: ["asn"],
        return_tn: ["return tn", "return_tn", "returnno", "return no"],
        order_sn: ["order sn", "order_sn", "ordersn"],
        lmtn: ["lmtn"],
        uid: ["uid"],
      },
    },
    rimassreceive: {
      pathIncludes: "/v2/returninbound/rimassreceive",
      actionText: "Confirm Received",
      requiredFields: [
        "device_id",
        "asn",
        "return_tn",
        "order_sn",
        "lmtn",
        "uid",
      ],
      fields: {
        device_id: ["device id", "device_id", "deviceid"],
        asn: ["asn"],
        return_tn: ["return tn", "return_tn", "returnno", "return no"],
        order_sn: ["order sn", "order_sn", "ordersn"],
        lmtn: ["lmtn"],
        uid: ["uid"],
      },
    },
  };
  function logDebug(...args) {
    if (CONFIG.DEBUG) console.log("[QC Tracker]", ...args);
  }
  function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }
  function nowISO() {
    return new Date().toISOString();
  }
  function getPageType(href) {
    const entry = Object.entries(PAGE_CONFIG).find(([, cfg]) =>
      href.includes(cfg.pathIncludes),
    );
    return entry ? entry[0] : "unknown";
  }
  function getStorage(key, fallback = null) {
    try {
      const value = GM_getValue(key);
      return value === undefined ? fallback : value;
    } catch {
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
  function notify(text) {
    try {
      GM_notification({ title: "QC Productivity Tracker", text });
    } catch (e) {
      logDebug("notify error", e);
    }
  }
  function gmRequest(method, url, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        headers: { "Content-Type": "application/json", ...headers },
        data: data ? JSON.stringify(data) : undefined,
        onload: function (response) {
          try {
            const parsed = response.responseText
              ? JSON.parse(response.responseText)
              : {};
            resolve({ status: response.status, data: parsed });
          } catch {
            resolve({ status: response.status, data: response.responseText });
          }
        },
        onerror: function (error) {
          reject(error);
        },
      });
    });
  }
  async function getCurrentUserEmail() {
    try {
      const resp = await fetch(CONFIG.LOGIN_INFO_URL, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) return "";
      const data = await resp.json();
      if (data?.retcode !== 0) return "";
      return normalizeText(data?.data?.email || "").toLowerCase();
    } catch (e) {
      logDebug("getCurrentUserEmail error", e);
      return "";
    }
  }
  function getInputValueByKeywords(keywords = []) {
    const inputs = Array.from(document.querySelectorAll("input, textarea"));
    for (const el of inputs) {
      const attrs = [
        el.name,
        el.id,
        el.placeholder,
        el.getAttribute("aria-label"),
        el.getAttribute("data-testid"),
      ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());
      const matched = keywords.some((keyword) =>
        attrs.some((attr) => attr.includes(keyword.toLowerCase())),
      );
      if (matched) return normalizeText(el.value || "");
    }
    return "";
  }
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
  function collectFields(pageType) {
    const cfg = PAGE_CONFIG[pageType];
    const result = {
      device_id: "",
      asn: "",
      return_tn: "",
      order_sn: "",
      lmtn: "",
      uid: "",
    };
    if (!cfg) return result;
    Object.entries(cfg.fields).forEach(([field, keywords]) => {
      result[field] = getInputValueByKeywords(keywords);
    });
    return result;
  }
  function makeRecord(pageType, userEmail) {
    return {
      version: CONFIG.VERSION,
      timestamp: nowISO(),
      page: pageType,
      action: PAGE_CONFIG[pageType]?.actionText || "",
      operator: userEmail || "",
      url: location.href,
      ...collectFields(pageType),
    };
  }
  function shouldSkipRecord(record, pageType) {
    const requiredFields = PAGE_CONFIG[pageType]?.requiredFields || [];
    return requiredFields.some((field) => !record[field]);
  }
  async function checkAuthorization(userEmail) {
    if (!userEmail) return { allowed: false, reason: "missing_user_email" };
    const cacheKey = `qc_authz_${userEmail}`;
    const cached = getStorage(cacheKey, null);
    if (cached && cached.expireAt && Date.now() < cached.expireAt) {
      return cached.value;
    }
    try {
      const resp = await gmRequest(
        "POST",
        `${CONFIG.API_BASE_URL}${CONFIG.AUTH_ENDPOINT}`,
        { email: userEmail, page: location.pathname },
      );
      const value = {
        allowed: !!resp?.data?.allowed,
        reason: resp?.data?.reason || "",
        user: resp?.data?.user || null,
        session_token: resp?.data?.session_token || "",
      };
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
  async function sendRecord(record, sessionToken = "") {
    try {
      const headers = {};
      if (sessionToken) headers["X-QC-Session-Token"] = sessionToken;
      const resp = await gmRequest(
        "POST",
        `${CONFIG.API_BASE_URL}${CONFIG.LOG_ENDPOINT}`,
        record,
        headers,
      );
      return resp.status >= 200 && resp.status < 300;
    } catch (e) {
      logDebug("sendRecord error", e);
      const pending = getStorage("qc_pending_logs", []);
      pending.push({ record, sessionToken });
      setStorage("qc_pending_logs", pending);
      return false;
    }
  }
  async function flushPendingLogs() {
    const pending = getStorage("qc_pending_logs", []);
    if (!Array.isArray(pending) || pending.length === 0) return;
    const remain = [];
    for (const item of pending) {
      const ok = await sendRecord(item.record, item.sessionToken || "");
      if (!ok) remain.push(item);
    }
    setStorage("qc_pending_logs", remain);
  }
  async function handleActionClick(pageType, userEmail, sessionToken = "") {
    const record = makeRecord(pageType, userEmail);
    if (shouldSkipRecord(record, pageType)) {
      logDebug("skip record due to missing required fields", record);
      return;
    }
    const fingerprint = [
      record.page,
      record.action,
      record.operator,
      record.device_id,
      record.asn,
      record.return_tn,
      record.order_sn,
      record.lmtn,
      record.uid,
    ].join("|");
    const lastFingerprint = getStorage("qc_last_fingerprint", "");
    const lastTime = getStorage("qc_last_fingerprint_time", 0);
    if (
      fingerprint === lastFingerprint &&
      Date.now() - lastTime < CONFIG.DUPLICATE_WINDOW_MS
    ) {
      logDebug("duplicate record skipped");
      return;
    }
    setStorage("qc_last_fingerprint", fingerprint);
    setStorage("qc_last_fingerprint_time", Date.now());
    const ok = await sendRecord(record, sessionToken);
    logDebug("record sent", ok, record);
  }
  async function init() {
    const pageType = getPageType(location.href);
    if (pageType === "unknown") return;
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      logDebug("cannot detect current user email");
      return;
    }
    const authz = await checkAuthorization(userEmail);
    if (!authz.allowed) {
      logDebug("user not allowed", authz.reason);
      return;
    }
    await flushPendingLogs();
    const bind = () => {
      const button = findActionButton(PAGE_CONFIG[pageType].actionText);
      if (!button || button.dataset.qcTrackerBound === "1") return;
      button.dataset.qcTrackerBound = "1";
      button.addEventListener(
        "click",
        async function () {
          await handleActionClick(
            pageType,
            userEmail,
            authz.session_token || "",
          );
        },
        true,
      );
      logDebug(`bound action button for ${pageType}`);
    };
    bind();
    const observer = new MutationObserver(bind);
    observer.observe(document.body, { childList: true, subtree: true });
  }
  init();
})();
