// content/ui/popup.js – Popup chính (Arrival) - hiển thị ngay, có animation
import { printLabel } from '../printer.js';

const ID_COLORS = {
  '1': '#E74C3C', '2': '#3498DB', '3': '#2ECC71', '4': '#F39C12',
  '5': '#9B59B6', '6': '#1ABC9C', '7': '#E67E22', '8': '#2C3E50',
  '9': '#E91E63', 'A': '#00BCD4', 'B': '#FF5722', 'C': '#795548', 'D': '#607D8B'
};

function getTextColor(bg) {
  return ['#2C3E50', '#795548', '#607D8B', '#F39C12', '#E67E22', '#00BCD4'].includes(bg) ? '#000' : '#fff';
}

const STYLES = `
:host { all: initial; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
.popup {
  position: fixed; width: 622px; background: #fff;
  border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.2), 0 0 0 2px rgba(0,0,0,0.05);
  z-index: 999999; overflow: hidden;
  display: flex; flex-direction: column;
  top: 50px; left: 50px;
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
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  flex-shrink: 0; transition: filter 0.2s, box-shadow 0.2s; color: white; font-weight: 700;
}
.badge-card.placeholder {
  background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.4);
}
.badge-card:hover:not(.placeholder) {
  filter: brightness(1.2);
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.badge-id { font-size: 16px; line-height: 1; }
.badge-type {
  font-size: 10px; font-weight: 500; opacity: 0.9;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px;
}
.badge-count { font-size: 12px; }
.badge-bar { width: 100%; height: 5px; background: rgba(255,255,255,0.3); border-radius: 3px; overflow: hidden; }
.badge-fill { height: 100%; background: #fff; border-radius: 3px; transition: width 0.4s ease; }
.actions { display: flex; gap: 8px; margin-left: 8px; }
.btn-icon {
  background: rgba(255,255,255,0.2); border: none; color: white;
  width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background 0.2s; font-size: 16px;
}
.btn-icon:hover { background: rgba(255,255,255,0.35); }
.body { padding: 24px; display: flex; flex-direction: column; gap: 16px; overflow: hidden; align-items: center; }
.minimized .body { display: none; }
.minimized .header-left { display: none; }
.minimized .actions { display: none; }
.state-card {
  border-radius: 20px; padding: 24px; text-align: center; transition: background 0.3s;
  width: 100%; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: 12px;
  animation: cardUpdate 0.25s ease;
}
@keyframes cardUpdate {
  0% { opacity: 0.7; transform: scale(0.98); }
  100% { opacity: 1; transform: scale(1); }
}
.id-big {
  font-size: 64px; font-weight: 800; line-height: 1.2; padding: 20px; border-radius: 20px;
  display: inline-block; transition: background 0.3s, color 0.3s;
}
.id-big.unknown {
  background: repeating-linear-gradient(45deg, #f0f0f0, #f0f0f0 10px, #e0e0e0 10px, #e0e0e0 20px);
  color: #999;
  border: 2px dashed #ccc;
}
.rv-text { font-size: 28px; font-weight: 700; color: #0f172a; word-break: break-all; min-height: 40px; }
.type-text { font-size: 22px; font-weight: 700; color: #334155; min-height: 30px; }
.progress-bar { height: 14px; background: #e2e8f0; border-radius: 7px; overflow: hidden; width: 100%; }
.progress-fill { height: 100%; border-radius: 7px; transition: width 0.4s ease; background: #cbd5e1; }
.count-text { font-size: 42px; font-weight: 800; color: #0f172a; min-height: 50px; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 16px 32px; border-radius: 16px; font-weight: 700; font-size: 22px;
  border: none; cursor: pointer; transition: all 0.2s; width: 100%;
}
.btn-close { background: #ee4d2d; color: white; }
.btn-close:hover { background: #d43d1a; }
.btn-close-early { background: #2196F3; color: white; }
.btn-close-early:hover { background: #1976D2; }
.btn-warning { background: #f97316; color: white; }
.btn-warning:hover { background: #ea580c; }
.btn-undo {
  background: #e2e8f0; color: #475569; font-size: 16px; padding: 8px 16px;
}
.btn-undo:hover { background: #cbd5e1; }
`;

