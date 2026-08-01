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
  position: fixed; top: 50px; left: 50px; width: 600px; background: #fff;
  border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.2), 0 0 0 2px rgba(0,0,0,0.05);
  z-index: 999999; overflow: hidden;
  transition: width 0.3s ease, height 0.3s ease, border-radius 0.3s ease;
  display: flex; flex-direction: column;
}
.popup.minimized {
  width: 56px; height: 56px; border-radius: 50%; cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px; background: #1E293B; color: white;
  cursor: move; user-select: none;
}
.minimized .header {
  padding: 0; justify-content: center; width: 56px; height: 56px; border-radius: 50%; cursor: pointer;
  background: #1E293B;
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
.minimized .header::after {
  content: attr(data-current-id); font-size: 28px; font-weight: 700; color: white;
}
.state-card {
  border-radius: 20px; padding: 24px; text-align: center; transition: background 0.3s;
  width: 100%; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: 12px;
}
.id-big {
  font-size: 64px; font-weight: 800; line-height: 1.2; padding: 20px; border-radius: 20px;
  display: inline-block; transition: background 0.3s, color 0.3s;
}
.rv-text { font-size: 28px; font-weight: 700; color: #0f172a; word-break: break-all; min-height: 40px; }
.type-text { font-size: 22px; color: #334155; min-height: 30px; }
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
.print-status { display: flex; align-items: center; gap: 12px; font-size: 20px; color: #334155; }
.spinner {
  width: 24px; height: 24px; border: 3px solid #cbd5e1; border-top-color: #ee4d2d; border-radius: 50%; animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
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
    this._createHost();
  }

  _createHost() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => this._createHost());
      return;
    }
    if (this.host) return;
    this.host = document.createElement('div');
    this.host.id = 'qc-popup-host';
    document.body.appendChild(this.host);
    this.shadowRoot = this.host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLES;
    this.shadowRoot.appendChild(style);

    this.popup = document.createElement('div');
    this.popup.className = 'popup';
    this.popup.innerHTML = `
      <div class="header" id="header">
        <div class="header-left">
          <div class="title-row"><span>📦 QC Arrival</span></div>
          <div class="top-row" id="top-row"></div>
        </div>
        <div class="actions">
          <button class="btn-icon" id="btn-minimize" title="Thu nhỏ">–</button>
        </div>
      </div>
      <div class="body" id="body">
        <div class="state-card" id="state-card">
          <div id="id-box" class="id-big" style="background:#cbd5e1; color:#fff;">?</div>
          <div class="type-text" id="type-el">--</div>
          <div class="rv-text" id="rv-el">----</div>
          <div class="progress-bar"><div id="progress-fill" class="progress-fill" style="width:0%"></div></div>
          <div class="count-text" id="count-el">0/30</div>
          <div id="button-container"></div>
        </div>
      </div>
    `;
    this.shadowRoot.appendChild(this.popup);
    this._setupDrag();
    this._bindEvents();
    this._updateTop5();
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
      newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - rect.width));
      newTop = Math.max(0, Math.min(newTop, window.innerHeight - rect.height));
      this.popup.style.left = newLeft + 'px';
      this.popup.style.top = newTop + 'px';
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (!moved && this.minimized) this.toggleMinimize();
      moved = false;
    };
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('#btn-minimize')) return;
      startX = e.clientX; startY = e.clientY;
      const rect = this.popup.getBoundingClientRect();
      initialLeft = rect.left; initialTop = rect.top;
      moved = false;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  _bindEvents() {
    this.shadowRoot.getElementById('btn-minimize').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMinimize();
    });
  }

  toggleMinimize() {
    this.minimized = !this.minimized;
    if (this.minimized) {
      this.popup.classList.add('minimized');
      this.popup.querySelector('.header').setAttribute('data-current-id', this.currentId || '?');
    } else {
      this.popup.classList.remove('minimized');
      this.popup.querySelector('.header').removeAttribute('data-current-id');
      this._updateTop5();
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
        const shortType = (s.type_group || '').substring(0, 12); // rút gọn type
        html += `<div class="badge-card" style="background:${bgColor};" title="ID ${s.id}: ${s.type_group} – ${count}/${threshold}">
          <div class="badge-id">${s.id}</div>
          <div class="badge-type" title="${s.type_group}">${shortType || '-'}</div>
          <div class="badge-count">${count}/${threshold}</div>
          <div class="badge-bar"><div class="badge-fill" style="width:${percent}%"></div></div>
        </div>`;
      } else {
        html += `<div class="badge-card placeholder">
          <div class="badge-id">-</div>
          <div class="badge-type">-</div>
          <div class="badge-count">-</div>
          <div class="badge-bar"><div class="badge-fill" style="width:0%"></div></div>
        </div>`;
      }
    }
    topRow.innerHTML = html;
  }

  updateTop5(sessions) { this.state.sessions = sessions; this._updateTop5(); }

  _updateCard({ id, type, rv, count, threshold, isFull }) {
    const idBox = this.shadowRoot.getElementById('id-box');
    const typeEl = this.shadowRoot.getElementById('type-el');
    const rvEl = this.shadowRoot.getElementById('rv-el');
    const progressFill = this.shadowRoot.getElementById('progress-fill');
    const countEl = this.shadowRoot.getElementById('count-el');
    const btnContainer = this.shadowRoot.getElementById('button-container');
    const card = this.shadowRoot.getElementById('state-card');

    if (id) {
      const bgColor = ID_COLORS[id] || '#607D8B';
      const textColor = getTextColor(bgColor);
      idBox.style.background = bgColor;
      idBox.style.color = textColor;
      idBox.textContent = id;
      card.style.background = isFull ? '#f0fdf4' : '#f8fafc';
    } else {
      idBox.style.background = '#cbd5e1';
      idBox.style.color = '#fff';
      idBox.textContent = '?';
      card.style.background = '#f8fafc';
    }

    typeEl.textContent = type || '--';
    rvEl.textContent = rv || '----';

    const percent = (count !== undefined && threshold) ? Math.min(100, Math.round((count / threshold) * 100)) : 0;
    progressFill.style.width = percent + '%';
    progressFill.style.background = id && ID_COLORS[id] ? ID_COLORS[id] : '#cbd5e1';

    if (count !== undefined) {
      countEl.textContent = `${count}/${threshold || 30}`;
    } else {
      countEl.textContent = `0/30`;
    }

    if (count > 0 && id) {
      if (isFull) {
        btnContainer.innerHTML = '<button class="btn btn-close" id="btn-close">Xác nhận đóng gói (đầy)</button>';
        btnContainer.querySelector('#btn-close').addEventListener('click', () => this.state.closeSession(id, type));
      } else {
        btnContainer.innerHTML = `<button class="btn btn-close-early" id="btn-close-early">Đóng gói ngay (${count}/${threshold || 30})</button>`;
        btnContainer.querySelector('#btn-close-early').addEventListener('click', () => {
          if (confirm('Bạn có chắc muốn đóng gói khi chưa đủ số lượng?\nThao tác này sẽ in tem TO và kết thúc lô hàng hiện tại.')) {
            this.state.closeSession(id, type);
          }
        });
      }
    } else {
      btnContainer.innerHTML = '';
    }
  }

  showDetected(rv, type, id, session) {
    this.currentId = id;
    this._updateCard({
      id, type, rv,
      count: session?.item_count || 0,
      threshold: session?.threshold || 30,
      isFull: session?.status === 'full'
    });
  }

  showSuccess(rv, type, id, serverData) {
    this.currentId = id;
    this._updateCard({
      id, type, rv,
      count: serverData.item_count,
      threshold: serverData.threshold || 30,
      isFull: serverData.status === 'full'
    });
  }

  showFullAlert(id, type) {
    const btnContainer = this.shadowRoot.getElementById('button-container');
    if (!btnContainer.querySelector('#btn-close')) {
      btnContainer.innerHTML = '<button class="btn btn-close" id="btn-close">Xác nhận đóng gói (đầy)</button>';
      btnContainer.querySelector('#btn-close').addEventListener('click', () => this.state.closeSession(id, type));
    }
  }

  showWarning(msg) {
    this._updateCard({});
    this.shadowRoot.getElementById('rv-el').textContent = msg;
  }

  showError(msg) {
    this._updateCard({});
    this.shadowRoot.getElementById('rv-el').textContent = msg;
  }

  printAndClose(id, type, toNumber, itemCount) {
    this.shadowRoot.getElementById('button-container').innerHTML = '';
    this._updateCard({
      id, type, rv: 'Đang in...',
      count: itemCount, threshold: 0, isFull: false
    });
    const date = new Date();
    const dateStr = `${date.getDate().toString().padStart(2, '0')} ${date.getMonth() + 1} ${date.getFullYear().toString().slice(-2)}`;
    const numberPart = toNumber.split('-').pop();
    printLabel(toNumber, type, id, dateStr, numberPart, this.state.email, itemCount)
      .then(() => {
        this._updateCard({
          id, type, rv: '✅ In tem thành công',
          count: itemCount, threshold: 0, isFull: false
        });
        setTimeout(() => this._updateCard({}), 3000);
      })
      .catch(() => {
        this._updateCard({
          id, type, rv: '❌ In thất bại',
          count: itemCount, threshold: 0, isFull: false
        });
        const btnContainer = this.shadowRoot.getElementById('button-container');
        btnContainer.innerHTML = '<button class="btn btn-warning" id="btn-retry-print">In lại</button>';
        btnContainer.querySelector('#btn-retry-print').addEventListener('click', () => this.printAndClose(id, type, toNumber, itemCount));
      });
  }
}