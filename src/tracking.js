const { PAGE_CONFIG } = require("./selectors");

function createTrackerSource() {
 return `
(function () {
  "use strict";

  const CONFIG = {
    VERSION: "__VERSION__",
    API_BASE_URL: "__API_BASE_URL__",
    LOGIN_INFO_URL:
      "/api/v2/apps/system/user/get_login_info",
    AUTH_ENDPOINT: "/api/qc-productivity/authz",
    LOG_ENDPOINT: "/api/qc-productivity/log",
    DEBUG: false,
    AUTH_CACHE_MS: 5 * 60 * 1000,
    DUPLICATE_WINDOW_MS: 3000,
  };

   const PAGE_CONFIG = ${JSON.stringify(PAGE_CONFIG, null, 2)};

  function logDebug(...args) {
    if (CONFIG.DEBUG) console.log("[QC Tracker]", ...args);
  }

  function normalizeText(text) {
    return (text || "").replace(/\\s+/g, " ").trim();
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

  function gmRequest(method, url, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
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
        headers: {
          Accept: "application/json",
        },
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

    const cacheKey = "qc_authz_" + userEmail;
    const cached = getStorage(cacheKey, null);

    if (cached && cached.expireAt && Date.now() < cached.expireAt) {
      return cached.value;
    }

    try {
      const resp = await gmRequest(
        "POST",
        CONFIG.API_BASE_URL + CONFIG.AUTH_ENDPOINT,
        {
          email: userEmail,
          page: location.pathname,
        },
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
        CONFIG.API_BASE_URL + CONFIG.LOG_ENDPOINT,
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

    await sendRecord(record, sessionToken);
  }

  async function init() {
    const pageType = getPageType(location.href);
    if (pageType === "unknown") return;

    const userEmail = await getCurrentUserEmail();
    if (!userEmail) return;

    const authz = await checkAuthorization(userEmail);
    if (!authz.allowed) return;

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
    };

    bind();

    const observer = new MutationObserver(bind);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  init();
})();
`;
}

module.exports = {
  createTrackerSource,
};
