// content/ui/dashboard.js – Dashboard nhúng vào popup chính, đầy đủ badge & realtime
import { printLabel } from "../printer.js";

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

const DASH_STYLES = `
:host { all: initial; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
.dashboard { display: flex; flex-direction: column; gap: 8px; }
.tabs {
  display: flex; border-radius: 12px 12px 0 0; border-bottom: 1px solid #e2e8f0; background: #f8fafc;
}
.tab {
  flex: 1; text-align: center; padding: 10px 6px; font-size: 12px; font-weight: 600;
  cursor: pointer; color: #64748b; position: relative; transition: all 0.2s;
  border-bottom: 3px solid transparent;
}
.tab.active { color: #1E293B; border-bottom-color: #3b82f6; }
.tab-badge {
  background: #e2e8f0; color: #475569; font-size: 11px; padding: 2px 8px; border-radius: 10px;
  margin-left: 4px; font-weight: 700;
}
.tab.active .tab-badge { background: #3b82f6; color: white; }
.search-row { display: flex; gap: 8px; margin-bottom: 6px; }
.search-input {
  flex: 1; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px;
}
.btn-action {
  padding: 8px 14px; border: none; border-radius: 8px; font-weight: 600; font-size: 13px;
  cursor: pointer; transition: all 0.2s;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
}
.btn-action:disabled { opacity: 0.6; cursor: not-allowed; pointer-events: none; }
.btn-action .spinner {
  width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white;
  border-radius: 50%; animation: spin 0.6s linear infinite;
}
.btn-close-all { background: #ef4444; color: white; }
.btn-close-all:hover:not(:disabled) { background: #dc2626; }
.card {
  background: #f8fafc; border-radius: 12px; padding: 10px; margin-bottom: 6px;
  animation: fadeIn 0.3s ease; border-left: 4px solid #cbd5e1;
}
.card.status-open { border-left-color: #22c55e; }
.card.status-full { border-left-color: #f59e0b; }
.card.status-closed { border-left-color: #94a3b8; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
.card-row { display: flex; align-items: center; justify-content: space-between; }
.card-left { display: flex; align-items: center; gap: 10px; }
.id-badge {
  font-size: 18px; font-weight: 800; padding: 6px 10px; border-radius: 8px; min-width: 42px; text-align: center;
}
.return-tn { font-size: 12px; color: #64748b; margin-top: 2px; }
.type { font-size: 14px; font-weight: 600; color: #1e293b; }
.count { font-size: 14px; font-weight: 700; color: #475569; }
.time { font-size: 11px; color: #94a3b8; margin-top: 2px; }
.date { font-size: 11px; color: #94a3b8; margin-top: 2px; }
.progress-row { margin-top: 6px; display: flex; align-items: center; gap: 8px; }
.progress-bar { flex: 1; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
.progress-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease; }
.progress-text { font-size: 12px; font-weight: 600; color: #64748b; min-width: 40px; text-align: right; }
.card-actions { display: flex; gap: 6px; }
.btn {
  border: none; padding: 6px 12px; border-radius: 6px; font-weight: 600; font-size: 12px; cursor: pointer; transition: all 0.2s;
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
}
.btn:disabled { opacity: 0.6; cursor: not-allowed; pointer-events: none; }
.btn .spinner {
  width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white;
  border-radius: 50%; animation: spin 0.6s linear infinite;
}
.btn-close { background: #ef4444; color: white; }
.btn-close:hover:not(:disabled) { background: #dc2626; }
.btn-reprint { background: #3b82f6; color: white; }
.btn-reprint:hover:not(:disabled) { background: #2563eb; }
.no-data {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 20px; color: #94a3b8;
}
.no-data-icon { font-size: 36px; margin-bottom: 6px; }
.no-data-text { font-size: 14px; }
.end-of-list {
  text-align: center; color: #94a3b8; font-size: 13px; padding: 12px 0;
}
`;