export class UIManager {
  constructor(stateManager) {
    this.state = stateManager;
    stateManager.setUI(this);
    this.host = null;
    this.shadowRoot = null;
    this.popup = null;
    this.minimized = false;
    this.currentId = '';
    this._currentUrl = window.location.href;
    this._init();
    document.addEventListener('url-change', (e) => this._onUrlChange(e.detail.url));
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
    if (this._isArrivingPage()) this._updateTop5();
  }

  _init() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => this._init());
      return;
    }
    chrome.storage.local.get('popupPosition', (result) => {
      const savedPos = result.popupPosition || { left: 50, top: 50 };
      this._createHost(savedPos);
    });
  }

  _createHost({ left, top }) {
    this.host = document.createElement('div');
    this.host.id = 'as-popup-host';
    this.shadowRoot = this.host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLES;
    this.shadowRoot.appendChild(style);

    this.popup = document.createElement('div');
    this.popup.className = 'popup';
    this.popup.style.left = left + 'px';
    this.popup.style.top = top + 'px';

    this.popup.innerHTML = `
      <div class="header" id="header">
        <div class="header-left">
          <div class="title-row"><span>📦 Arrival Sort</span></div>
          <div class="top-row" id="top-row"></div>
        </div>
        <div class="actions">
          <button class="btn-icon" id="btn-minimize" title="Thu nhỏ">–</button>
        </div>
      </div>
      <div class="body" id="body">
        <div class="state-card" id="state-card">
          <div id="id-box" class="id-big" style="background:#cbd5e1; color:#fff; min-width: 80px;">?</div>
          <div class="type-text" id="type-el">--</div>
          <div class="rv-text" id="rv-el">----</div>
          <div class="progress-bar"><div id="progress-fill" class="progress-fill" style="width:0%"></div></div>
          <div class="count-text" id="count-el">0/30</div>
          <div id="button-container"></div>
          <div id="error-info" style="display:none;"></div>
        </div>
      </div>
    `;
    this.shadowRoot.appendChild(this.popup);
    document.body.appendChild(this.host);

    this._updateVisibility();
    this._clampPosition();
    this._setupDrag();
    this._bindEvents();
    this._updateTop5();
  }

  _clampPosition() {
    const rect = this.popup.getBoundingClientRect();
    let left = parseInt(this.popup.style.left, 10) || 50;
    let top = parseInt(this.popup.style.top, 10) || 50;
    const maxLeft = window.innerWidth - rect.width;
    const maxTop = window.innerHeight - rect.height;
    left = Math.max(0, Math.min(left, maxLeft));
    top = Math.max(0, Math.min(top, maxTop));
    this.popup.style.left = left + 'px';
    this.popup.style.top = top + 'px';
  }

  _savePosition() {
    const left = parseInt(this.popup.style.left, 10) || 50;
    const top = parseInt(this.popup.style.top, 10) || 50;
    chrome.storage.local.set({ popupPosition: { left, top } });
  }

  _setupDrag() {
    const header = this.shadowRoot.getElementById('header');
    if (!header) return;
    let startX, startY, initialLeft, initialTop, moved = false;

    const onMouseMove = (e) => {
      moved = true;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      let newLeft = initialLeft + dx, newTop = initialTop + dy;
      const rect = this.popup.getBoundingClientRect();
      const maxLeft = window.innerWidth - rect.width;
      const maxTop = window.innerHeight - rect.height;
      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));
      this.popup.style.left = newLeft + 'px';
      this.popup.style.top = newTop + 'px';
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (!moved && this.minimized) this.toggleMinimize();
      if (moved) this._savePosition();
      moved = false;
    };

    const startDrag = (e) => {
      if (e.target.closest('#btn-minimize')) return;
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

  _bindEvents() {
    this.shadowRoot.getElementById('btn-minimize').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMinimize();
    });
  }

  toggleMinimize() {
    this.minimized = !this.minimized;
    const header = this.shadowRoot.getElementById('header');

    if (this.minimized) {
      const rect = this.popup.getBoundingClientRect();
      this.popup.dataset.savedLeft = rect.left;
      this.popup.dataset.savedTop = rect.top;
      this.popup.classList.add('minimized');
      this.popup.style.left = '';
      this.popup.style.top = '';
      header.setAttribute('data-current-id', this.currentId || '?');
    } else {
      const savedLeft = parseFloat(this.popup.dataset.savedLeft);
      const savedTop = parseFloat(this.popup.dataset.savedTop);
      if (!isNaN(savedLeft)) this.popup.style.left = savedLeft + 'px';
      if (!isNaN(savedTop)) this.popup.style.top = savedTop + 'px';
      this.popup.classList.remove('minimized');
      header.removeAttribute('data-current-id');
      this._updateTop5();
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

  _updateTop5() {
    if (this.minimized || !this.shadowRoot) return;
    const topRow = this.shadowRoot.getElementById('top-row');
    if (!topRow) return;

    const sessions = this.state.sessions || [];
    const top5 = sessions.slice(0, 5);
    const SLOT_COUNT = 5;

    let html = '';
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = top5[i];
      if (s) {
        const threshold = s.threshold || 30;
        const count = s.item_count;
        const percent = Math.min(100, Math.round((count / threshold) * 100));
        const bgColor = ID_COLORS[s.id] || '#607D8B';
        const shortType = (s.type_group || '').substring(0, 12);
        html += `<div class="badge-card" style="background:${bgColor};" title="ID ${s.id}: ${s.type_group} – ${count}/${threshold}">
          <div class="badge-id">${s.id}</div>
          <div class="badge-type" title="${s.type_group}">${shortType || '-'}</div>
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
  }

  updateTop5(sessions) {
    this.state.sessions = sessions;
    if (this.shadowRoot) this._updateTop5();
  }

  _updateCard({ id, type, rv, count, threshold, isFull, error, unknownId }) {
    if (!this.shadowRoot) return;
    const idBox = this.shadowRoot.getElementById('id-box');
    const typeEl = this.shadowRoot.getElementById('type-el');
    const rvEl = this.shadowRoot.getElementById('rv-el');
    const progressFill = this.shadowRoot.getElementById('progress-fill');
    const progressBar = progressFill?.parentNode;
    const countEl = this.shadowRoot.getElementById('count-el');
    const btnContainer = this.shadowRoot.getElementById('button-container');
    const card = this.shadowRoot.getElementById('state-card');
    const errorInfo = this.shadowRoot.getElementById('error-info');

    if (idBox) { idBox.style.display = 'none'; idBox.classList.remove('unknown'); }
    if (typeEl) typeEl.style.display = 'none';
    if (rvEl) rvEl.style.display = 'none';
    if (progressBar) progressBar.style.display = 'none';
    if (countEl) countEl.style.display = 'none';
    if (btnContainer) btnContainer.innerHTML = '';
    if (errorInfo) errorInfo.style.display = 'none';

    const isUnknown = unknownId || (error && !id);

    if (error) {
      if (idBox) {
        if (isUnknown) {
          idBox.style.background = '';
          idBox.style.color = '';
          idBox.textContent = '?';
          idBox.classList.add('unknown');
          idBox.style.display = 'inline-block';
        } else {
          const bgColor = ID_COLORS[id] || '#607D8B';
          const textColor = getTextColor(bgColor);
          idBox.style.background = bgColor;
          idBox.style.color = textColor;
          idBox.textContent = id;
          idBox.style.display = 'inline-block';
        }
      }
      if (card) card.style.background = error.reason === 'Sai tuyến' ? '#fff3cd' : '#f8d7da';
      if (type && typeEl) {
        typeEl.textContent = type;
        typeEl.style.display = 'block';
      }
      if (rv && rvEl) {
        rvEl.textContent = rv;
        rvEl.style.display = 'block';
      }
      if (errorInfo) {
        errorInfo.style.display = 'block';
        errorInfo.innerHTML = `
          <div style="font-size:24px; font-weight:700; color:${error.reason === 'Sai tuyến' ? '#856404' : '#721c24'}; margin-bottom:8px;">${error.reason}</div>
          <div style="font-size:16px; color:#555;">${error.detail || ''}</div>
        `;
      }
      if (card) {
        card.style.animation = 'none';
        card.offsetHeight;
        card.style.animation = 'cardUpdate 0.25s ease';
      }
      if (id && count > 0 && btnContainer) {
        btnContainer.style.display = 'block'; // đảm bảo visible
        btnContainer.innerHTML = `<button class="btn btn-undo" id="btn-undo">↩️ Hủy RV này</button>`;
        btnContainer.querySelector('#btn-undo')?.addEventListener('click', () => {
          if (confirm(`Hủy RV ${rv} khỏi ID ${id}?`)) {
            this.state.removeScan(rv, id, type);
          }
        });
      }
      return;
    }

    if (idBox) idBox.style.display = 'inline-block';
    if (typeEl) typeEl.style.display = 'block';
    if (rvEl) rvEl.style.display = 'block';
    if (progressBar) progressBar.style.display = 'block';
    if (countEl) countEl.style.display = 'block';

    if (idBox) {
      if (isUnknown) {
        idBox.style.background = '';
        idBox.style.color = '';
        idBox.textContent = '?';
        idBox.classList.add('unknown');
      } else {
        const bgColor = ID_COLORS[id] || '#607D8B';
        const textColor = getTextColor(bgColor);
        idBox.style.background = bgColor;
        idBox.style.color = textColor;
        idBox.textContent = id;
      }
    }
    if (card) card.style.background = isUnknown ? '#fff7ed' : (isFull ? '#f0fdf4' : '#f8fafc');
    if (typeEl) typeEl.textContent = type || '--';
    if (rvEl) rvEl.textContent = rv || '----';

    const percent = (count !== undefined && threshold) ? Math.min(100, Math.round((count / threshold) * 100)) : 0;
    if (progressFill) {
      progressFill.style.width = percent + '%';
      progressFill.style.background = (id && !isUnknown && ID_COLORS[id]) ? ID_COLORS[id] : '#cbd5e1';
    }

    if (countEl) {
      countEl.textContent = count !== undefined ? `${count}/${threshold || 30}` : `0/30`;
    }

    if (count > 0 && id && !isUnknown && btnContainer) {
      const undoButton = `<button class="btn btn-undo" id="btn-undo">↩️ Hủy RV này</button>`;
      if (isFull) {
        btnContainer.innerHTML = `
      <button class="btn btn-close" id="btn-close">Xác nhận đóng gói (đầy)</button>
      ${undoButton}
    `;
      } else {
        btnContainer.innerHTML = `
      <button class="btn btn-close-early" id="btn-close-early">Đóng gói ngay (${count}/${threshold || 30})</button>
      ${undoButton}
    `;
      }
      // Gán sự kiện cho nút đóng gói
      btnContainer.querySelector('#btn-close')?.addEventListener('click', () => this.state.closeSession(id, type));
      btnContainer.querySelector('#btn-close-early')?.addEventListener('click', () => {
        if (confirm('Bạn có chắc muốn đóng gói khi chưa đủ số lượng?\nThao tác này sẽ in tem TO và kết thúc lô hàng hiện tại.')) {
          this.state.closeSession(id, type);
        }
      });
      // Gán sự kiện cho nút hủy
      btnContainer.querySelector('#btn-undo')?.addEventListener('click', () => {
        if (confirm(`Hủy RV ${rv} khỏi ID ${id}?`)) {
          this.state.removeScan(rv, id, type);
        }
      });
    } else if (btnContainer) {
      btnContainer.innerHTML = '';
    }

    if (card) {
      card.style.animation = 'none';
      card.offsetHeight;
      card.style.animation = 'cardUpdate 0.25s ease';
    }
  }

  showDetected(rv, type, id, session) {
    this.currentId = id || '';
    this._updateCard({
      id: id || null,
      type: type || null,
      rv,
      count: session?.item_count || 0,
      threshold: session?.threshold || 30,
      isFull: session?.status === 'full',
      unknownId: !id
    });
  }

  showSuccess(rv, type, id, serverData) {
    this.currentId = id;
    this._updateCard({
      id, type, rv,
      count: serverData.item_count,
      threshold: serverData.threshold || 30,
      isFull: serverData.status === 'full',
      unknownId: !id
    });
  }

  showFullAlert(id, type) {
    if (!this.shadowRoot) return;
    const btnContainer = this.shadowRoot.getElementById('button-container');
    if (btnContainer && !btnContainer.querySelector('#btn-close')) {
      btnContainer.innerHTML = '<button class="btn btn-close" id="btn-close">Xác nhận đóng gói (đầy)</button>';
      btnContainer.querySelector('#btn-close')?.addEventListener('click', () => this.state.closeSession(id, type));
    }
  }

  showWarning(msg) {
    this._updateCard({ rv: msg, error: { reason: 'Cảnh báo', detail: '' }, unknownId: true });
  }

  showError(msg) {
    this._updateCard({ rv: msg, error: { reason: 'Lỗi', detail: '' }, unknownId: true });
  }

  showScanError({ rv, type, id, reason, detail }) {
    this.currentId = id || '';
    this._updateCard({
      id: id || null,
      type: type || null,
      rv,
      error: { reason, detail },
      unknownId: !id
    });
  }

  async _retryPrint(toNumber, type, id, dateStr, number, email, itemCount) {
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      try {
        await printLabel(toNumber, type, id, dateStr, number, email, itemCount);
        return;
      } catch (e) {
        console.error(`Print attempt ${attempts + 1} failed:`, e);
        attempts++;
        if (attempts < maxAttempts) await new Promise(r => setTimeout(r, 1000));
      }
    }
    alert('In thất bại sau 3 lần thử. Vui lòng kiểm tra máy in hoặc tải file HTML.');
    const html = this._generateLabelHTML(toNumber, type, id, dateStr, number, email, itemCount);
    const blob = new Blob([html], { type: 'text/html;charset=UTF-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${toNumber}.html`;
    a.click();
  }

  _generateLabelHTML(toNumber, type, id, dateStr, number, email, itemCount) {
    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: 100mm 50mm; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 100mm; height: 50mm;
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background: white;
      display: flex; align-items: stretch;
    }
    .left {
      width: 67%;
      display: flex; flex-direction: column; justify-content: space-between;
      padding: 3mm 3mm 3mm 5mm;
    }
    .right {
      width: 33%;
      display: flex; flex-direction: column; align-items: center; justify-content: space-between;
      padding: 3mm 5mm 3mm 0;
    }
    .to-main {
      font-size: 24px; font-weight: 800; color: #000;
      letter-spacing: 0.5px; line-height: 1.2;
      text-transform: uppercase;
    }
    .to-small { text-transform: uppercase; margin-bottom: 1mm; }
    .number-text { font-size: 18px; font-weight: 700; color: #000; font-family: 'Courier New', Courier, monospace; letter-spacing: 0.5px; }
    .date-text { font-size: 16px; font-weight: 700; color: #000; font-family: 'Courier New', Courier, monospace; }
    .email-text { font-size: 12px; font-weight: 500; color: #000; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .qty-text { font-size: 16px; font-weight: 700; color: #000; font-family: 'Courier New', Courier, monospace; }
    .qr-wrapper img { width: 30mm; height: 30mm; filter: grayscale(100%) contrast(150%); }
  </style>
</head>
<body>
  <div class="left">
    <div class="to-main">TO-${type}-${id}</div>
    <div class="number-text">${number}</div>
    <div class="date-text">${dateStr}</div>
    <div class="qty-text">QTY: ${itemCount}</div>
    <div class="email-text" title="${email}">${email}</div>
  </div>
  <div class="right">
    <div class="to-small">TO-${type}-${id}</div>
    <div class="qr-wrapper">
      <img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0id2hpdGUiLz48L3N2Zz4=" alt="QR" />
    </div>
    <div class="qty-text">QTY: ${itemCount}</div>
  </div>
</body>
</html>`;
  }

  async _savePrintedLabel(labelData) {
    const { printedLabels } = await chrome.storage.local.get('printedLabels');
    const labels = printedLabels || [];
    labels.unshift(labelData);
    if (labels.length > 10) labels.pop();
    await chrome.storage.local.set({ printedLabels: labels });
  }

  printAndClose(id, type, toNumber, itemCount) {
    this._updateCard({
      id, type, rv: 'Đang in...',
      count: itemCount, threshold: 0, isFull: false
    });
    const date = new Date();
    const dateStr = `${date.getDate().toString().padStart(2, '0')} ${date.getMonth() + 1} ${date.getFullYear().toString().slice(-2)}`;
    const numberPart = toNumber.split('-').pop();
    this._retryPrint(toNumber, type, id, dateStr, numberPart, this.state.email, itemCount)
      .then(() => {
        this._savePrintedLabel({ toNumber, type, id, dateStr, number: numberPart, email: this.state.email, itemCount });
        this.state.markPrinted(id);
        this._updateCard({
          id, type, rv: '✅ Đã đóng gói',
          count: itemCount, threshold: 0, isFull: false
        });
      })
      .catch(() => {
        this._updateCard({
          id, type, rv: '❌ In thất bại',
          count: itemCount, threshold: 0, isFull: false
        });
        if (this.shadowRoot) {
          const btnContainer = this.shadowRoot.getElementById('button-container');
          if (btnContainer) {
            btnContainer.innerHTML = '<button class="btn btn-warning" id="btn-retry-print">In lại</button>';
            btnContainer.querySelector('#btn-retry-print')?.addEventListener('click', () => this.printAndClose(id, type, toNumber, itemCount));
          }
        }
      });
  }
}