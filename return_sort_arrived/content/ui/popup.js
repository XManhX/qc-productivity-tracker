// content/ui/popup.js – Popup chính Arrival, tích hợp Dashboard
import { printLabel } from "../printer.js";
import { DashboardUI } from "./dashboard.js";

/**
 * Màu nền cho từng mã trạm (station_id).
 * Key: station_id (dạng string "1".."9","A".."D")
 * Value: mã màu hex
 */
const STATION_COLORS = {
  1: "#E74C3C", // NA, NA-COM
  2: "#3498DB", // CB, WH-QC
  3: "#2ECC71", // CB-GTC
  4: "#F39C12", // FBS_Premium-B
  5: "#9B59B6", // FBS_Standard-A
  6: "#1ABC9C", // FBS_Standard-B
  7: "#E67E22", // FBS_Vinamilk
  8: "#2C3E50", // Wrong-A
  9: "#E91E63", // Wrong-B
  A: "#00BCD4", // L'Oreal
  B: "#FF5722", // SBS-B
  C: "#795548", // SBS-GTC
  D: "#607D8B", // SBS-Resell
};

const getLuminance = (hex) => {
  const [r, g, b] = hex.match(/\w\w/g).map((c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastRatio = (l1, l2) =>
  (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

const getTextColor = (bgHex) => {
  const lum = getLuminance(bgHex);
  return contrastRatio(lum, 0) >= 4.5 ? "#000000" : "#FFFFFF";
};

const STYLES = `
:host { all: initial; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
.popup {
  position: fixed; width: 630px; background: #fff;
  border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.2), 0 0 0 2px rgba(0,0,0,0.05);
  z-index: 999999; overflow: hidden;
  display: flex; flex-direction: column;
  top: 50px; left: 50px;
  transition: height 0.3s ease;
}
.popup.minimized {
  width: 56px; height: 56px; border-radius: 50%; cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  right: 20px; bottom: 20px; left: auto; top: auto;
}
.header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px; background: #1E293B; color: white;
  cursor: move; user-select: none;
}
.minimized .header {
  padding: 0; justify-content: center; width: 56px; height: 56px; border-radius: 50%;
  cursor: pointer; background: #1E293B; position: relative; overflow: hidden;
}
.minimized .header > * { display: none !important; }
.minimized .header::after {
  content: attr(data-current-id);
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  font-size: 24px; font-weight: 700; color: white;
}
.header-left { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 0; }
.title-row { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 16px; }
.top-row {
  display: flex; align-items: center; gap: 6px;
  flex-wrap: nowrap; overflow: visible;
}
.badge-card {
  border-radius: 14px; padding: 6px 8px; width: 88px;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  flex-shrink: 0; transition: filter 0.2s, box-shadow 0.2s;
  font-weight: 800; cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.25);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}
.badge-card.placeholder {
  background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.4);
  cursor: default;
}
.badge-card:hover:not(.placeholder) {
  filter: brightness(1.2);
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.badge-id { font-size: 30px; line-height: 1; margin: 4px 0; }
.badge-type {
  font-size: 12px; font-weight: 600; opacity: 0.9; line-height: 1; letter-spacing: 0.5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px;
}
.badge-count {  font-size: 14px; font-weight: 600; line-height: 1; margin: 2px 0; }
.badge-bar { width: 100%; height: 5px; background: rgba(255,255,255,0.3); border-radius: 3px; overflow: hidden; }
.badge-fill { height: 100%; background: #fff; border-radius: 3px; transition: width 0.4s ease; }
.actions { display: flex; flex-direction: column; gap: 8px; margin-left: 8px; align-items: center; }
.btn-icon {
  background: rgba(255,255,255,0.2); border: none; color: white;
  width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background 0.2s; font-size: 16px;
}
.btn-icon:hover { background: rgba(255,255,255,0.35); }
.btn-icon.active { background: rgba(255,255,255,0.4); }
.btn-icon:disabled { opacity: 0.5; cursor: not-allowed; }
.body {
  padding: 24px; display: flex; flex-direction: column; gap: 16px;
  overflow-x: hidden; overflow-y: auto; max-height: 60vh;
  align-items: center; position: relative;
}
.minimized .body { display: none; }
.minimized .header-left { display: none; }
.minimized .actions { display: none; }
.state-card {
  border-radius: 20px; padding: 24px; text-align: center; transition: background 0.3s;
  width: 100%; box-sizing: border-box; display: flex; flex-direction: column;
  align-items: center; gap: 12px; position: relative;
}
.state-card.animate {
  animation: cardUpdate 0.25s ease;
}
@keyframes cardUpdate {
  0% { opacity: 0.7; transform: scale(0.98); }
  100% { opacity: 1; transform: scale(1); }
}
.top-left-actions {
  position: absolute; top: 8px; left: 8px; display: flex; gap: 6px; z-index: 10;
}
.top-right-actions {
  position: absolute; top: 8px; right: 8px; z-index: 10;
}
.btn-icon-action {
  background: rgba(0,0,0,0.05); border: none; border-radius: 50%;
  width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background 0.2s; position: relative;
}
.btn-icon-action:hover { background: rgba(0,0,0,0.1); }
.btn-icon-action:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-icon-action .spinner {
  width: 16px; height: 16px; border: 2px solid #ccc; border-top-color: #333;
  border-radius: 50%; animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
[data-tooltip] { position: relative; }
[data-tooltip]:hover::after {
  content: attr(data-tooltip); position: absolute; bottom: calc(100% + 6px); left: 50%;
  transform: translateX(-50%); background: #333; color: #fff; padding: 4px 10px;
  border-radius: 6px; font-size: 12px; white-space: nowrap; pointer-events: none; z-index: 100;
}
.id-big {
  font-size: 64px; font-weight: 800; line-height: 1.2; padding: 20px; border-radius: 20px;
  display: inline-block; transition: background 0.3s, color 0.3s;
}
.id-big.unknown {
  background: repeating-linear-gradient(45deg, #f0f0f0, #f0f0f0 10px, #e0e0e0 10px, #e0e0e0 20px);
  color: #999; border: 2px dashed #ccc;
}
.return-tn-text { font-size: 28px; font-weight: 700; color: #0f172a; word-break: break-all; min-height: 40px; }
.type-text { font-size: 28px; font-weight: 700; color: #334155; min-height: 40px; }
.progress-bar { height: 14px; background: #e2e8f0; border-radius: 7px; overflow: hidden; width: 100%; }
.progress-fill { height: 100%; border-radius: 7px; transition: width 0.4s ease; background: #cbd5e1; }
.count-text { font-size: 42px; font-weight: 800; color: #0f172a; min-height: 50px; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 16px 32px; border-radius: 16px; font-weight: 700; font-size: 22px;
  border: none; cursor: pointer; transition: all 0.2s; width: 100%;
  position: relative;
}
.btn:disabled { opacity: 0.6; cursor: not-allowed; pointer-events: none; }
.btn .spinner {
  width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white;
  border-radius: 50%; animation: spin 0.6s linear infinite;
}
.btn-close { background: #ee4d2d; color: white; }
.btn-close:hover:not(:disabled) { background: #d43d1a; }
.btn-close-early { background: #2196F3; color: white; }
.btn-close-early:hover:not(:disabled) { background: #1976D2; }
.btn-warning { background: #f97316; color: white; }
.btn-warning:hover:not(:disabled) { background: #ea580c; }
.btn-undo {
  background: #e2e8f0; color: #475569; font-size: 16px; padding: 8px 16px;
}
.btn-undo:hover:not(:disabled) { background: #cbd5e1; }
.dashboard-container {
  width: 100%; display: none; flex-direction: column; gap: 8px;
}
.dashboard-container.visible {
  display: flex;
}

/* Thông báo toast nâng cao */
.toast-msg {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  padding: 12px 20px; border-radius: 12px;
  font-size: 15px; font-weight: 600; z-index: 9999999;
  display: flex; align-items: center; gap: 10px;
  animation: slideUp 0.3s ease;
  box-shadow: 0 10px 25px rgba(0,0,0,0.15);
}
.toast-msg.toast-success {
  background: #f0fdf4; border-left: 5px solid #22c55e; color: #166534;
}
.toast-msg.toast-error {
  background: #fef2f2; border-left: 5px solid #ef4444; color: #991b1b;
}
.toast-msg.toast-warning {
  background: #fffbeb; border-left: 5px solid #f59e0b; color: #92400e;
}
.toast-icon {
  font-size: 22px; line-height: 1;
}
.toast-text {
  font-weight: 700; line-height: 1.4;
}
@keyframes slideUp {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
`;

export class UIManager {
  constructor(stateManager, audioManager) {
    this.state = stateManager;
    this.audio = audioManager;
    stateManager.setUI(this);
    this.host = null;
    this.shadowRoot = null;
    this.popup = null;
    this.minimized = false;
    this.currentId = "";
    this._viewMode = "arrival"; // 'arrival' | 'dashboard'
    this._dashboardInstance = null;
    this._currentUrl = window.location.href;
    this._init();
    document.addEventListener("url-change", (e) =>
      this._onUrlChange(e.detail.url),
    );
  }

  _onUrlChange(newUrl) {
    if (!this.host) return;
    this._currentUrl = newUrl;
    this._updateVisibility();
  }

  _isArrivingPage() {
    return window.location.href.includes("/v2/returninbound/arrving");
  }

  _getTypeListForId(id) {
    return this.state.getDisplayNamesForId(id);
  }

  _updateVisibility() {
    if (!this.host) return;
    const isArriving = this._isArrivingPage();
    this.host.style.display = isArriving ? "" : "none";
    if (isArriving && this._viewMode === "arrival") {
      this._updateTop5();
    }
  }

  _init() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", () => this._init());
      return;
    }
    this._createHost({ left: 50, top: 50 });
    chrome.storage.local.get("popupPosition", (result) => {
      if (result.popupPosition) {
        this.popup.style.left = result.popupPosition.left + "px";
        this.popup.style.top = result.popupPosition.top + "px";
        this._clampPosition();
      }
    });
  }

  _createHost({ left, top }) {
    this.host = document.createElement("div");
    this.host.id = "as-popup-host";
    this.shadowRoot = this.host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLES;
    this.shadowRoot.appendChild(style);

    this.popup = document.createElement("div");
    this.popup.className = "popup";
    this.popup.style.left = left + "px";
    this.popup.style.top = top + "px";

    this.popup.innerHTML = `
      <div class="header" id="header">
        <div class="header-left">
          <div class="title-row"><span>📦 Arrival Sort</span></div>
          <div class="top-row" id="top-row"></div>
        </div>
        <div class="actions">
        <button class="btn-icon" id="btn-minimize" title="Thu nhỏ">–</button>
        <button class="btn-icon" id="btn-toggle-dashboard" title="Quản lý TO">📊</button>
        </div>
      </div>
      <div class="body" id="body">
        <div class="state-card" id="state-card">
          <div class="top-left-actions">
            <button class="btn-icon-action" id="btn-refresh-master" data-tooltip="Cập nhật Master Data">🔄</button>
            <button class="btn-icon-action" id="btn-refresh-mapping" data-tooltip="Cập nhật Type Mapping">🗂️</button>
          </div>
          <div class="top-right-actions">
            <button class="btn-icon-action" id="btn-undo" style="display:none;" data-tooltip="Hủy Return TN này">🗑️</button>
          </div>
          <div id="id-box" class="id-big" style="background:#cbd5e1; color:#fff; min-width: 80px;">?</div>
          <div class="type-text" id="type-el">--</div>
          <div class="return-tn-text" id="return-tn-el">----</div>
          <div class="progress-bar"><div id="progress-fill" class="progress-fill" style="width:0%"></div></div>
          <div class="count-text" id="count-el">∞/∞</div>
          <div id="button-container"></div>
          <div id="error-info" style="display:none;"></div>
        </div>
        <div class="dashboard-container" id="dashboard-container"></div>
      </div>
    `;
    this.shadowRoot.appendChild(this.popup);
    document.body.appendChild(this.host);

    this._updateVisibility();
    this._clampPosition();
    this._setupDrag();
    this._bindEvents();
    this._switchView("arrival");
  }

  _clampPosition() {
    const rect = this.popup.getBoundingClientRect();
    let left = parseInt(this.popup.style.left, 10) || 50;
    let top = parseInt(this.popup.style.top, 10) || 50;
    const maxLeft = window.innerWidth - rect.width;
    const maxTop = window.innerHeight - rect.height;
    left = Math.max(0, Math.min(left, maxLeft));
    top = Math.max(0, Math.min(top, maxTop));
    this.popup.style.left = left + "px";
    this.popup.style.top = top + "px";
  }

  _savePosition() {
    const left = parseInt(this.popup.style.left, 10) || 50;
    const top = parseInt(this.popup.style.top, 10) || 50;
    chrome.storage.local.set({ popupPosition: { left, top } });
  }

  _setupDrag() {
    const header = this.shadowRoot.getElementById("header");
    if (!header) return;
    let startX,
      startY,
      initialLeft,
      initialTop,
      moved = false;

    const onMouseMove = (e) => {
      moved = true;
      const dx = e.clientX - startX,
        dy = e.clientY - startY;
      let newLeft = initialLeft + dx,
        newTop = initialTop + dy;
      const rect = this.popup.getBoundingClientRect();
      const maxLeft = window.innerWidth - rect.width;
      const maxTop = window.innerHeight - rect.height;
      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));
      this.popup.style.left = newLeft + "px";
      this.popup.style.top = newTop + "px";
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (!moved && this.minimized) this.toggleMinimize();
      if (moved) this._savePosition();
      moved = false;
    };

    const startDrag = (e) => {
      if (
        e.target.closest("#btn-minimize") ||
        e.target.closest("#btn-toggle-dashboard")
      )
        return;
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.popup.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      moved = false;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    if (this.minimized) {
      this.popup.addEventListener("mousedown", startDrag);
    } else {
      header.addEventListener("mousedown", startDrag);
    }
    this._dragStartHandler = startDrag;
  }

  _bindEvents() {
    this.shadowRoot
      .getElementById("btn-minimize")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleMinimize();
      });

    const toggleBtn = this.shadowRoot.getElementById("btn-toggle-dashboard");
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggleView();
    });

    // Nút refresh Master Data
    const refreshMaster = this.shadowRoot.getElementById("btn-refresh-master");
    refreshMaster.addEventListener("click", async () => {
      if (refreshMaster.disabled) return;
      refreshMaster.disabled = true;
      const originalHTML = refreshMaster.innerHTML;
      refreshMaster.innerHTML = '<span class="spinner"></span>';
      try {
        await this.state.refreshMasterData();
        this._showToast("Master Data đã được cập nhật", "success");
      } catch (e) {
        this._showToast("Lỗi cập nhật Master Data", "error");
      } finally {
        refreshMaster.disabled = false;
        refreshMaster.innerHTML = originalHTML;
      }
    });

    // Nút refresh Type Mapping
    const refreshMapping = this.shadowRoot.getElementById(
      "btn-refresh-mapping",
    );
    refreshMapping.addEventListener("click", async () => {
      if (refreshMapping.disabled) return;
      refreshMapping.disabled = true;
      const originalHTML = refreshMapping.innerHTML;
      refreshMapping.innerHTML = '<span class="spinner"></span>';
      try {
        await this.state.refreshTypeMapping();
        this._showToast("Type Mapping đã được cập nhật", "success");
      } catch (e) {
        this._showToast("Lỗi cập nhật Type Mapping", "error");
      } finally {
        refreshMapping.disabled = false;
        refreshMapping.innerHTML = originalHTML;
      }
    });
  }

  _toggleView() {
    if (this._viewMode === "arrival") {
      this._switchView("dashboard");
    } else {
      this._switchView("arrival");
    }
  }

  _switchView(mode) {
    this._viewMode = mode;
    const stateCard = this.shadowRoot.getElementById("state-card");
    const dashboardContainer = this.shadowRoot.getElementById(
      "dashboard-container",
    );
    const toggleBtn = this.shadowRoot.getElementById("btn-toggle-dashboard");

    if (mode === "arrival") {
      stateCard.style.display = "flex";
      dashboardContainer.classList.remove("visible");
      toggleBtn.classList.remove("active");
      this._updateTop5();
    } else {
      stateCard.style.display = "none";
      dashboardContainer.classList.add("visible");
      toggleBtn.classList.add("active");
      if (!this._dashboardInstance) {
        this._dashboardInstance = DashboardUI.attachTo(
          dashboardContainer,
          this.state,
        );
      }
      if (this._dashboardInstance) {
        this._dashboardInstance.refresh();
      }
    }
  }

  toggleMinimize() {
    this.minimized = !this.minimized;
    const header = this.shadowRoot.getElementById("header");

    if (this.minimized) {
      const rect = this.popup.getBoundingClientRect();
      this.popup.dataset.savedLeft = rect.left;
      this.popup.dataset.savedTop = rect.top;
      this.popup.classList.add("minimized");
      this.popup.style.left = "";
      this.popup.style.top = "";
      header.setAttribute("data-current-id", this.currentId || "?");
    } else {
      const savedLeft = parseFloat(this.popup.dataset.savedLeft);
      const savedTop = parseFloat(this.popup.dataset.savedTop);
      if (!isNaN(savedLeft)) this.popup.style.left = savedLeft + "px";
      if (!isNaN(savedTop)) this.popup.style.top = savedTop + "px";
      this.popup.classList.remove("minimized");
      header.removeAttribute("data-current-id");
      if (this._viewMode === "arrival") {
        this._updateTop5();
      }
    }

    if (this._dragStartHandler) {
      if (this.minimized) {
        header.removeEventListener("mousedown", this._dragStartHandler);
        this.popup.addEventListener("mousedown", this._dragStartHandler);
      } else {
        this.popup.removeEventListener("mousedown", this._dragStartHandler);
        header.addEventListener("mousedown", this._dragStartHandler);
      }
    }
  }

  /**
   * Tìm threshold chính xác:
   * 1. Dùng rawThreshold nếu là số hợp lệ (>0 hoặc 0)
   * 2. Nếu không có, tìm trong state.sessions theo id
   * 3. Fallback 30
   */
  _resolveThreshold(id, rawThreshold) {
    // Nếu rawThreshold là số (kể cả 0) thì dùng
    if (typeof rawThreshold === "number" && rawThreshold >= 0) {
      return rawThreshold;
    }
    // Tra cứu từ state
    if (id && this.state.sessions) {
      const session = this.state.sessions.find((s) => s.id === id);
      if (session && typeof session.threshold === "number" && session.threshold >= 0) {
        return session.threshold;
      }
    }
    // Fallback cuối cùng
    return 30;
  }

  _updateTop5() {
    if (this.minimized || !this.shadowRoot) return;
    const topRow = this.shadowRoot.getElementById("top-row");
    if (!topRow) return;

    const sessions = this.state.sessions || [];

    // Sắp xếp giảm dần theo % đầy (count/threshold), nếu bằng nhau thì ưu tiên count lớn hơn
    const sorted = [...sessions].sort((a, b) => {
      const thresholdA = this._resolveThreshold(a.id, a.threshold);
      const thresholdB = this._resolveThreshold(b.id, b.threshold);
      const percentA = thresholdA > 0 ? a.item_count / thresholdA : 0;
      const percentB = thresholdB > 0 ? b.item_count / thresholdB : 0;

      if (percentB !== percentA) return percentB - percentA; // giảm dần theo %
      // Nếu bằng % thì so sánh count thực tế (ưu tiên count cao hơn)
      return b.item_count - a.item_count;
    });

    const top5 = sorted.slice(0, 5);
    const SLOT_COUNT = 5;

    let html = "";
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = top5[i];
      if (s) {
        const threshold = this._resolveThreshold(s.id, s.threshold);
        const count = s.item_count;
        const percent = threshold > 0 ? Math.min(100, Math.round((count / threshold) * 100)) : 0;
        const bgColor = STATION_COLORS[s.id] || "#607D8B";
        const textColor = getTextColor(bgColor);
        const displayType = s.type_group || "";
        html += `<div class="badge-card" style="background:${bgColor}; color:${textColor};" title="ID ${s.id}: ${displayType} – ${count}/${threshold}" data-id="${s.id}">
        <div class="badge-id">${s.id}</div>
        <div class="badge-type" title="${displayType}">${displayType || "-"}</div>
        <div class="badge-count">${count}/${threshold}</div>
        <div class="badge-bar"><div class="badge-fill" style="width:${percent}%"></div></div>
      </div>`;
      } else {
        html += `<div class="badge-card placeholder">
        <div class="badge-id">-</div><div class="badge-type">-</div><div class="badge-count">-</div>
        <div class="badge-bar"><div class="badge-fill" style="width:0%"></div></div>
      </div>`;
      }
    }
    topRow.innerHTML = html;

    topRow.querySelectorAll(".badge-card:not(.placeholder)").forEach((badge) => {
      badge.addEventListener("click", (e) => {
        const id = badge.dataset.id;
        if (id) {
          // Nếu đang ở Dashboard, chuyển về Arrival trước
          if (this._viewMode === "dashboard") {
            this._switchView("arrival");
          }
          this.state.showSessionDetail(id);
        }
      });
    });
  }

  updateTop5(sessions) {
    if (this.shadowRoot) this._updateTop5();
  }

  // ─── Icon & màu sắc cho từng loại lỗi ─────────────────
  _getErrorIcon(reason) {
    const r = (reason || "").toLowerCase();
    if (r.includes("sai tuyến")) return "🚫";
    if (r.includes("không có trong master data") || r.includes("không tìm thấy")) return "📭";
    if (r.includes("ánh xạ")) return "🗂️❌";
    if (r.includes("cảnh báo")) return "⚠️";
    return "❌";
  }

  _getErrorColor(reason) {
    const r = (reason || "").toLowerCase();
    if (r.includes("sai tuyến")) return "#856404";   // vàng đậm
    if (r.includes("cảnh báo")) return "#92400e";    // cam nâu
    return "#721c24"; // đỏ đậm
  }

  _updateCard({
    id,
    displayType,
    return_tn,
    count,
    threshold: rawThreshold,
    isFull,
    error,
    unknownId,
    closed,
    animate,
    processing,
  }) {
    if (!this.shadowRoot) return;
    // Luôn lấy threshold chính xác từ nguồn đáng tin nhất
    const threshold = this._resolveThreshold(id, rawThreshold);

    const idBox = this.shadowRoot.getElementById("id-box");
    const typeEl = this.shadowRoot.getElementById("type-el");
    const returnTnEl = this.shadowRoot.getElementById("return-tn-el");
    const progressFill = this.shadowRoot.getElementById("progress-fill");
    const progressBar = progressFill?.parentNode;
    const countEl = this.shadowRoot.getElementById("count-el");
    const btnContainer = this.shadowRoot.getElementById("button-container");
    const card = this.shadowRoot.getElementById("state-card");
    const errorInfo = this.shadowRoot.getElementById("error-info");
    const undoBtn = this.shadowRoot.getElementById("btn-undo");

    // Ẩn tất cả trước khi render
    if (idBox) {
      idBox.style.display = "none";
      idBox.classList.remove("unknown");
    }
    if (typeEl) typeEl.style.display = "none";
    if (returnTnEl) returnTnEl.style.display = "none";
    if (progressBar) progressBar.style.display = "none";
    if (countEl) countEl.style.display = "none";
    if (btnContainer) btnContainer.innerHTML = "";
    if (errorInfo) errorInfo.style.display = "none";

    const isUnknown = unknownId || (error && !id);
    const canOperate =
      !processing && !closed && !error && count > 0 && id && !isUnknown;

    // Nút hủy (góc trên phải)
    if (undoBtn) {
      const canUndo = canOperate || (error && id && count > 0);
      undoBtn.style.display = canUndo ? "flex" : "none";
      if (canUndo) {
        undoBtn.disabled = false;
        undoBtn.onclick = (e) => {
          if (undoBtn.disabled) return;
          undoBtn.disabled = true;
          const originalHTML = undoBtn.innerHTML;
          undoBtn.innerHTML = '<span class="spinner"></span>';
          if (confirm(`Hủy Return TN ${return_tn} khỏi ID ${id}?`)) {
            this.state.removeScan(return_tn, id, displayType).finally(() => {
              undoBtn.disabled = false;
              undoBtn.innerHTML = originalHTML;
            });
          } else {
            undoBtn.disabled = false;
            undoBtn.innerHTML = originalHTML;
          }
        };
      }
    }

    // ---- Xác định màu nền của card dựa trên trạng thái ----
    if (card) {
      if (processing) {
        card.style.background = "#f5f5f5";
      } else if (error) {
        const reason = error.reason || "";
        if (reason.includes("Sai tuyến")) {
          card.style.background = "#fff3cd";
        } else if (reason.includes("Cảnh báo")) {
          card.style.background = "#fff7ed";
        } else {
          card.style.background = "#f8d7da";
        }
      } else if (isUnknown) {
        card.style.background = "#fff7ed";
      } else if (isFull) {
        card.style.background = "#f0fdf4";
      } else {
        card.style.background = "#f8fafc";
      }
    }

    // ---- Xử lý chế độ ERROR ----
    if (error) {
      if (idBox) {
        if (isUnknown) {
          idBox.style.background = "";
          idBox.style.color = "";
          idBox.textContent = "?";
          idBox.classList.add("unknown");
          idBox.style.display = "inline-block";
        } else {
          const bgColor = STATION_COLORS[id] || "#607D8B";
          const textColor = getTextColor(bgColor);
          idBox.style.background = bgColor;
          idBox.style.color = textColor;
          idBox.textContent = id;
          idBox.style.display = "inline-block";
        }
      }
      if (displayType && typeEl) {
        typeEl.textContent = displayType;
        typeEl.style.display = "block";
      }
      if (return_tn && returnTnEl) {
        returnTnEl.textContent = return_tn;
        returnTnEl.style.display = "block";
      }
      if (errorInfo) {
        const icon = this._getErrorIcon(error.reason);
        const color = this._getErrorColor(error.reason);
        errorInfo.style.display = "block";
        errorInfo.innerHTML = `
          <div style="font-size:22px; font-weight:800; color:${color}; margin-bottom:8px; display:flex; align-items:center; justify-content:center; gap:8px;">
            <span style="font-size:26px;">${icon}</span> ${error.reason}
          </div>
          <div style="font-size:16px; color:#4b5563; font-weight:600;">${error.detail || ""}</div>
        `;
      }
      if (card && animate) {
        card.classList.add("animate");
        card.addEventListener(
          "animationend",
          () => card.classList.remove("animate"),
          { once: true },
        );
      }
      return;
    }

    // ---- Xử lý chế độ PROCESSING (đang chờ kết quả) ----
    if (processing) {
      if (idBox) {
        if (isUnknown) {
          idBox.style.background = "";
          idBox.style.color = "";
          idBox.textContent = "?";
          idBox.classList.add("unknown");
          idBox.style.display = "inline-block";
        } else {
          const bgColor = STATION_COLORS[id] || "#607D8B";
          const textColor = getTextColor(bgColor);
          idBox.style.background = bgColor;
          idBox.style.color = textColor;
          idBox.textContent = id;
          idBox.style.display = "inline-block";
        }
      }
      if (typeEl) {
        typeEl.textContent = displayType || "--";
        typeEl.style.display = "block";
      }
      if (returnTnEl) {
        returnTnEl.textContent = return_tn || "----";
        returnTnEl.style.display = "block";
      }
      if (progressBar) progressBar.style.display = "none";
      if (countEl) countEl.style.display = "none";
      if (errorInfo) {
        errorInfo.style.display = "block";
        errorInfo.innerHTML = `
          <div style="font-size:22px; font-weight:700; color:#4b5563; display:flex; align-items:center; justify-content:center; gap:8px;">
            <span style="font-size:28px;">⏳</span> Đang xử lý...
          </div>
        `;
      }
      if (card && animate) {
        card.classList.add("animate");
        card.addEventListener(
          "animationend",
          () => card.classList.remove("animate"),
          { once: true },
        );
      }
      return;
    }

    // ---- Xử lý chế độ NORMAL (thành công hoặc trạng thái bình thường) ----
    if (idBox) idBox.style.display = "inline-block";
    if (typeEl) typeEl.style.display = "block";
    if (returnTnEl) returnTnEl.style.display = "block";
    if (progressBar) progressBar.style.display = "block";
    if (countEl) countEl.style.display = "block";

    // ID box
    if (idBox) {
      if (isUnknown) {
        idBox.style.background = "";
        idBox.style.color = "";
        idBox.textContent = "?";
        idBox.classList.add("unknown");
      } else {
        const bgColor = STATION_COLORS[id] || "#607D8B";
        const textColor = getTextColor(bgColor);
        idBox.style.background = bgColor;
        idBox.style.color = textColor;
        idBox.textContent = id;
      }
    }

    // Type & Return TN
    if (typeEl) typeEl.textContent = displayType || "--";
    if (returnTnEl) returnTnEl.textContent = return_tn || "----";

    // Progress bar
    const percent =
      count !== undefined && threshold > 0
        ? Math.min(100, Math.round((count / threshold) * 100))
        : 0;
    if (progressFill) {
      progressFill.style.width = percent + "%";
      progressFill.style.background =
        id && !isUnknown && STATION_COLORS[id] ? STATION_COLORS[id] : "#cbd5e1";
    }

    // Count text
    if (countEl) {
      countEl.textContent =
        count !== undefined ? `${count}/${threshold}` : `∞/∞`;
    }

    // Buttons
    if (canOperate && btnContainer) {
      if (isFull) {
        btnContainer.innerHTML = `<button class="btn btn-close" id="btn-close">Xác nhận đóng kiện (đầy)</button>`;
        const closeBtn = btnContainer.querySelector("#btn-close");
        closeBtn.addEventListener("click", () => {
          if (closeBtn.disabled) return;
          closeBtn.disabled = true;
          closeBtn.innerHTML = '<span class="spinner"></span> Đang đóng...';
          this.state.closeSession(id, displayType).finally(() => {
            closeBtn.disabled = false;
            closeBtn.textContent = "Xác nhận đóng kiện (đầy)";
          });
        });
      } else {
        btnContainer.innerHTML = `<button class="btn btn-close-early" id="btn-close-early">Đóng kiện ngay (${count}/${threshold})</button>`;
        const closeEarlyBtn = btnContainer.querySelector("#btn-close-early");
        closeEarlyBtn.addEventListener("click", () => {
          if (closeEarlyBtn.disabled) return;
          if (
            confirm(
              "Bạn có chắc muốn đóng kiện khi chưa đủ số lượng?\nThao tác này sẽ in tem TO và kết thúc lô hàng hiện tại.",
            )
          ) {
            closeEarlyBtn.disabled = true;
            closeEarlyBtn.innerHTML =
              '<span class="spinner"></span> Đang đóng...';
            this.state.closeSession(id, displayType).finally(() => {
              closeEarlyBtn.disabled = false;
              closeEarlyBtn.textContent = `Đóng kiện ngay (${count}/${threshold})`;
            });
          }
        });
      }
    } else if (btnContainer) {
      btnContainer.innerHTML = "";
    }

    // Animation
    if (card) {
      if (animate) {
        card.classList.add("animate");
        card.addEventListener(
          "animationend",
          () => card.classList.remove("animate"),
          { once: true },
        );
      } else {
        card.classList.remove("animate");
      }
    }
  }

  // Khi status === 'processing', hiển thị màu xám
  showDetected(return_tn, displayType, id, session, status = "detected") {
    this.currentId = id || "";
    this._updateCard({
      id: id || null,
      displayType: displayType || null,
      return_tn,
      count: session?.item_count || 0,
      threshold: session?.threshold, // để _resolveThreshold xử lý
      isFull: session?.status === "full",
      closed: session?.status === "closed",
      unknownId: !id,
      animate: true,
      processing: status === "processing",
    });
  }

  showSuccess(return_tn, displayType, id, serverData) {
    this.currentId = id;
    this.audio.playScanSuccess();
    this._updateCard({
      id,
      displayType,
      return_tn,
      count: serverData.item_count,
      threshold: serverData.threshold, // để _resolveThreshold xử lý
      isFull: serverData.status === "full",
      closed: serverData.status === "closed",
      unknownId: !id,
      animate: true,
    });
  }

  showFullAlert(id, displayType) {
    if (!this.shadowRoot) return;
    this.audio.playFullAlert();
    const btnContainer = this.shadowRoot.getElementById("button-container");
    if (btnContainer && !btnContainer.querySelector("#btn-close")) {
      btnContainer.innerHTML =
        '<button class="btn btn-close" id="btn-close">Xác nhận đóng kiện (đầy)</button>';
      const closeBtn = btnContainer.querySelector("#btn-close");
      closeBtn.addEventListener("click", () => {
        if (closeBtn.disabled) return;
        closeBtn.disabled = true;
        closeBtn.innerHTML = '<span class="spinner"></span> Đang đóng...';
        this.state.closeSession(id, displayType).finally(() => {
          closeBtn.disabled = false;
          closeBtn.textContent = "Xác nhận đóng kiện (đầy)";
        });
      });
    }
  }

  showWarning(return_tn, detail) {
    this.audio.playNotFound();
    this._updateCard({
      return_tn: return_tn,
      error: { reason: "Cảnh báo", detail },
      unknownId: true,
    });
  }

  showScanError({ return_tn, displayType, id, reason, detail }) {
    this.currentId = id || "";
    if (reason.includes("Không có trong master data")) {
      this.audio.playNotFound();
    } else if (reason.includes("Lỗi ánh xạ")) {
      this.audio.playMappingError();
    } else if (reason.includes("Sai tuyến")) {
      this.audio.playMappingError();
    } else {
      this.audio.playError();
    }

    this._updateCard({
      id: id || null,
      displayType: displayType || null,
      return_tn,
      error: { reason, detail },
      unknownId: !id,
      animate: true,
    });
  }

  resetCard() {
    this._updateCard({
      id: null,
      displayType: null,
      return_tn: null,
      count: 0,
      isFull: false,
      closed: false,
      unknownId: false,
      animate: false,
    });
  }

  async _retryPrint(toNumber, id, dateStr, number, email, itemCount, typeList) {
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      try {
        await printLabel(toNumber, id, dateStr, number, email, itemCount, typeList);
        return;
      } catch (e) {
        console.error(`Print attempt ${attempts + 1} failed:`, e);
        attempts++;
        if (attempts < maxAttempts) await new Promise(r => setTimeout(r, 1000));
      }
    }
    alert('In thất bại sau 3 lần thử. Vui lòng kiểm tra máy in hoặc tải file HTML.');
    const html = this._generateLabelHTML(toNumber, id, dateStr, number, email, itemCount, typeList);
    const blob = new Blob([html], { type: "text/html;charset=UTF-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${toNumber}.html`;
    a.click();
  }

  _generateLabelHTML(toNumber, id, dateStr, number, email, itemCount, typeList) {
    const typeStr = (typeList || []).join(', ');
    return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><style>
  @page { size: 100mm 50mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 100mm; height: 50mm; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: white; display: flex; align-items: stretch; }
  .left { width: 67%; display: flex; flex-direction: column; justify-content: space-between; padding: 3mm 3mm 3mm 5mm; }
  .right { width: 33%; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 3mm 5mm 3mm 0; }
  .to-main { font-size: 24px; font-weight: 800; color: #000; letter-spacing: 0.5px; line-height: 1.2; text-transform: uppercase; }
  .types-main { font-size: 14px; font-weight: 600; color: #000; text-transform: uppercase; }
  .number-text { font-size: 18px; font-weight: 700; color: #000; font-family: 'Courier New', Courier, monospace; }
  .date-text { font-size: 16px; font-weight: 700; color: #000; font-family: 'Courier New', Courier, monospace; }
  .email-text { font-size: 12px; font-weight: 500; color: #000; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .qty-text { font-size: 16px; font-weight: 700; color: #000; font-family: 'Courier New', Courier, monospace; }
  .qr-wrapper img { width: 30mm; height: 30mm; filter: grayscale(100%) contrast(150%); }
</style></head>
<body>
  <div class="left">
    <div class="to-main">TO-${id}</div>
    <div class="types-main">${typeStr}</div>
    <div class="number-text">${number}</div>
    <div class="date-text">${dateStr}</div>
    <div class="qty-text">QTY: ${itemCount}</div>
    <div class="email-text" title="${email}">${email}</div>
  </div>
  <div class="right">
    <div class="to-main" style="font-size:14px;">TO-${id}</div>
    <div class="types-main" style="font-size:10px; text-align:center;">${typeStr}</div>
    <div class="qr-wrapper"><img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0id2hpdGUiLz48L3N2Zz4=" alt="QR" /></div>
    <div class="qty-text">QTY: ${itemCount}</div>
  </div>
</body>
</html>`;
  }

  async _savePrintedLabel(labelData) {
    const { printedLabels } = await chrome.storage.local.get("printedLabels");
    const labels = printedLabels || [];
    // Thêm timestamp lúc in
    labels.unshift({
      ...labelData,
      createdAt: new Date().toISOString()
    });
    // Giữ tối đa 50 tem gần nhất
    if (labels.length > 50) {
      labels.length = 50;
    }
    await chrome.storage.local.set({ printedLabels: labels });
  }

  printAndClose(id, displayType, toNumber, itemCount) {
    this.audio.playCloseSuccess();
    this._updateCard({
      id,
      displayType,
      return_tn: 'Đang in...',
      count: itemCount,
      threshold: 0,
      isFull: false,
    });
    const date = new Date();
    const dateStr = `${date.getDate().toString().padStart(2, '0')} ${(date.getMonth() + 1).toString().padStart(2, '0')} ${date.getFullYear().toString().slice(-2)}`;
    const numberPart = toNumber.split('-').pop();
    const typeList = this._getTypeListForId(id);

    this._retryPrint(toNumber, id, dateStr, numberPart, this.state.email, itemCount, typeList)
      .then(() => {
        this._savePrintedLabel({
          toNumber,
          displayType,
          id,
          dateStr,
          number: numberPart,
          email: this.state.email,
          itemCount,
        });
        this.state.markPrinted(id);
        this._updateCard({
          id,
          displayType,
          return_tn: '✅ Đã đóng kiện',
          count: itemCount,
          threshold: 0,
          isFull: false,
          closed: true,
        });
      })
      .catch(() => {
        this.audio.playPrintError();
        this._updateCard({
          id,
          displayType,
          return_tn: '❌ In thất bại',
          count: itemCount,
          threshold: 0,
          isFull: false,
        });
        if (this.shadowRoot) {
          const btnContainer =
            this.shadowRoot.getElementById("button-container");
          if (btnContainer) {
            btnContainer.innerHTML =
              '<button class="btn btn-warning" id="btn-retry-print">In lại</button>';
            const retryBtn = btnContainer.querySelector("#btn-retry-print");
            retryBtn.addEventListener("click", () => {
              if (retryBtn.disabled) return;
              retryBtn.disabled = true;
              retryBtn.innerHTML = '<span class="spinner"></span> Đang in...';
              this.printAndClose(id, typeList, toNumber, itemCount).finally(() => {
                retryBtn.disabled = false;
                retryBtn.textContent = "In lại";
              });
            });
          }
        }
      });
  }

  /**
   * Hiển thị toast chuyên nghiệp với icon và màu sắc theo loại.
   * @param {string} message - Nội dung thông báo (không cần icon).
   * @param {'success'|'error'|'warning'} type - Loại thông báo.
   */
  _showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast-msg toast-${type}`;
    let icon = "";
    if (type === "success") icon = "✅";
    else if (type === "error") icon = "❌";
    else if (type === "warning") icon = "⚠️";
    else icon = "ℹ️"; // fallback info

    toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-text">${message}</span>`;
    this.shadowRoot.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 3000);
  }
}