// content/ui/dashboard.js – Dashboard quản lý TO (hoàn chỉnh, sửa lỗi await)
import { printLabel } from '../printer.js';

const ID_COLORS = {
  '1': '#E74C3C', '2': '#3498DB', '3': '#2ECC71', '4': '#F39C12',
  '5': '#9B59B6', '6': '#1ABC9C', '7': '#E67E22', '8': '#2C3E50',
  '9': '#E91E63', 'A': '#00BCD4', 'B': '#FF5722', 'C': '#795548', 'D': '#607D8B'
};

function getTextColor(bg) {
  return ['#2C3E50', '#795548', '#607D8B', '#F39C12', '#E67E22', '#00BCD4'].includes(bg) ? '#000' : '#fff';
}

const DASH_STYLES = `
:host { all: initial; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
.popup {
  position: fixed; top: 100px; right: 20px; width: 480px; background: #fff;
  border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.2);
  z-index: 999998; overflow: hidden;
  display: flex; flex-direction: column;
}
.popup.minimized {
  width: 48px; height: 48px; border-radius: 50%; cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  right: 20px; bottom: 80px; left: auto; top: auto;
}
.header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; background: #1E293B; color: white; cursor: move;
}
.minimized .header {
  padding: 0; justify-content: center; width: 48px; height: 48px; border-radius: 50%;
  cursor: pointer; background: #1E293B; position: relative; overflow: hidden;
}
.minimized .header > * { display: none !important; }
.minimized .header::after {
  content: '📊'; display: block; font-size: 24px; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
}
.minimized .tabs, .minimized .body { display: none; }
.btn-icon {
  background: rgba(255,255,255,0.2); border: none; color: white;
  width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background 0.2s; font-size: 16px;
}
.btn-icon:hover { background: rgba(255,255,255,0.35); }
.tabs {
  display: flex; border-bottom: 1px solid #e2e8f0; background: #f8fafc;
}
.tab {
  flex: 1; text-align: center; padding: 12px 8px; font-size: 13px; font-weight: 600;
  cursor: pointer; color: #64748b; position: relative; transition: all 0.2s;
  border-bottom: 3px solid transparent;
}
.tab.active { color: #1E293B; border-bottom-color: #3b82f6; }
.tab-badge {
  background: #e2e8f0; color: #475569; font-size: 11px; padding: 2px 8px; border-radius: 10px;
  margin-left: 4px; font-weight: 700;
}
.tab.active .tab-badge { background: #3b82f6; color: white; }
.body { padding: 12px; overflow-y: auto; max-height: 55vh; }
.search-row { display: flex; gap: 8px; margin-bottom: 10px; }
.search-input {
  flex: 1; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px;
}
.btn-action {
  padding: 8px 14px; border: none; border-radius: 8px; font-weight: 600; font-size: 13px;
  cursor: pointer; transition: all 0.2s;
}
.btn-close-all { background: #ef4444; color: white; }
.btn-close-all:hover { background: #dc2626; }
.card {
  background: #f8fafc; border-radius: 12px; padding: 12px; margin-bottom: 8px;
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
.type { font-size: 14px; font-weight: 600; color: #1e293b; }
.count { font-size: 14px; font-weight: 700; color: #475569; }
.time { font-size: 11px; color: #94a3b8; margin-top: 2px; }
.progress-row { margin-top: 8px; display: flex; align-items: center; gap: 8px; }
.progress-bar { flex: 1; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
.progress-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease; }
.progress-text { font-size: 12px; font-weight: 600; color: #64748b; min-width: 40px; text-align: right; }
.card-actions { display: flex; gap: 6px; }
.btn {
  border: none; padding: 6px 12px; border-radius: 6px; font-weight: 600; font-size: 12px; cursor: pointer; transition: all 0.2s;
}
.btn-close { background: #ef4444; color: white; }
.btn-close:hover { background: #dc2626; }
.btn-reprint { background: #3b82f6; color: white; }
.btn-reprint:hover { background: #2563eb; }
.no-data {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 30px; color: #94a3b8;
}
.no-data-icon { font-size: 40px; margin-bottom: 8px; }
.no-data-text { font-size: 14px; }
`;

export class DashboardUI {
  constructor(stateManager) {
    this.state = stateManager;
    this.host = null;
    this.shadowRoot = null;
    this.popup = null;
    this.minimized = false;
    this._activeTab = 'open';
    this._searchTerm = '';
    this._sessions = [];
    this._printedLabels = [];
    this._closedCount = 0;
    this._closedPage = 1;
    this._hasMoreClosed = true;
    this._currentUrl = window.location.href;
    this._init();
    document.addEventListener('url-change', (e) => this._onUrlChange(e.detail.url));
    stateManager.addListener((sessions) => this._onSessionsUpdate(sessions));
  }

