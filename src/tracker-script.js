// ==/UserScript==
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

  let fieldTimestamps = {};

  const log = (...args) => CONFIG.DEBUG && console.log("[QC Tracker]", ...args);
  const normalize = (s) => (s || "").replace(/\s+/g, " ").trim();
  const nowISO = () => new Date().toISOString();
  const todayKey = () => new Date().toISOString().split("T")[0];

  const getPageType = (href) => {
    const entry = Object.entries(PAGE_CONFIG).find(([, cfg]) => href.includes(cfg.pathIncludes));
    return entry ? entry[0] : "unknown";
  };

  const getStore = (key, fallback = null) => {
    try { const v = GM_getValue(key); return v === undefined ? fallback : v; } catch { return fallback; }
  };
  const setStore = (key, val) => {
    try { GM_setValue(key, val); } catch {}
  };

  const gmRequest = (method, url, data = null, headers = {}) =>
    new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        headers: { "Content-Type": "application/json", ...headers },
        data: data ? JSON.stringify(data) : undefined,
        onload: (resp) => {
          if (resp.status < 200 || resp.status >= 300) return reject(new Error(`HTTP ${resp.status}`));
          try { resolve({ status: resp.status, data: JSON.parse(resp.responseText || "{}") }); } catch { reject(new Error("Invalid JSON")); }
        },
        onerror: reject,
        ontimeout: () => reject(new Error("Timeout")),
        timeout: 10000,
      });
    });

  // ----- Widget (draggable, bounded) -----
  const enforceBounds = (el) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let top = parseFloat(el.style.top) || 0, left = parseFloat(el.style.left) || 0;
    if (el.style.right !== "auto") {
      left = vw - rect.width - parseFloat(el.style.right);
      el.style.left = left + "px";
      el.style.right = "auto";
    }
    if (el.style.bottom !== "auto") {
      top = vh - rect.height - parseFloat(el.style.bottom);
      el.style.top = top + "px";
      el.style.bottom = "auto";
    }
    top = Math.max(0, Math.min(top, vh - rect.height));
    left = Math.max(0, Math.min(left, vw - rect.width));
    el.style.top = top + "px";
    el.style.left = left + "px";
    setStore("widget_position", { top: top + "px", left: left + "px" });
  };

  const makeDraggable = (elm, header) => {
    let p1 = 0, p2 = 0, p3 = 0, p4 = 0;
    const dragStart = (e) => {
      e = e || window.event; e.preventDefault();
      p3 = e.clientX; p4 = e.clientY;
      document.onmouseup = dragEnd;
      document.onmousemove = dragMove;
    };
    const dragMove = (e) => {
      e = e || window.event; e.preventDefault();
      p1 = p3 - e.clientX; p2 = p4 - e.clientY;
      p3 = e.clientX; p4 = e.clientY;
      let top = elm.offsetTop - p2, left = elm.offsetLeft - p1;
      const rect = elm.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      top = Math.max(0, Math.min(top, vh - rect.height));
      left = Math.max(0, Math.min(left, vw - rect.width));
      elm.style.top = top + "px";
      elm.style.left = left + "px";
      elm.style.right = "auto";
      elm.style.bottom = "auto";
    };
    const dragEnd = () => {
      document.onmouseup = null;
      document.onmousemove = null;
      setStore("widget_position", { top: elm.style.top, left: elm.style.left });
    };
    header.onmousedown = dragStart;
  };

  const updateWidget = () => {
    const stats = getStore(`stats_${todayKey()}`, { qc: 0, judgement: 0, rimassreceive: 0 });
    const defaultPos = { top: "80px", left: "20px" };
    let pos = getStore("widget_position", defaultPos);
    if (!pos || !pos.top || !pos.left) pos = { ...defaultPos };

    let widget = document.getElementById("qc-tracker-floating-widget");
    if (!widget) {
      widget = document.createElement("div");
      widget.id = "qc-tracker-floating-widget";
      widget.style.cssText = `
        position: fixed;
        top: ${pos.top}; left: ${pos.left}; right: auto; bottom: auto;
        width: 200px;
        background: rgba(33,33,33,0.9); color: #fff;
        padding: 12px; border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 999999;
        font-family: Arial, sans-serif; font-size: 13px;
        user-select: none; border: 1px solid #ff5722;
      `;
      const header = document.createElement("div");
      header.id = "qc-tracker-widget-header";
      header.innerText = "📊 NĂNG SUẤT HÔM NAY";
      header.style.cssText =
        "font-weight:bold; border-bottom:1px solid #555; padding-bottom:6px; margin-bottom:8px; cursor:move; color:#ff5722; text-align:center;";
      widget.appendChild(header);
      const content = document.createElement("div");
      content.id = "qc-tracker-widget-content";
      widget.appendChild(content);
      document.body.appendChild(widget);
      makeDraggable(widget, header);
      enforceBounds(widget);
    } else {
      enforceBounds(widget);
    }

    const content = document.getElementById("qc-tracker-widget-content");
    if (content) {
      content.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>1. Đã QC:</span> <strong style="color:#00e676">${stats.qc}</strong></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>2. Đã Judge:</span> <strong style="color:#29b6f6">${stats.judgement}</strong></div>
        <div style="display:flex; justify-content:space-between;"><span>3. Đã Nhận:</span> <strong style="color:#ffca28">${stats.rimassreceive}</strong></div>
      `;
    }
  };

  // ----- Interceptor -----
  const initInterceptor = () => {
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await origFetch.apply(this, args);
      const url = typeof args[0] === "string" ? args[0] : args[0].url;

      if (url && url.includes("/api/v2/apps/system/user/get_login_info")) {
        try {
          const clone = response.clone();
          const json = await clone.json();
          if (json?.retcode === 0 && json?.data?.email) {
            const email = normalize(json.data.email).toLowerCase();
            setStore("user_email", email);
            setStore("user_email_timestamp", Date.now());
            log("Intercepted login email:", email);
          }
        } catch (e) {}
      }

      Object.entries(PAGE_CONFIG).forEach(([pageType, cfg]) => {
        if (cfg.apiWatchUrl && url && url.includes(cfg.apiWatchUrl)) {
          (async () => {
            try {
              const clone = response.clone();
              const json = await clone.json();
              if (json?.retcode === 0 && json?.data?.list?.length) {
                const item = json.data.list[0];
                const id = item.inbound_id || item.asn || "";
                const returnTn = item.return_tn || "";
                if (id) {
                  setStore(`intercepted_${pageType}_${id}`, { inbound_id: id, return_tn: returnTn, intercepted_at: nowISO() });
                  if (pageType === "qc") {
                    const lastId = getStore("last_qc_inbound_id", "");
                    if (lastId && lastId !== id) {
                      const judged = getStore(`judgement_completed_${lastId}`, false);
                      if (!judged) {
                        alert(`⚠️ CẢNH BÁO: Đơn [${lastId}] vừa QC xong NHƯNG CHƯA ĐƯỢC Judgement!`);
                      }
                    }
                    setStore("last_qc_inbound_id", id);
                  }
                  if (pageType === "judgement") {
                    setStore(`judgement_completed_${id}`, true);
                  }
                }
              }
            } catch (e) {}
          })();
        }
      });

      return response;
    };
  };

  // ----- Get Email (localStorage + GM cache, no fetch) -----
  const getEmail = () => {
    try {
      const keys = ['user_email', 'email', 'user', 'userInfo', 'profile'];
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
            log("Email from localStorage/sessionStorage:", email);
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

  // ----- Field extraction -----
  const getInputByKeywords = (keywords = []) => {
    for (const kw of keywords) {
      if (kw.startsWith("#")) {
        const target = document.querySelector(kw);
        if (target) {
          const input = target.tagName === "INPUT" || target.tagName === "TEXTAREA" ? target : target.querySelector("input, textarea");
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

  const collectFields = (pageType) => {
    const cfg = PAGE_CONFIG[pageType];
    if (!cfg) return { device_id: "", scan_value: "" };
    const result = {};
    Object.entries(cfg.fields).forEach(([field, keywords]) => {
      result[field] = getInputByKeywords(keywords);
    });
    return result;
  };

  // ----- Action button -----
  const findActionButton = (text) => {
    const btns = Array.from(document.querySelectorAll("button"));
    return btns.find((b) => normalize(b.innerText).toLowerCase() === text.toLowerCase()) || null;
  };

  // ----- Record & send (token sent in body) -----
  const makeRecord = (pageType, userEmail) => {
    const fields = collectFields(pageType);
    const scanVal = fields.scan_value || "";
    const extra = getStore(`intercepted_${pageType}_${scanVal}`, { inbound_id: "", return_tn: "" });
    return {
      version: CONFIG.VERSION,
      timestamp: nowISO(),
      page: pageType,
      action: PAGE_CONFIG[pageType]?.actionText || "",
      operator: userEmail,
      url: location.href,
      ...fields,
      api_inbound_id: extra.inbound_id,
      api_return_tn: extra.return_tn,
      field_timestamps: { ...fieldTimestamps },
    };
  };

  const shouldSkip = (record, pageType) => {
    const required = PAGE_CONFIG[pageType]?.requiredFields || [];
    return required.some((f) => !record[f]);
  };

  const sendRecord = async (record, sessionToken = "") => {
    try {
      // Gửi token trong body thay vì header để tránh bị cắt
      const payload = { ...record, session_token: sessionToken };
      const resp = await gmRequest("POST", CONFIG.API_BASE_URL + CONFIG.LOG_ENDPOINT, payload);
      log("Log sent, status:", resp.status);
      return true;
    } catch (e) {
      log("Send failed, queued:", e);
      const pending = getStore("qc_pending_logs", []);
      pending.push({ record, sessionToken });
      setStore("qc_pending_logs", pending);
      return false;
    }
  };

  const flushPending = async () => {
    const pending = getStore("qc_pending_logs", []);
    if (!pending.length) return;
    log(`Flushing ${pending.length} pending logs`);
    const remain = [];
    for (const item of pending) {
      const ok = await sendRecord(item.record, item.sessionToken || "");
      if (!ok) remain.push(item);
    }
    setStore("qc_pending_logs", remain);
  };

  // ----- AuthZ -----
  const checkAuth = async (email) => {
    if (!email) return { allowed: false, reason: "missing_email" };
    const cacheKey = "qc_authz_" + email;
    const cached = getStore(cacheKey, null);
    if (cached && cached.expireAt && Date.now() < cached.expireAt) {
      return cached.value;
    }
    try {
      const resp = await gmRequest("POST", CONFIG.API_BASE_URL + CONFIG.AUTH_ENDPOINT, { email, page: location.pathname });
      const value = {
        allowed: !!resp?.data?.allowed,
        reason: resp?.data?.reason || "",
        session_token: resp?.data?.session_token || "",
      };
      setStore(cacheKey, { expireAt: Date.now() + CONFIG.AUTH_CACHE_MS, value });
      return value;
    } catch {
      return { allowed: false, reason: "authz_error" };
    }
  };

  // ----- Handle click -----
  const handleAction = async (pageType, userEmail, sessionToken) => {
    const record = makeRecord(pageType, userEmail);
    if (shouldSkip(record, pageType)) {
      log("Skipped due to missing required fields");
      return;
    }

    const fingerprint = [record.page, record.action, record.operator, record.device_id, record.scan_value].join("|");
    const lastFinger = getStore("qc_last_fingerprint", "");
    const lastTime = getStore("qc_last_fingerprint_time", 0);
    if (fingerprint === lastFinger && Date.now() - lastTime < CONFIG.DUPLICATE_WINDOW_MS) {
      log("Duplicate within window, skipped");
      return;
    }
    setStore("qc_last_fingerprint", fingerprint);
    setStore("qc_last_fingerprint_time", Date.now());

    const ok = await sendRecord(record, sessionToken);
    if (ok) {
      fieldTimestamps = {};
      const stats = getStore(`stats_${todayKey()}`, { qc: 0, judgement: 0, rimassreceive: 0 });
      if (stats.hasOwnProperty(pageType)) {
        stats[pageType] += 1;
        setStore(`stats_${todayKey()}`, stats);
        updateWidget();
      }
    }
  };

  // ----- Focus listeners -----
  const setupFocus = (pageType) => {
    const cfg = PAGE_CONFIG[pageType];
    if (!cfg) return;
    Object.entries(cfg.fields).forEach(([field, keywords]) => {
      for (const kw of keywords) {
        let input = null;
        if (kw.startsWith("#")) {
          const target = document.querySelector(kw);
          if (target) input = target.tagName === "INPUT" || target.tagName === "TEXTAREA" ? target : target.querySelector("input, textarea");
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

  // ----- Init -----
  const init = async () => {
    log("Initializing...");
    initInterceptor();

    const pageType = getPageType(location.href);
    if (pageType === "unknown") {
      log("Unsupported page");
      return;
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

    const bindButton = () => {
      const btn = findActionButton(PAGE_CONFIG[pageType]?.actionText);
      if (btn && !btn.dataset.qcTrackerBound) {
        btn.dataset.qcTrackerBound = "1";
        btn.addEventListener("click", () => {
          log("Action button clicked");
          handleAction(pageType, email, auth.session_token || "");
        }, true);
        log("Button bound");
      }
      setupFocus(pageType);
    };

    bindButton();

    const observer = new MutationObserver(() => {
      const btn = findActionButton(PAGE_CONFIG[pageType]?.actionText);
      if (btn && !btn.dataset.qcTrackerBound) {
        bindButton();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    log("Init complete");
  };

  if (typeof GM_xmlhttpRequest === "undefined" || typeof GM_setValue === "undefined") {
    console.warn("[QC Tracker] Tampermonkey APIs missing");
    return;
  }

  init().catch((e) => console.error("[QC Tracker] Fatal:", e));
})();