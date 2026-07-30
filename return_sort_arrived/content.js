let masterDataMap = {};
const processedSet = new Set();
let cachedOperatorEmail = "";
let statusPanelVisible = true;

// =====================================================
// Operator email
// =====================================================
function getWmsCurrentUserEmail() {
  const candidates = Array.from(document.querySelectorAll("body *"))
    .map((el) => {
      const text = (el.innerText || el.textContent || "").trim();
      const rect = el.getBoundingClientRect();
      return { text, rect };
    })
    .filter(
      (item) =>
        item.text.includes("@") &&
        item.rect.top >= 0 &&
        item.rect.top < 180 &&
        item.rect.right > window.innerWidth * 0.65,
    );

  for (const item of candidates) {
    const match = item.text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (match) return match[0];
  }

  const allText = document.body?.innerText || "";
  const match = allText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : "";
}

function initOperatorEmail() {
  cachedOperatorEmail = getWmsCurrentUserEmail() || "unknown";
  console.log("Operator email:", cachedOperatorEmail);

  let retry = 0;
  const timer = setInterval(() => {
    const email = getWmsCurrentUserEmail();
    if (email && email !== "unknown") {
      cachedOperatorEmail = email;
      console.log("Operator email updated:", cachedOperatorEmail);
      clearInterval(timer);
      updateStatusPanel({ operator: cachedOperatorEmail });
      return;
    }

    retry++;
    if (retry >= 10) clearInterval(timer);
  }, 500);
}

// =====================================================
// Helpers
// =====================================================
function normalizeRV(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

function translateReason(reason) {
  const r = String(reason || "").trim();

  const map = {
    "not found in master data": "Không có trong master data",
    "Complete button not found": "Không tìm thấy nút Complete",
    "matched master data and clicked complete":
      "Đã khớp master data và bấm Complete",
    "matched but complete button not found":
      "Khớp master data nhưng không tìm thấy nút Complete",
    "top input not found": "Không tìm thấy ô nhập phía trên",
    "already processed": "Đã xử lý trước đó",
    "Master data matched, waiting complete":
      "Đã khớp master data, chờ Complete",
    "log failed": "Ghi log thất bại",
    "scan input not found": "Không tìm thấy ô scan",
    "Load master data failed": "Không tải được master data",
  };

  return map[r] || r || "-";
}

function getTypeStyle(typeRaw) {
  const type = String(typeRaw || "")
    .trim()
    .toUpperCase();

  const map = {
    "450K-NA": { color: "#722ed1", bg: "#f9f0ff" },
    FBS_STANDARD: { color: "#1677ff", bg: "#e6f4ff" },
    CB: { color: "#13c2c2", bg: "#e6fffb" },
    "450K-NA-COM": { color: "#eb2f96", bg: "#fff0f6" },
    "SBS-RESELL": { color: "#fa8c16", bg: "#fff7e6" },
    FBS_PREMIUM: { color: "#52c41a", bg: "#f6ffed" },
    SBS: { color: "#fa541c", bg: "#fff2e8" },
    "WH QC": { color: "#595959", bg: "#f5f5f5" },
    "L'OREAL GTC": { color: "#8b0000", bg: "#fff1f0" },
    "L'OREAL": { color: "#c41d7f", bg: "#fff0f6" },
    "FBS_STANDARD-GTC": { color: "#8b0000", bg: "#fff1f0" },
    "SBS - GTC": { color: "#8b0000", bg: "#fff1f0" },
    "FBS_PREMIUM - GTC": { color: "#8b0000", bg: "#fff1f0" },
    "GIỮ LẠI ĐƠN NÀY": { color: "#cf1322", bg: "#fff1f0" },
    FBS_VINAMILK: { color: "#2f54eb", bg: "#f0f5ff" },
    "SBS-RESELL - GTC": { color: "#8b0000", bg: "#fff1f0" },
    "CB - GTC": { color: "#8b0000", bg: "#fff1f0" },
    "CHECK TYPE LẠI": { color: "#8c8c8c", bg: "#f5f5f5" },
  };

  const normalized = type
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-")
    .trim();

  // Ưu tiên đỏ đậm nếu có GTC
  if (type.includes("GTC") || normalized.includes("GTC")) {
    return { color: "#8b0000", bg: "#fff1f0" };
  }

  return map[type] || map[normalized] || { color: "#222", bg: "#f5f5f5" };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function setNativeValue(el, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    el.__proto__,
    "value",
  )?.set;
  const prototype = Object.getPrototypeOf(el);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(
    prototype,
    "value",
  )?.set;

  if (prototypeValueSetter) {
    prototypeValueSetter.call(el, value);
  } else if (valueSetter) {
    valueSetter.call(el, value);
  } else {
    el.value = value;
  }
}

function playBeep(isSuccess = false) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.type = "sine";
    oscillator.frequency.value = isSuccess ? 880 : 220;
    gain.gain.value = 0.08;

    oscillator.start();
    setTimeout(() => {
      oscillator.stop();
      ctx.close();
    }, 180);
  } catch (e) {
    console.warn("Beep failed:", e);
  }
}