export class DashboardUI {
  constructor(stateManager, container) {
    this.state = stateManager;
    this.container = container;
    this.shadowRoot = null;
    this._activeTab = "open";
    this._searchTerm = "";
    this._sessions = [];
    this._printedLabels = [];
    this._closedPage = 1;
    this._hasMoreClosed = true;
    this._closedCount = 0;
    this._activeEventsPage = 1;
    this._hasMoreActiveEvents = true;
    this._activeEventsCount = 0;

    // Map lưu các phần tử DOM cho tab open (key = session.id)
    this._openElements = new Map();
    // Danh sách session open hiện tại đã lọc
    this._openSessions = [];

    // Debounce cho render
    this._renderDebounce = null;

    this._build();
    stateManager.addListener((sessions) => this._onSessionsUpdate(sessions));
    this._loadPrintedLabels();
    this._fetchClosedCount();
    this._fetchActiveEventsCount();
  }

  static attachTo(container, stateManager) {
    return new DashboardUI(stateManager, container);
  }

  _build() {
    this.shadowRoot = this.container.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = DASH_STYLES;
    this.shadowRoot.appendChild(style);

    const dashboard = document.createElement("div");
    dashboard.className = "dashboard";
    dashboard.innerHTML = `
      <div class="tabs">
        <div class="tab active" data-tab="open">Đang mở <span class="tab-badge" id="badge-open">0</span></div>
        <div class="tab" data-tab="closed">Đã đóng <span class="tab-badge" id="badge-closed">0</span></div>
        <div class="tab" data-tab="active-events">Đơn active <span class="tab-badge" id="badge-active-events">0</span></div>
        <div class="tab" data-tab="reprint">In lại <span class="tab-badge" id="badge-reprint">0</span></div>
      </div>
      <div class="search-row">
        <input class="search-input" placeholder="🔍 Lọc theo ID..." id="search-box" />
        <button class="btn-action btn-close-all" id="btn-close-all" style="display:none;">Đóng tất cả</button>
      </div>
      <div id="content-area"></div>
    `;
    this.shadowRoot.appendChild(dashboard);

    this._bindEvents();
    this._renderAll();
  }

  _getTypeListForId(id) {
    return this.state.getDisplayNamesForId(id);
  }

  _getTypeListString(id) {
    const list = this._getTypeListForId(id);
    if (!list || list.length === 0 || list[0] === 'Unknown') {
      return 'Unknown';
    }
    return list.join(', ');
  }