  _init() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => this._init());
      return;
    }
    this._createHost();
    this._loadPrintedLabels();
    this._fetchClosedCount();
  }

  async _fetchClosedCount() {
    chrome.runtime.sendMessage({ action: 'GET_CLOSED_COUNT' }, (response) => {
      if (response?.count !== undefined) {
        this._closedCount = response.count;
        this._updateBadges();
      }
    });
  }

  _onUrlChange(newUrl) {
    if (newUrl !== this._currentUrl) {
      this._currentUrl = newUrl;
      this._updateVisibility();
    }
  }

  _isArrivingPage() {
    return this._currentUrl.includes('/v2/returninbound/arrving');
  }

  _updateVisibility() {
    if (!this.host) return;
    this.host.style.display = this._isArrivingPage() ? '' : 'none';
  }

  _createHost() {
    this.host = document.createElement('div');
    this.host.id = 'qc-dashboard-host';
    this.shadowRoot = this.host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = DASH_STYLES;
    this.shadowRoot.appendChild(style);

    this.popup = document.createElement('div');
    this.popup.className = 'popup';
    this.popup.innerHTML = `
      <div class="header" id="dash-header">
        <span>📊 Quản lý TO</span>
        <button class="btn-icon" id="dash-minimize">–</button>
      </div>
      <div class="tabs">
        <div class="tab active" data-tab="open">Đang mở <span class="tab-badge" id="badge-open">0</span></div>
        <div class="tab" data-tab="closed">Đã đóng <span class="tab-badge" id="badge-closed">0</span></div>
        <div class="tab" data-tab="reprint">In lại <span class="tab-badge" id="badge-reprint">0</span></div>
      </div>
      <div class="body">
        <div class="search-row">
          <input class="search-input" placeholder="🔍 Lọc theo ID..." id="search-box" />
          <button class="btn-action btn-close-all" id="btn-close-all" style="display:none;">Đóng tất cả</button>
        </div>
        <div id="content-area"></div>
      </div>
    `;
    this.shadowRoot.appendChild(this.popup);
    document.body.appendChild(this.host);

    this._setupDrag();
    this._bindEvents();
    this._renderAll();
  }

  _bindEvents() {
    const minimizeBtn = this.shadowRoot.getElementById('dash-minimize');
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleMinimize();
    });

    this.shadowRoot.getElementById('search-box').addEventListener('input', (e) => {
      this._searchTerm = e.target.value.toLowerCase();
      this._renderAll();
    });

    this.shadowRoot.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this._activeTab = e.currentTarget.dataset.tab;
        if (this._activeTab === 'closed') {
          this._closedPage = 1;
          this._hasMoreClosed = true;
        }
        this._updateTabStyles();
        this._renderAll();
      });
    });

    this.shadowRoot.getElementById('btn-close-all').addEventListener('click', () => {
      const openSessions = (this._sessions || []).filter(s => s.status === 'open' || s.status === 'full');
      if (openSessions.length === 0) return;
      if (confirm(`Đóng tất cả ${openSessions.length} ID đang mở?`)) {
        openSessions.forEach(s => this.state.closeSession(s.id, s.type_group));
      }
    });
  }

  _toggleMinimize() {
    this.minimized = !this.minimized;
    const header = this.shadowRoot.getElementById('dash-header');

    if (this.minimized) {
      const rect = this.popup.getBoundingClientRect();
      this.popup.dataset.savedLeft = rect.left;
      this.popup.dataset.savedTop = rect.top;
      this.popup.classList.add('minimized');
      this.popup.style.left = '';
      this.popup.style.top = '';
    } else {
      const arrivalHost = document.getElementById('qc-popup-host');
      if (arrivalHost && arrivalHost.style.display !== 'none') {
        const arrivalPopup = arrivalHost.shadowRoot?.querySelector('.popup');
        if (arrivalPopup && !arrivalPopup.classList.contains('minimized')) {
          const arrivalRect = arrivalPopup.getBoundingClientRect();
          const newLeft = arrivalRect.right + 20;
          const newTop = arrivalRect.top;
          const dashWidth = 480;
          const maxLeft = window.innerWidth - dashWidth;
          this.popup.style.left = Math.min(newLeft, maxLeft) + 'px';
          this.popup.style.top = Math.max(0, newTop) + 'px';
          this.popup.dataset.savedLeft = this.popup.style.left;
          this.popup.dataset.savedTop = this.popup.style.top;
        } else {
          this._restoreSavedPosition();
        }
      } else {
        this._restoreSavedPosition();
      }
      this.popup.classList.remove('minimized');
      this._renderAll();
    }

    if (this._dragStartHandler) {
      if (this.minimized) {
        header.removeEventListener('mousedown', this._dragStartHandler);
        this.popup.addEventListener('mousedown', this._dragStartHandler);
      } else {
        this.popup.removeEventListener('mousedown', this._dragStartHandler);
        header.addEventListener('mousedown', this._dragStartHandler);
      }
    }
  }

  _restoreSavedPosition() {
    const savedLeft = parseFloat(this.popup.dataset.savedLeft);
    const savedTop = parseFloat(this.popup.dataset.savedTop);
    if (!isNaN(savedLeft)) this.popup.style.left = savedLeft + 'px';
    if (!isNaN(savedTop)) this.popup.style.top = savedTop + 'px';
  }

  _setupDrag() {
    const header = this.shadowRoot.getElementById('dash-header');
    if (!header) return;
    let startX, startY, initialLeft, initialTop, moved = false;

    const onMouseMove = (e) => {
      moved = true;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      let newLeft = initialLeft + dx, newTop = initialTop + dy;
      const rect = this.popup.getBoundingClientRect();
      newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - rect.width));
      newTop = Math.max(0, Math.min(newTop, window.innerHeight - rect.height));
      this.popup.style.left = newLeft + 'px';
      this.popup.style.top = newTop + 'px';
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (!moved && this.minimized) this._toggleMinimize();
      moved = false;
    };

    const startDrag = (e) => {
      if (e.target.closest('#dash-minimize')) return;
      startX = e.clientX; startY = e.clientY;
      const rect = this.popup.getBoundingClientRect();
      initialLeft = rect.left; initialTop = rect.top;
      moved = false;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    if (this.minimized) {
      this.popup.addEventListener('mousedown', startDrag);
    } else {
      header.addEventListener('mousedown', startDrag);
    }
    this._dragStartHandler = startDrag;
  }

  _updateTabStyles() {
    this.shadowRoot.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === this._activeTab);
    });
    const btnCloseAll = this.shadowRoot.getElementById('btn-close-all');
    btnCloseAll.style.display = this._activeTab === 'open' ? 'block' : 'none';
  }

  _onSessionsUpdate(sessions) {
    this._sessions = sessions;
    this._renderAll();
    this._fetchClosedCount();
  }

  async _loadPrintedLabels() {
    const { printedLabels } = await chrome.storage.local.get('printedLabels');
    this._printedLabels = printedLabels || [];
    this._renderAll();
  }

  _filter(items) {
    if (!this._searchTerm) return items;
    return items.filter(item => {
      const id = item.id || '';
      return id.toLowerCase().includes(this._searchTerm);
    });
  }

  _renderAll() {
    this._updateBadges();
    const contentArea = this.shadowRoot.getElementById('content-area');
    if (!contentArea) return;

    switch (this._activeTab) {
      case 'open':
        contentArea.innerHTML = this._renderOpenTab();
        this._attachCardEvents();
        break;
      case 'closed':
        this._renderClosedTabAsync().then(html => {
          contentArea.innerHTML = html;
          this._attachCardEvents();
        });
        break;
      case 'reprint':
        contentArea.innerHTML = this._renderReprintTab();
        this._attachCardEvents();
        break;
    }
  }

  _updateBadges() {
    const sessions = this._sessions || [];
    const openCount = sessions.filter(s => s.status === 'open' || s.status === 'full').length;
    // Số lượng closed không lấy từ this._sessions, nhưng vẫn hiển thị badge tạm
    this.shadowRoot.getElementById('badge-open').textContent = openCount;
    this.shadowRoot.getElementById('badge-closed').textContent = this._closedCount;
    this.shadowRoot.getElementById('badge-reprint').textContent = (this._printedLabels || []).length;
  }

  _renderOpenTab() {
    const sessions = this._sessions || [];
    const openSessions = sessions.filter(s => s.status === 'open' || s.status === 'full');
    const filtered = this._filter(openSessions);
    if (filtered.length === 0) return '<div class="no-data"><div class="no-data-icon">📭</div><div class="no-data-text">Không có ID nào đang mở</div></div>';
    return filtered.map(s => this._renderCard(s)).join('');
  }

  async _renderClosedTabAsync() {
    const sessions = await this._fetchClosedSessions(this._closedPage);
    const filtered = this._filter(sessions);
    if (filtered.length === 0 && this._closedPage === 1) {
      return '<div class="no-data"><div class="no-data-icon">📦</div><div class="no-data-text">Không có TO nào đã đóng</div></div>';
    }
    let html = filtered.map(s => this._renderCard(s)).join('');
    if (this._hasMoreClosed) {
      html += '<button id="load-more-closed" class="btn-action" style="width:100%; margin-top:8px;">Tải thêm</button>';
    }
    return html;
  }

  _fetchClosedSessions(page) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'GET_CLOSED_SESSIONS', page, limit: 20 }, (response) => {
        if (response?.sessions) {
          if (response.sessions.length < 20) this._hasMoreClosed = false;
          resolve(response.sessions);
        } else {
          resolve([]);
        }
      });
    });
  }

  _renderReprintTab() {
    const filtered = this._filter(this._printedLabels);
    if (filtered.length === 0) return '<div class="no-data"><div class="no-data-icon">🖨️</div><div class="no-data-text">Chưa có tem nào được in</div></div>';
    return filtered.map(l => this._renderCardFromLabel(l)).join('');
  }

  _renderCard(session) {
    const status = session.status;
    const threshold = session.threshold || 30;
    const count = session.item_count;
    const percent = Math.min(100, Math.round((count / threshold) * 100));
    const statusClass = status === 'full' ? 'status-full' : (status === 'open' ? 'status-open' : 'status-closed');

    // Lấy màu từ ID_COLORS, nếu không có thì dùng màu mặc định
    const color = ID_COLORS[session.id] || '#94a3b8';
    const textColor = getTextColor(color);

    const timeStr = session.session_start ? new Date(session.session_start).toLocaleTimeString('vi-VN') : '';

    return `
    <div class="card ${statusClass}" data-id="${session.id}" data-type="${session.type_group || ''}">
      <div class="card-row">
        <div class="card-left">
          <div class="id-badge" style="background:${color}; color:${textColor};">${session.id}</div>
          <div>
            <div class="type">${session.type_group || ''}</div>
            ${timeStr ? `<div class="time">${timeStr}</div>` : ''}
          </div>
        </div>
        <div class="card-actions">
          ${(status === 'open' || status === 'full') && count > 0 ? `<button class="btn btn-close" data-action="close" data-id="${session.id}" data-type="${session.type_group}">Đóng</button>` : ''}
          ${status === 'closed' ? `<button class="btn btn-reprint" data-action="reprint-closed" data-id="${session.id}" data-type="${session.type_group}" data-to="${session.to_number || ''}" data-date="${timeStr}" data-number="${session.to_number ? session.to_number.split('-').pop() : ''}" data-qty="${count}">In lại</button>` : ''}
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
    const color = ID_COLORS[label.id] || '#3b82f6';
    const textColor = getTextColor(color);

    return `
    <div class="card status-closed" data-id="${label.id}" data-type="${label.type}">
      <div class="card-row">
        <div class="card-left">
          <div class="id-badge" style="background:${color}; color:${textColor};">${label.id || '?'}</div>
          <div>
            <div class="type">${label.type || ''}</div>
            <div class="time">${label.dateStr || ''}</div>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn btn-reprint" data-action="reprint-label" data-to="${label.toNumber}" data-type="${label.type}" data-id="${label.id}" data-date="${label.dateStr}" data-number="${label.number}" data-email="${label.email}" data-qty="${label.itemCount}">In lại</button>
        </div>
      </div>
      <div class="progress-row">
        <span class="progress-text">QTY: ${label.itemCount}</span>
      </div>
    </div>
  `;
  }

  _attachCardEvents() {
    const contentArea = this.shadowRoot.getElementById('content-area');
    if (!contentArea) return;

    contentArea.querySelectorAll('.btn-close').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const type = btn.dataset.type;
        if (confirm(`Đóng gói ID ${id}?`)) this.state.closeSession(id, type);
      });
    });

    contentArea.querySelectorAll('.btn-reprint[data-action="reprint-closed"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const { to, type, id, date, number, qty } = btn.dataset;
        printLabel(to, type, id, date, number, this.state.email, parseInt(qty));
      });
    });

    contentArea.querySelectorAll('.btn-reprint[data-action="reprint-label"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const { to, type, id, date, number, email, qty } = btn.dataset;
        printLabel(to, type, id, date, number, email, parseInt(qty));
      });
    });

    // Sự kiện nút "Tải thêm" cho tab Đã đóng
    const loadMoreBtn = this.shadowRoot.getElementById('load-more-closed');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', async () => {
        this._closedPage++;
        const moreHtml = await this._renderClosedTabAsync();
        loadMoreBtn.remove();
        contentArea.insertAdjacentHTML('beforeend', moreHtml);
        this._attachCardEvents();
      });
    }
  }
}