// =====================================================
// Small banner
// =====================================================
function showStatusBanner(message, color = "#1677ff") {
  let overlay = document.getElementById("rv-auto-banner");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "rv-auto-banner";
    overlay.style.cssText = `  
      position: fixed;  
      top: 20px;  
      right: 20px;  
      z-index: 999998;  
      min-width: 260px;  
      max-width: 420px;  
      background: ${color};  
      color: white;  
      padding: 12px 16px;  
      border-radius: 10px;  
      font-size: 14px;  
      font-weight: 700;  
      box-shadow: 0 6px 18px rgba(0,0,0,0.25);  
      line-height: 1.4;  
      white-space: pre-line;  
    `;
    document.body.appendChild(overlay);
  }

  overlay.style.background = color;
  overlay.textContent = message;

  clearTimeout(window.__rvBannerTimer);
  window.__rvBannerTimer = setTimeout(() => {
    overlay.remove();
  }, 2500);
}

// =====================================================
// Status panel UI
// =====================================================
function createStatusPanel() {
  let panel = document.getElementById("rv-status-panel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "rv-status-panel";
  panel.style.cssText = `  
    position: fixed;  
    top: 300px;  
    left: 50%;  
    transform: translateX(-50%);  
    z-index: 999999;  
    width: 820px;  
    max-width: calc(100vw - 24px);  
    background: rgba(255, 255, 255, 0.98);  
    border: 2px solid #1677ff;  
    border-radius: 14px;  
    box-shadow: 0 8px 24px rgba(0,0,0,0.18);  
    font-family: Arial, sans-serif;  
    overflow: hidden;  
  `;

  panel.innerHTML = `  
    <div id="rv-status-header" style="  
      display:flex;  
      align-items:center;  
      justify-content:space-between;  
      padding:14px 16px;  
      background:#1677ff;  
      color:white;  
      font-weight:700;  
      font-size:16px;  
    ">  
      <div>RV Auto Arrived Status</div>  
      <button id="rv-toggle-btn" style="  
        border:none;  
        background:#fff;  
        color:#1677ff;  
        padding:6px 14px;  
        border-radius:8px;  
        cursor:pointer;  
        font-weight:700;  
        font-size:14px;  
      ">Ẩn</button>  
    </div>  
  
    <div id="rv-status-body" style="padding:22px 22px 18px; color:#222;">  
      <div style="  
        display:grid;  
        grid-template-columns: 140px 1fr;  
        gap:14px 18px;  
        font-size:18px;  
        line-height:1.8;  
      ">  
        <div><b>RV</b></div>  
        <div id="rv-panel-rv" style="font-weight:800; font-size:20px;">-</div>  
  
        <div><b>Type</b></div>  
        <div id="rv-panel-type" style="font-weight:800; font-size:20px;">-</div>  
  
        <div><b>Result</b></div>  
        <div id="rv-panel-result" style="font-weight:700; font-size:16px;">-</div>  
  
        <div><b>Lý do</b></div>  
        <div id="rv-panel-reason" style="font-weight:700; font-size:18px;">-</div>  
  
        <div><b>Operator</b></div>  
        <div id="rv-panel-operator" style="font-weight:700; font-size:18px;">-</div>  
      </div>  
  
      <div style="  
        margin-top:16px;  
        padding-top:12px;  
        border-top:1px solid #eee;  
        font-size:13px;  
        color:#888;  
      ">  
        Scan RV để xem trạng thái xử lý  
      </div>  
    </div>  
  `;

  document.body.appendChild(panel);

  panel
    .querySelector("#rv-toggle-btn")
    .addEventListener("click", () => toggleStatusPanel());
  return panel;
}

function toggleStatusPanel(force) {
  const panel = createStatusPanel();
  const body = panel.querySelector("#rv-status-body");
  const btn = panel.querySelector("#rv-toggle-btn");

  if (typeof force === "boolean") {
    statusPanelVisible = force;
  } else {
    statusPanelVisible = !statusPanelVisible;
  }

  if (statusPanelVisible) {
    body.style.display = "block";
    btn.textContent = "Ẩn";
    panel.style.width = "820px";
  } else {
    body.style.display = "none";
    btn.textContent = "Hiện";
    panel.style.width = "220px";
  }
}

function updateStatusPanel(data = {}) {
  const panel = createStatusPanel();

  const rvEl = panel.querySelector("#rv-panel-rv");
  const typeEl = panel.querySelector("#rv-panel-type");
  const resultEl = panel.querySelector("#rv-panel-result");
  const reasonEl = panel.querySelector("#rv-panel-reason");
  const operatorEl = panel.querySelector("#rv-panel-operator");

  if (rvEl && typeof data.rv !== "undefined") rvEl.textContent = data.rv || "-";
  if (typeEl && typeof data.type !== "undefined")
    typeEl.textContent = data.type || "-";
  if (resultEl && typeof data.result !== "undefined")
    resultEl.textContent = data.result || "-";
  if (reasonEl && typeof data.reason !== "undefined")
    reasonEl.textContent = translateReason(data.reason);
  if (operatorEl && typeof data.operator !== "undefined")
    operatorEl.textContent = data.operator || "-";

  // Result: chữ nhỏ hơn, không đổi màu
  if (resultEl && typeof data.result !== "undefined") {
    resultEl.style.color = "#444";
    resultEl.style.fontWeight = "700";
    resultEl.style.fontSize = "16px";
    resultEl.style.background = "transparent";
    resultEl.style.padding = "0";
  }

  // Type: to hơn, GTC đỏ đậm
  if (typeEl && typeof data.type !== "undefined") {
    const style = getTypeStyle(data.type);

    typeEl.style.color = style.color;
    typeEl.style.background = style.bg;
    typeEl.style.fontWeight = "900";
    typeEl.style.fontSize = "24px";
    typeEl.style.display = "inline-block";
    typeEl.style.padding = "3px 12px";
    typeEl.style.borderRadius = "10px";
    typeEl.style.lineHeight = "1.4";
  }

  [rvEl, reasonEl, operatorEl].forEach((el) => {
    if (el) {
      el.style.fontSize = "18px";
      el.style.fontWeight = "700";
    }
  });
}

// =====================================================
// Logging
// =====================================================
function logScan(payload) {
  const operator = cachedOperatorEmail || getWmsCurrentUserEmail() || "unknown";

  chrome.runtime.sendMessage(
    {
      action: "logScan",
      payload: {
        ...payload,
        operator,
      },
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.warn("Log failed:", chrome.runtime.lastError.message);
        updateStatusPanel({
          result: "ERROR",
          reason: "log failed",
          operator,
        });
        return;
      }

      console.log("LOG RESPONSE:", response);

      if (!response?.success) {
        console.warn("Log failed:", response?.error);
        updateStatusPanel({
          result: "ERROR",
          reason: response?.error || "log failed",
          operator,
        });
      }
    },
  );
}

