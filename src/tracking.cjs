// src/tracking.js
const { PAGE_CONFIG } = require("./selectors.cjs");

function createTrackerSource() {
  return `
(function () {
  "use strict";

  const CONFIG = {
    VERSION: "__VERSION__",
    API_BASE_URL: "__API_BASE_URL__",
    LOGIN_INFO_URL:
      "https://wms.ssc.shopee.vn/api/v2/apps/system/user/get_login_info",
    AUTH_ENDPOINT: "/api/qc-productivity/authz",
    LOG_ENDPOINT: "/api/qc-productivity/log",
    DEBUG: true, // Đã bật true để hỗ trợ tracking log hệ thống
    AUTH_CACHE_MS: 5 * 60 * 1000,
    DUPLICATE_WINDOW_MS: 3000,
  };

  const PAGE_CONFIG = ${JSON.stringify(PAGE_CONFIG, null, 2)};
  
  let fieldTimestamps = {};

  function logDebug(...args) {
    if (CONFIG.DEBUG) console.log("[QC Tracker Debug]", ...args);
  }

  function normalizeText(text) {
    return (text || "").replace(/\\s+/g, " ").trim();
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function getTodayKey() {
    return new Date().toISOString().split('T')[0];
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

  // --- HÀM CẬP NHẬT UI ĐẾM SỐ LƯỢNG ĐƠN ---
  function updateFloatingWidget() {
    const today = getTodayKey();
    const stats = getStorage(\`stats_\${today}\`, { qc: 0, judgement: 0, rimassreceive: 0 });
    
    let widget = document.getElementById("qc-tracker-floating-widget");
    if (!widget) {
      widget = document.createElement("div");
      widget.id = "qc-tracker-floating-widget";
      
      const savedPos = getStorage("widget_position", { top: "80px", right: "20px" });
      
      widget.style.cssText = \`
        position: fixed;
        top: \${savedPos.top};
        right: \${savedPos.right};
        left: \${savedPos.left || 'auto'};
        bottom: \${savedPos.bottom || 'auto'};
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
      \`;
      
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
      contentEl.innerHTML = \`
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>1. Đã QC:</span> <strong style="color:#00e676">\${stats.qc}</strong></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>2. Đã Judge:</span> <strong style="color:#29b6f6">\${stats.judgement}</strong></div>
        <div style="display:flex; justify-content:space-between;"><span>3. Đã Nhận:</span> <strong style="color:#ffca28">\${stats.rimassreceive}</strong></div>
      \`;
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

  // --- CƠ CHẾ ĐÁNH CHẶN API HỆ THỐNG ---
  function initApiInterceptor() {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      const url = typeof args[0] === "string" ? args[0] : args[0].url;

      Object.entries(PAGE_CONFIG).forEach(async ([pageType, cfg]) => {
        if (cfg.apiWatchUrl && url.includes(cfg.apiWatchUrl)) {
          try {
            const cloneResp = response.clone();
            const json = await cloneResp.json();
            
            if (json && json.retcode === 0 && json.data && json.data.list && json.data.list.length > 0) {
              const item = json.data.list[0];
              const inboundId = item.inbound_id || item.asn || "";
              const returnTn = item.return_tn || "";

              if (inboundId) {
                console.log(\`%c[QC Tracker - API Intercepted] Bắt được dữ liệu từ API (\${pageType}):\`, "color: #00bcd4; font-weight: bold;", { inboundId, returnTn });
                
                setStorage(\`intercepted_\${pageType}_\${inboundId}\`, {
                  inbound_id: inboundId,
                  return_tn: returnTn,
                  intercepted_at: nowISO()
                });

                if (pageType === "qc") {
                  const lastQcInboundId = getStorage("last_qc_inbound_id", "");
                  if (lastQcInboundId && lastQcInboundId !== inboundId) {
                    const isJudged = getStorage(\`judgement_completed_\${lastQcInboundId}\`, false);
                    if (!isJudged) {
                      alert(\`⚠️ CẢNH BÁO: Đơn [\${lastQcInboundId}] vừa QC xong NHƯNG CHƯA ĐƯỢC thực hiện Judgement! Vui lòng kiểm tra lại quy trình.\`);
                    }
                  }
                  setStorage("last_qc_inbound_id", inboundId);
                }
                
                if (pageType === "judgement") {
                  setStorage(\`judgement_completed_\${inboundId}\`, true);
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

  // --- CHUYỂN ĐỔI SELECTOR LINH HOẠT ---
  function getTargetElement(keyword) {
    if (keyword.startsWith("#") || keyword.startsWith(".") || keyword.startsWith("[")) {
      return document.querySelector(keyword);
    }
    return document.querySelector(\`[data-for="\${keyword}"]\`);
  }

  function setupFieldFocusListeners(pageType) {
    const cfg = PAGE_CONFIG[pageType];
    if (!cfg) return;

    Object.entries(cfg.fields).forEach(([fieldName, keywords]) => {
      for (const keyword of keywords) {
        let inputEl = null;
        const targetEl = getTargetElement(keyword);
        
        if (targetEl) {
          inputEl = (targetEl.tagName === "INPUT" || targetEl.tagName === "TEXTAREA") 
            ? targetEl 
            : targetEl.querySelector("input, textarea");
        }

        if (inputEl && !inputEl.dataset.qcTimeBound) {
          inputEl.dataset.qcTimeBound = "1";
          inputEl.addEventListener("focus", () => {
            if (!fieldTimestamps[fieldName]) {
              fieldTimestamps[fieldName] = nowISO();
            }
          });
        }
      }
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

  // --- LOG KIỂM TRA ĐỌC GIÁ TRỊ INPUT ---
  function getInputValueByKeywords(keywords = []) {
    for (const keyword of keywords) {
      const targetEl = getTargetElement(keyword);
      if (targetEl) {
        let val = "";
        if (targetEl.tagName === "INPUT" || targetEl.tagName === "TEXTAREA") {
          val = normalizeText(targetEl.value || "");
        } else {
          const inputEl = targetEl.querySelector("input, textarea");
          if (inputEl) val = normalizeText(inputEl.value || "");
        }
        console.log(\`%c[QC Tracker - Input Found] Khớp từ khóa: "\${keyword}" -> DOM:\`, "color: #4caf50; font-weight: bold;", targetEl, \`-> Giá trị hiện tại: "\${val}"\`);
        return val;
      } else {
        console.warn(\`%c[QC Tracker - Input Missing] Không tìm thấy phần tử nào khớp với từ khóa: "\${keyword}". Vui lòng kiểm tra lại cấu hình CSS Selector trong selectors.cjs!\`, "color: #ff9800; font-weight: bold;");
      }
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
      scan_value: "",
    };

    if (!cfg) return result;

    Object.entries(cfg.fields).forEach(([field, keywords]) => {
      result[field] = getInputValueByKeywords(keywords);
    });

    return result;
  }

  function makeRecord(pageType, userEmail) {
    const fieldsData = collectFields(pageType);
    const currentScanVal = fieldsData.scan_value;
    const extraApiData = getStorage(\`intercepted_\${pageType}_\${currentScanVal}\`, { inbound_id: "", return_tn: "" });

    return {
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
      console.log("%c[QC Tracker - API Sending] Đang đẩy record lên Database...", "color: #e91e63; font-weight: bold;", record);
      const headers = {};
      if (sessionToken) headers["X-QC-Session-Token"] = sessionToken;

      const resp = await gmRequest(
        "POST",
        CONFIG.API_BASE_URL + CONFIG.LOG_ENDPOINT,
        record,
        headers,
      );

      if (resp.status >= 200 && resp.status < 300) {
        console.log("%c[QC Tracker - API Success] Dữ liệu đã lưu thành công vào Database!", "color: #2e7d32; font-weight: bold; font-size: 12px;");
        return true;
      } else {
        console.error(\`%c[QC Tracker - API Error] Server phản hồi với Http Status \${resp.status}\`, "color: #c62828;", resp.data);
        return false;
      }
    } catch (e) {
      console.error("[QC Tracker - API Crash] Lỗi kết nối mạng khi gửi log:", e);
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

    // --- LOG BÁO HỦY NẾU BỊ THIẾU GIÁ TRỊ ---
    if (shouldSkipRecord(record, pageType)) {
      console.error(\`%c[QC Tracker - Skipped] Bỏ qua record do thiếu trường bắt buộc (\${PAGE_CONFIG[pageType]?.requiredFields?.join(", ")}). Vui lòng check lại selector!\`, "color: #d32f2f; font-weight: bold;", record);
      return;
    }

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
      console.warn("[QC Tracker - Duplicate] Phát hiện trùng lặp thao tác trong thời gian ngắn (3000ms). Hủy lệnh gửi để tránh rác database.");
      return;
    }

    setStorage("qc_last_fingerprint", fingerprint);
    setStorage("qc_last_fingerprint_time", Date.now());

    const success = await sendRecord(record, sessionToken);
    if (success) {
      fieldTimestamps = {};
      
      const today = getTodayKey();
      const stats = getStorage(\`stats_\${today}\`, { qc: 0, judgement: 0, rimassreceive: 0 });
      if (stats.hasOwnProperty(pageType)) {
        stats[pageType] += 1;
        setStorage(\`stats_\${today}\`, stats);
        updateFloatingWidget();
      }
    }
  }

  async function init() {
    initApiInterceptor();

    const pageType = getPageType(location.href);
    
    if (pageType !== "unknown") {
      updateFloatingWidget();
      console.log(\`%c[QC Tracker - Initialized] Đã kích hoạt công cụ theo dõi tại trang: \${pageType}\`, "color: #9c27b0; font-weight: bold; font-size: 13px;");
    } else {
      return;
    }

    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      console.error("[QC Tracker - Auth] Không lấy được thông tin Email người dùng từ hệ thống Shopee.");
      return;
    }

    const authz = await checkAuthorization(userEmail);
    if (!authz.allowed) {
      console.error("[QC Tracker - Auth] Tài khoản không được cấp quyền sử dụng hệ thống tracker hoặc API lỗi:", authz.reason);
      return;
    }

    await flushPendingLogs();

    const bind = () => {
      // 1. Gắn sự kiện click
      const button = findActionButton(PAGE_CONFIG[pageType].actionText);
      if (button && button.dataset.qcTrackerBound !== "1") {
        button.dataset.qcTrackerBound = "1";
        button.addEventListener(
          "click",
          async function () {
            console.log("[QC Tracker - Event] Phát hiện hành động Click chuột vào nút Complete/Confirm.");
            await handleActionClick(pageType, userEmail, authz.session_token || "");
          },
          true,
        );
      }
      
      // 2. Gắn sự kiện keyup bắt phím Enter từ súng PDA Scanner
      if (!document.body.dataset.qcKeyupBound) {
        document.body.dataset.qcKeyupBound = "1";
        document.body.addEventListener("keyup", async function (e) {
          if (e.key === "Enter" || e.keyCode === 13) {
            console.log("%c[QC Tracker - Event] Súng PDA Scanner vừa tít mã (Bắt được phím Enter từ keyup)!", "color: #2196f3; font-weight: bold;");
            
            // Delay 150ms chờ text nạp đủ vào ô input và API hoàn tất trả dữ liệu
            setTimeout(async () => {
              await handleActionClick(pageType, userEmail, authz.session_token || "");
            }, 150);
          }
        }, true);
      }
      
      setupFieldFocusListeners(pageType);
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