  // ─── Event Binding ──────────────────────────────────────────────────────
  _bindEvents() {
    this.shadowRoot
      .getElementById("search-box")
      .addEventListener("input", (e) => {
        this._searchTerm = e.target.value.toLowerCase();
        this._renderAll();
      });

    this.shadowRoot.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", (e) => {
        const tabName = e.currentTarget.dataset.tab;
        if (this._activeTab === tabName) return; // không chuyển nếu đang active
        this._activeTab = tabName;
        if (tabName === "closed") {
          this._closedPage = 1;
          this._hasMoreClosed = true;
        } else if (tabName === "active-events") {
          this._activeEventsPage = 1;
          this._hasMoreActiveEvents = true;
        }
        this._updateTabStyles();
        this._renderAll();
      });
    });

    this.shadowRoot
      .getElementById("btn-close-all")
      .addEventListener("click", () => {
        const openSessions = (this._sessions || []).filter(
          (s) => s.status === "open" || s.status === "full",
        );
        if (openSessions.length === 0) return;
        if (confirm(`Đóng tất cả ${openSessions.length} ID đang mở?`)) {
          const btn = this.shadowRoot.getElementById("btn-close-all");
          btn.disabled = true;
          btn.innerHTML = '<span class="spinner"></span> Đang đóng...';
          Promise.all(
            openSessions.map(
              (s) => this.state.closeSession(s.id, s.type_group),
            ),
          ).finally(() => {
            btn.disabled = false;
            btn.textContent = "Đóng tất cả";
          });
        }
      });
  }

  _updateTabStyles() {
    this.shadowRoot.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === this._activeTab);
    });
    const btnCloseAll = this.shadowRoot.getElementById("btn-close-all");
    btnCloseAll.style.display = this._activeTab === "open" ? "block" : "none";
  }

  // ─── Event từ StateManager ─────────────────────────────────────────────
  _onSessionsUpdate(sessions) {
    this._sessions = sessions;
    this._fetchClosedCount();
    this._fetchActiveEventsCount();

    // Nếu đang ở tab open, cập nhật realtime (diff & patch)
    if (this._activeTab === "open") {
      if (this._renderDebounce) cancelAnimationFrame(this._renderDebounce);
      this._renderDebounce = requestAnimationFrame(() => {
        this._syncOpenTab(); // chỉ diff, không xóa container
        this._updateBadges();
        this._renderDebounce = null;
      });
    } else {
      // Các tab khác chỉ update badge, không render lại (để khi chuyển tab sẽ render)
      this._updateBadges();
    }
  }

  // ─── Load dữ liệu từ storage ──────────────────────────────────────────
  async _loadPrintedLabels() {
    const { printedLabels } = await chrome.storage.local.get("printedLabels");
    this._printedLabels = printedLabels || [];
    if (this._activeTab === "reprint") this._renderAll();
  }

  async _fetchClosedCount() {
    chrome.runtime.sendMessage({ action: "GET_CLOSED_COUNT" }, (response) => {
      if (response?.count !== undefined) {
        this._closedCount = response.count;
        this._updateBadges();
      }
    });
  }

  async _fetchActiveEventsCount() {
    const count = await this.state.fetchActiveEventsCount();
    this._activeEventsCount = count;
    this._updateBadges();
  }

  _filter(items) {
    if (!this._searchTerm) return items;
    const term = this._searchTerm.toLowerCase();
    return items.filter((item) => {
      const fields = [
        item.id,
        item.station_id,
        item.type_group,
        item.return_tn,
        item.displayType,
        item.toNumber,
        item.number,
      ];
      return fields.some(
        (f) => f != null && String(f).toLowerCase().includes(term),
      );
    });
  }

  // ─── Render chính ──────────────────────────────────────────────────────
  _renderAll() {
    this._updateBadges();
    const contentArea = this.shadowRoot.getElementById("content-area");
    if (!contentArea) return;

    switch (this._activeTab) {
      case "open":
        this._renderOpenTab(); // xóa container và tạo mới từ đầu
        break;
      case "closed":
        this._closedPage = 1;
        this._hasMoreClosed = true;
        this._renderClosedTabAsync().then((html) => {
          contentArea.innerHTML = html;
          // Xóa map vì các phần tử cũ không còn trong container
          this._openElements.clear();
          this._attachCardEvents();
        });
        break;
      case "active-events":
        this._activeEventsPage = 1;
        this._hasMoreActiveEvents = true;
        this._renderActiveEventsTabAsync().then((html) => {
          contentArea.innerHTML = html;
          this._openElements.clear();
          this._attachCardEvents();
        });
        break;
      case "reprint":
        contentArea.innerHTML = this._renderReprintTab();
        this._openElements.clear();
        this._attachCardEvents();
        break;
    }
  }

  // ─── Render tab Open (xóa container, tạo mới) ──────────────────────────
  _renderOpenTab() {
    const container = this.shadowRoot.getElementById("content-area");
    if (!container) return;
    // Xóa toàn bộ nội dung
    container.innerHTML = "";
    // Xóa map cũ vì các phần tử cũ bị xóa
    this._openElements.clear();
    // Tạo lại từ đầu bằng sync
    this._syncOpenTab();
    this._attachCardEvents();
  }

  // ─── Sync tab Open (diff & patch, không xóa container) ──────────────────
  _syncOpenTab() {
    const sessions = this._sessions || [];
    const openSessions = sessions.filter(
      (s) => s.status === "open" || s.status === "full",
    );
    const filtered = this._filter(openSessions);
    const container = this.shadowRoot.getElementById("content-area");
    if (!container) return;

    // Lấy danh sách id mới
    const newIds = new Set(filtered.map((s) => s.id));

    // Xóa các phần tử không còn trong filtered
    for (const [id, el] of this._openElements) {
      if (!newIds.has(id)) {
        el.remove();
        this._openElements.delete(id);
      }
    }

    // Xóa no-data nếu có
    const noDataEl = container.querySelector('.no-data');
    if (noDataEl) noDataEl.remove();

    // Nếu không có dữ liệu, hiển thị no-data và thoát
    if (filtered.length === 0) {
      const noDataDiv = document.createElement('div');
      noDataDiv.className = 'no-data';
      noDataDiv.innerHTML = `
      <div class="no-data-icon">📭</div>
      <div class="no-data-text">Không có ID nào đang mở</div>
    `;
      container.appendChild(noDataDiv);
      this._openElements.clear();
      this._openSessions = [];
      return;
    }

    // Cập nhật hoặc thêm mới
    filtered.forEach((s) => {
      let el = this._openElements.get(s.id);
      if (!el) {
        el = this._createCardElement(s);
        container.appendChild(el);
        this._openElements.set(s.id, el);
      } else {
        this._updateCardElement(el, s);
      }
    });

    this._openSessions = filtered;
  }

  _formatDate(dateString) {
    if (!dateString) return '';
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return '';
      return `${String(d.getDate()).padStart(2, '0')} ${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getFullYear()).slice(-2)}`;
    } catch {
      return '';
    }
  }

  _formatDateTime(dateString) {
    if (!dateString) return '';
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return '';
      const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      return `${time} ${date}`;
    } catch {
      return '';
    }
  }

  // ─── Tạo và cập nhật phần tử Card ──────────────────────────────────────
  _createCardElement(session) {
    const div = document.createElement("div");
    this._applyCardData(div, session);
    return div;
  }

  _updateCardElement(el, session) {
    this._applyCardData(el, session);
  }

  _applyCardData(el, session) {
    const id = session.id;
    const typeListStr = this._getTypeListString(id);
    const status = session.status;
    const threshold = session.threshold || 30;
    const count = session.item_count;
    const percent = Math.min(100, Math.round((count / threshold) * 100));
    const statusClass = status === 'full' ? 'status-full' : 'status-open';
    const color = STATION_COLORS[id] || '#94a3b8';
    const textColor = getTextColor(color);

    // Hiển thị: giờ + ngày
    const displayTime = session.session_start ? this._formatDateTime(session.session_start) : '';
    // Dùng cho in: DD MM YY
    const dateStr = session.session_start ? this._formatDate(session.session_start) : '';

    const toNumber = session.to_number || '';

    el.className = `card ${statusClass}`;
    el.dataset.id = id;
    el.dataset.type = typeListStr;

    let row = el.querySelector('.card-row');
    if (!row) {
      el.innerHTML = `
      <div class="card-row">
        <div class="card-left">
          <div class="id-badge" style="background:${color}; color:${textColor};">${id}</div>
          <div>
            <div class="type" style="font-size:12px;">${typeListStr}</div>
            ${displayTime ? `<div class="time">${displayTime}</div>` : ''}
          </div>
        </div>
        <div class="card-actions">
          ${(status === 'open' || status === 'full') && count > 0
          ? `<button class="btn btn-close" data-action="close" data-id="${id}" data-type="${typeListStr}">Đóng</button>`
          : ''}
          ${status === 'closed'
          ? `<button class="btn btn-reprint" data-action="reprint-closed" data-id="${id}" data-type="${typeListStr}" data-to="${toNumber}" data-date="${dateStr}" data-number="${toNumber.split('-').pop() || ''}" data-qty="${count}">In lại</button>`
          : ''}
        </div>
      </div>
      <div class="progress-row">
        <div class="progress-bar">
          <div class="progress-fill" style="width:${percent}%; background:${color};"></div>
        </div>
        <span class="progress-text">${count}/${threshold}</span>
      </div>
    `;
      return;
    }

    // Cập nhật các phần tử con
    const badge = el.querySelector('.id-badge');
    if (badge) {
      badge.style.background = color;
      badge.style.color = textColor;
      badge.textContent = id;
    }

    const typeEl = el.querySelector('.type');
    if (typeEl) typeEl.textContent = typeListStr;

    let timeEl = el.querySelector('.time');
    if (displayTime) {
      if (!timeEl) {
        const parent = typeEl?.parentNode;
        if (parent) {
          timeEl = document.createElement('div');
          timeEl.className = 'time';
          parent.appendChild(timeEl);
        }
      }
      if (timeEl) timeEl.textContent = displayTime;
    } else if (timeEl) {
      timeEl.remove();
    }

    const fill = el.querySelector('.progress-fill');
    if (fill) {
      fill.style.width = percent + '%';
      fill.style.background = color;
    }
    const progressText = el.querySelector('.progress-text');
    if (progressText) progressText.textContent = `${count}/${threshold}`;

    const actionsContainer = el.querySelector('.card-actions');
    if (actionsContainer) {
      actionsContainer.innerHTML = '';
      if ((status === 'open' || status === 'full') && count > 0) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn btn-close';
        closeBtn.dataset.action = 'close';
        closeBtn.dataset.id = id;
        closeBtn.dataset.type = typeListStr;
        closeBtn.textContent = 'Đóng';
        actionsContainer.appendChild(closeBtn);
      }
      if (status === 'closed') {
        const reprintBtn = document.createElement('button');
        reprintBtn.className = 'btn btn-reprint';
        reprintBtn.dataset.action = 'reprint-closed';
        reprintBtn.dataset.id = id;
        reprintBtn.dataset.type = typeListStr;
        reprintBtn.dataset.to = toNumber;
        reprintBtn.dataset.date = dateStr;
        reprintBtn.dataset.number = toNumber.split('-').pop() || '';
        reprintBtn.dataset.qty = String(count);
        reprintBtn.textContent = 'In lại';
        actionsContainer.appendChild(reprintBtn);
      }
    }
  }

  // ─── Render tab Closed ──────────────────────────────────────────────────
  async _renderClosedTabAsync() {
    const sessions = await this._fetchClosedSessions(this._closedPage);
    const filtered = this._filter(sessions);

    if (filtered.length === 0 && this._closedPage === 1) {
      this._hasMoreClosed = false;
      return '<div class="no-data"><div class="no-data-icon">📦</div><div class="no-data-text">Không có TO nào đã đóng</div></div>';
    }

    if (filtered.length === 0 && this._closedPage > 1) {
      this._hasMoreClosed = false;
      return '<div class="end-of-list">Đã tải hết</div>';
    }

    let html = filtered.map((s) => this._renderCard(s)).join("");

    if (sessions.length < 20) {
      this._hasMoreClosed = false;
    }

    if (this._hasMoreClosed) {
      html +=
        '<button id="load-more-closed" class="btn-action" style="width:100%; margin-top:8px;">Tải thêm</button>';
    } else {
      html += '<div class="end-of-list">Đã tải hết</div>';
    }
    return html;
  }

  _fetchClosedSessions(page) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "GET_CLOSED_SESSIONS", page, limit: 20 },
        (response) => {
          if (response?.sessions) {
            resolve(response.sessions);
          } else {
            resolve([]);
          }
        },
      );
    });
  }

  // ─── Render tab Reprint ──────────────────────────────────────────────────
  _renderReprintTab() {
    const filtered = this._filter(this._printedLabels);
    if (filtered.length === 0)
      return '<div class="no-data"><div class="no-data-icon">🖨️</div><div class="no-data-text">Chưa có tem nào được in</div></div>';
    return filtered.map((l) => this._renderCardFromLabel(l)).join("");
  }

  // ─── Render tab Active Events ──────────────────────────────────────────
  async _renderActiveEventsTabAsync() {
    const events = await this.state.fetchActiveScanEvents(
      this._activeEventsPage,
      20,
    );
    const filtered = this._filter(events);

    if (filtered.length === 0 && this._activeEventsPage === 1) {
      this._hasMoreActiveEvents = false;
      return '<div class="no-data"><div class="no-data-icon">📋</div><div class="no-data-text">Không có đơn nào đang active</div></div>';
    }

    if (filtered.length === 0 && this._activeEventsPage > 1) {
      this._hasMoreActiveEvents = false;
      return '<div class="end-of-list">Đã tải hết</div>';
    }

    let html = filtered.map((e) => this._renderActiveEventCard(e)).join("");

    if (events.length < 20) {
      this._hasMoreActiveEvents = false;
    }

    if (this._hasMoreActiveEvents) {
      html +=
        '<button id="load-more-active-events" class="btn-action" style="width:100%; margin-top:8px;">Tải thêm</button>';
    } else {
      html += '<div class="end-of-list">Đã tải hết</div>';
    }
    return html;
  }

  // ─── Render từng card (cho các tab không diff) ─────────────────────────
  _renderCard(session) {
    const id = session.id;
    const typeListStr = this._getTypeListString(id);
    const status = session.status;
    const threshold = session.threshold || 30;
    const count = session.item_count;
    const percent = Math.min(100, Math.round((count / threshold) * 100));
    const statusClass = status === 'full' ? 'status-full' : status === 'open' ? 'status-open' : 'status-closed';
    const color = STATION_COLORS[id] || '#94a3b8';
    const textColor = getTextColor(color);

    const displayTime = session.session_start ? this._formatDateTime(session.session_start) : '';
    const dateStr = session.session_start ? this._formatDate(session.session_start) : '';
    const toNumber = session.to_number || '';

    return `
    <div class="card ${statusClass}" data-id="${id}" data-type="${typeListStr}">
      <div class="card-row">
        <div class="card-left">
          <div class="id-badge" style="background:${color}; color:${textColor};">${id}</div>
          <div>
            <div class="type" style="font-size:12px;">${typeListStr}</div>
            <div class="to-number" style="font-weight:600; color:#1e293b; font-size:13px;">${toNumber}</div>
            ${displayTime ? `<div class="time">${displayTime}</div>` : ''}
          </div>
        </div>
        <div class="card-actions">
          ${(status === 'open' || status === 'full') && count > 0
        ? `<button class="btn btn-close" data-action="close" data-id="${id}" data-type="${typeListStr}">Đóng</button>`
        : ''}
          ${status === 'closed'
        ? `<button class="btn btn-reprint" data-action="reprint-closed" data-id="${id}" data-type="${typeListStr}" data-to="${toNumber}" data-date="${dateStr}" data-number="${toNumber.split('-').pop() || ''}" data-qty="${count}">In lại</button>`
        : ''}
        </div>
      </div>
      <div class="progress-row">
        <div class="progress-bar">
          <div class="progress-fill" style="width:${percent}%; background:${color};"></div>
        </div>
        <span class="progress-text">${count}/${threshold}</span>
      </div>
    </div>
  `;
  }

  _renderCardFromLabel(label) {
    const stationId = label.id || '?';
    let typeListStr = this._getTypeListString(stationId);
    if (typeListStr === 'Unknown' || typeListStr === '') {
      typeListStr = label.displayType || 'Unknown';
    }
    const color = STATION_COLORS[stationId] || '#3b82f6';
    const textColor = getTextColor(color);
    const toNumber = label.toNumber || 'N/A';
    const email = label.email || 'unknown';
    const itemCount = label.itemCount ?? 0;

    // Lấy threshold từ session nếu có
    let threshold = null;
    if (this._sessions) {
      const session = this._sessions.find(s => s.id === stationId);
      if (session && session.threshold !== undefined && session.threshold > 0) {
        threshold = session.threshold;
      }
    }

    // Tính percent và text hiển thị
    let percent = 0;
    let progressText = '';

    if (threshold !== null && threshold > 0) {
      percent = Math.min(100, Math.round((itemCount / threshold) * 100));
      progressText = `${itemCount}/${threshold}`;
    } else {
      // Không có threshold => hiển thị count/∞ và thanh full
      percent = 100;
      progressText = `${itemCount}/∞`;
    }

    // Định dạng thời gian
    let displayTime = 'N/A';
    let dateStr = '';
    if (label.createdAt) {
      try {
        const d = new Date(label.createdAt);
        const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        displayTime = `${time} ${date}`;
        dateStr = this._formatDate(label.createdAt);
      } catch (e) {
        displayTime = 'Lỗi ngày';
      }
    }

    return `
    <div class="card status-closed" data-id="${stationId}" data-type="${typeListStr}">
      <div class="card-row">
        <div class="card-left">
          <div class="id-badge" style="background:${color}; color:${textColor};">${stationId}</div>
          <div>
            <div class="type" style="font-size:12px;">${typeListStr}</div>
            <div class="to-number" style="font-weight:600; color:#1e293b; font-size:13px;">${toNumber}</div>
            <div class="time">${displayTime}</div>
            <div class="email" style="font-size:11px; color:#64748b; margin-top:2px;">${email}</div>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn btn-reprint" data-action="reprint-label"
                  data-to="${label.toNumber}"
                  data-type="${typeListStr}"
                  data-id="${stationId}"
                  data-date="${dateStr}"
                  data-number="${label.number}"
                  data-email="${label.email}"
                  data-qty="${itemCount}">
            In lại
          </button>
        </div>
      </div>
      <div class="progress-row">
        <div class="progress-bar" style="background:#e2e8f0; height:8px; border-radius:4px; overflow:hidden; flex:1;">
          <div class="progress-fill" style="width:${percent}%; background:${color}; height:100%; border-radius:4px;"></div>
        </div>
        <span class="progress-text" style="min-width:60px; text-align:right;">${progressText}</span>
      </div>
    </div>
  `;
  }

  _renderActiveEventCard(event) {
    const stationId = event.station_id;
    const typeListStr = this._getTypeListString(stationId);
    const color = STATION_COLORS[stationId] || '#94a3b8';
    const textColor = getTextColor(color);
    const displayTime = event.created_at ? this._formatDateTime(event.created_at) : '';
    const returnTn = event.return_tn || '';

    return `
    <div class="card status-open" data-station="${stationId}" data-return="${returnTn}" data-type="${typeListStr}">
      <div class="card-row">
        <div class="card-left">
          <div class="id-badge" style="background:${color}; color:${textColor};">${stationId}</div>
          <div>
            <div class="type" style="font-size:12px;">${typeListStr}</div>
            <div class="return-tn" style="font-weight:500; color:#64748b; font-size:12px; margin-top:2px;">${returnTn}</div>
            ${displayTime ? `<div class="time">${displayTime}</div>` : ''}
          </div>
        </div>
        <div class="card-actions">
          <button class="btn btn-close" data-action="cancel-event" 
                  data-station="${stationId}" 
                  data-return="${returnTn}" 
                  data-type="${typeListStr}">
            Hủy
          </button>
        </div>
      </div>
    </div>
  `;
  }

  // ─── Gắn sự kiện cho các nút ──────────────────────────────────────────
  _attachCardEvents() {
    const contentArea = this.shadowRoot.getElementById("content-area");
    if (!contentArea) return;

    // Đóng session
    contentArea
      .querySelectorAll('.btn-close[data-action="close"]')
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (btn.disabled) return;
          const id = btn.dataset.id;
          const displayType = btn.dataset.type;
          if (confirm(`Đóng kiện ID ${id}?`)) {
            btn.disabled = true;
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<span class="spinner"></span>';
            this.state.closeSession(id, displayType).finally(() => {
              btn.disabled = false;
              btn.innerHTML = originalHTML;
            });
          }
        });
      });

    // Hủy đơn active
    contentArea
      .querySelectorAll('.btn-close[data-action="cancel-event"]')
      .forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (btn.disabled) return;
          const stationId = btn.dataset.station;
          const returnTn = btn.dataset.return;
          const displayType = btn.dataset.type;
          if (confirm(`Hủy đơn ${returnTn} khỏi ID ${stationId}?`)) {
            btn.disabled = true;
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<span class="spinner"></span>';
            try {
              await this.state.removeScan(returnTn, stationId, displayType);
              await this._fetchActiveEventsCount();
              if (this._activeTab === "active-events") {
                this._activeEventsPage = 1;
                this._hasMoreActiveEvents = true;
                this._renderAll();
              }
            } finally {
              btn.disabled = false;
              btn.innerHTML = originalHTML;
            }
          }
        });
      });

    // In lại (closed session)
    contentArea
      .querySelectorAll('.btn-reprint[data-action="reprint-closed"]')
      .forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (btn.disabled) return;
          const { to, id, date, number, qty } = btn.dataset;
          const typeList = this._getTypeListForId(id);
          btn.disabled = true;
          const originalHTML = btn.innerHTML;
          btn.innerHTML = '<span class="spinner"></span>';
          try {
            await printLabel(to, id, date, number, this.state.email, parseInt(qty), typeList);
            this.state.markPrinted(id);
          } catch (err) {
            console.error('Reprint failed:', err);
          } finally {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
          }
        });
      });

    // In lại (reprint tab)
    contentArea
      .querySelectorAll('.btn-reprint[data-action="reprint-label"]')
      .forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (btn.disabled) return;
          const { to, id, date, number, email, qty, type: displayType } = btn.dataset;
          // Lấy typeList từ sessions nếu có, fallback [displayType]
          let typeList = this._getTypeListForId(id);
          if (!typeList || typeList.length === 0 || typeList[0] === 'Unknown') {
            typeList = displayType ? [displayType] : ['Unknown'];
          }
          btn.disabled = true;
          const originalHTML = btn.innerHTML;
          btn.innerHTML = '<span class="spinner"></span>';
          try {
            await printLabel(to, id, date, number, email, parseInt(qty), typeList);
            this.state.markPrinted(id);
          } catch (err) {
            console.error('Reprint failed:', err);
          } finally {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
          }
        });
      });

    // Load more closed
    const loadMoreClosedBtn =
      this.shadowRoot.getElementById("load-more-closed");
    if (loadMoreClosedBtn) {
      loadMoreClosedBtn.addEventListener("click", async () => {
        if (loadMoreClosedBtn.disabled) return;
        loadMoreClosedBtn.disabled = true;
        loadMoreClosedBtn.innerHTML =
          '<span class="spinner"></span> Đang tải...';
        try {
          this._closedPage++;
          const moreHtml = await this._renderClosedTabAsync();
          loadMoreClosedBtn.remove();
          contentArea.insertAdjacentHTML("beforeend", moreHtml);
          this._attachCardEvents();
        } finally {
          if (loadMoreClosedBtn.parentNode) {
            loadMoreClosedBtn.disabled = false;
            loadMoreClosedBtn.textContent = "Tải thêm";
          }
        }
      });
    }

    // Load more active events
    const loadMoreActiveBtn = this.shadowRoot.getElementById(
      "load-more-active-events",
    );
    if (loadMoreActiveBtn) {
      loadMoreActiveBtn.addEventListener("click", async () => {
        if (loadMoreActiveBtn.disabled) return;
        loadMoreActiveBtn.disabled = true;
        loadMoreActiveBtn.innerHTML =
          '<span class="spinner"></span> Đang tải...';
        try {
          this._activeEventsPage++;
          const moreHtml = await this._renderActiveEventsTabAsync();
          loadMoreActiveBtn.remove();
          contentArea.insertAdjacentHTML("beforeend", moreHtml);
          this._attachCardEvents();
        } finally {
          if (loadMoreActiveBtn.parentNode) {
            loadMoreActiveBtn.disabled = false;
            loadMoreActiveBtn.textContent = "Tải thêm";
          }
        }
      });
    }
  }

  // ─── Update badges ──────────────────────────────────────────────────────
  _updateBadges() {
    const sessions = this._sessions || [];
    const openCount = sessions.filter(
      (s) => s.status === "open" || s.status === "full",
    ).length;
    const reprintCount = (this._printedLabels || []).length;

    const badgeOpen = this.shadowRoot.getElementById("badge-open");
    const badgeClosed = this.shadowRoot.getElementById("badge-closed");
    const badgeActiveEvents = this.shadowRoot.getElementById(
      "badge-active-events",
    );
    const badgeReprint = this.shadowRoot.getElementById("badge-reprint");

    if (badgeOpen) badgeOpen.textContent = openCount;
    if (badgeClosed) badgeClosed.textContent = this._closedCount;
    if (badgeActiveEvents)
      badgeActiveEvents.textContent = this._activeEventsCount;
    if (badgeReprint) badgeReprint.textContent = reprintCount;
  }

  // ─── Refresh (gọi từ bên ngoài) ────────────────────────────────────────
  refresh() {
    this._loadPrintedLabels();
    this._fetchClosedCount();
    this._fetchActiveEventsCount();
    this._renderAll();
  }
}