// =====================================================
// WMS scan input / elements
// =====================================================
function allVisibleInputs() {
  return Array.from(document.querySelectorAll("input, textarea")).filter(
    isVisible,
  );
}

function scoreInput(el) {
  let score = 0;

  const ph = String(el.getAttribute("placeholder") || "").toLowerCase();
  const name = String(el.getAttribute("name") || "").toLowerCase();
  const aria = String(el.getAttribute("aria-label") || "").toLowerCase();
  const cls = String(el.className || "").toLowerCase();
  const parentText = (el.parentElement?.textContent || "").toLowerCase();

  if (ph.includes("please input")) score += 100;
  if (ph.includes("input")) score += 30;
  if (name.includes("scan")) score += 20;
  if (aria.includes("input")) score += 10;
  if (cls.includes("input")) score += 5;

  if (parentText.includes("lmtn/asn/uid/order no/return tn")) score += 80;
  if (parentText.includes("please input")) score += 50;

  const rect = el.getBoundingClientRect();
  if (rect.top >= 0 && rect.top < 300) score += 20;
  if (rect.width > 150) score += 5;

  return score;
}

function findTopScanInput() {
  const inputs = allVisibleInputs();
  if (!inputs.length) return null;

  const scored = inputs.map((el) => ({
    el,
    score: scoreInput(el),
    top: el.getBoundingClientRect().top,
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.top - b.top;
  });

  return scored[0]?.el || null;
}

function findCompleteButton() {
  const buttons = Array.from(document.querySelectorAll("button")).filter(
    isVisible,
  );

  return (
    buttons.find((btn) => {
      const txt = (btn.innerText || btn.textContent || "").trim().toLowerCase();
      return txt === "complete" || txt.includes("complete");
    }) || null
  );
}

// =====================================================
// Master data
// =====================================================
function getMatchedType(rv) {
  return masterDataMap[normalizeRV(rv)] || "";
}

// =====================================================
// Core flow
// =====================================================
async function clickCompleteButton() {
  const btn = findCompleteButton();

  if (!btn) {
    updateStatusPanel({
      result: "REJECT",
      reason: "Complete button not found",
      operator: cachedOperatorEmail || "unknown",
    });
    playBeep(false);
    return false;
  }

  btn.click();
  return true;
}

async function autoProcess(rv, type) {
  const input = findTopScanInput();

  if (!input) {
    updateStatusPanel({
      rv,
      type,
      result: "REJECT",
      reason: "top input not found",
      operator: cachedOperatorEmail || "unknown",
    });

    playBeep(false);
    logScan({
      rv,
      type,
      result: "REJECT",
      reason: "top input not found",
    });
    return;
  }

  input.focus();
  setNativeValue(input, rv);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));

  updateStatusPanel({
    rv,
    type,
    result: "MATCHED",
    reason: "Master data matched, waiting complete",
    operator: cachedOperatorEmail || "unknown",
  });

  showStatusBanner(`Matched\nRV: ${rv}\nType: ${type || "-"}`, "#1677ff");
  playBeep(true);

  await sleep(800);

  const clicked = await clickCompleteButton();

  if (clicked) {
    updateStatusPanel({
      rv,
      type,
      result: "PASS",
      reason: "matched master data and clicked complete",
      operator: cachedOperatorEmail || "unknown",
    });

    logScan({
      rv,
      type,
      result: "PASS",
      reason: "matched master data and clicked complete",
    });

    showStatusBanner(`Completed\nRV: ${rv}\nType: ${type || "-"}`, "#52c41a");
    playBeep(true);
  } else {
    logScan({
      rv,
      type,
      result: "REJECT",
      reason: "matched but complete button not found",
    });
  }
}

function rejectScan(rv) {
  updateStatusPanel({
    rv,
    type: "-",
    result: "REJECT",
    reason: "not found in master data",
    operator: cachedOperatorEmail || "unknown",
  });

  showStatusBanner(`Không có trong master data:\n${rv}`, "#ff4d4f");
  playBeep(false);

  logScan({
    rv,
    type: "",
    result: "REJECT",
    reason: "not found in master data",
  });
}

async function handleScan(rawValue) {
  const rv = normalizeRV(rawValue);
  if (!rv) return;

  const type = getMatchedType(rv);

  console.log("SCAN RV:", rv);
  console.log("MATCH TYPE:", type);

  updateStatusPanel({
    rv,
    type: type || "-",
    result: type ? "MATCHED" : "REJECT",
    reason: type ? "Found in master data" : "Not found in master data",
    operator: cachedOperatorEmail || "unknown",
  });

  if (processedSet.has(rv)) {
    updateStatusPanel({
      rv,
      type: type || "-",
      result: "DUPLICATE",
      reason: "already processed",
      operator: cachedOperatorEmail || "unknown",
    });

    playBeep(false);
    logScan({
      rv,
      type,
      result: "DUPLICATE",
      reason: "already processed",
    });
    return;
  }

  if (type) {
    processedSet.add(rv);
    await autoProcess(rv, type);
  } else {
    rejectScan(rv);
  }
}

// =====================================================
// Listener attach
// =====================================================
function attachListener() {
  let retry = 0;
  const maxRetry = 40;

  const timer = setInterval(() => {
    const input = findTopScanInput();

    if (input) {
      clearInterval(timer);

      console.log("Scan listener attached to:", input);

      input.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const value = input.value;
          input.value = "";
          await handleScan(value);
        }
      });

      updateStatusPanel({
        rv: "-",
        type: "-",
        result: "READY",
        reason: "Waiting for scan",
        operator: cachedOperatorEmail || "unknown",
      });

      showStatusBanner("RV tool ready", "#1677ff");
      return;
    }

    retry++;
    if (retry >= maxRetry) {
      clearInterval(timer);
      console.warn("Không tìm thấy ô scan input sau nhiều lần retry");
      updateStatusPanel({
        result: "ERROR",
        reason: "scan input not found",
        operator: cachedOperatorEmail || "unknown",
      });
      showStatusBanner("Không tìm thấy ô scan input", "#ff4d4f");
      playBeep(false);
    }
  }, 1000);
}

// =====================================================
// Init
// =====================================================
function init() {
  initOperatorEmail();
  createStatusPanel();

  chrome.runtime.sendMessage({ action: "getMasterDataMap" }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn(
        "Load master data failed:",
        chrome.runtime.lastError.message,
      );
      updateStatusPanel({
        result: "ERROR",
        reason: "Load master data failed",
        operator: cachedOperatorEmail || "unknown",
      });
      showStatusBanner("Không load được master data", "#ff4d4f");
      playBeep(false);
      return;
    }

    if (response?.success) {
      masterDataMap = response.data || {};
      console.log("Master data loaded:", masterDataMap);
      attachListener();
    } else {
      console.warn("Load master data failed:", response?.error);
      updateStatusPanel({
        result: "ERROR",
        reason: response?.error || "Unknown",
        operator: cachedOperatorEmail || "unknown",
      });
      showStatusBanner("Không load được master data", "#ff4d4f");
      playBeep(false);
    }
  });
}

init();
