import { printLabel } from '../printer.js';

export class UIManager {
    constructor(stateManager) {
        this.state = stateManager;
        stateManager.setUI(this);
        this.popup = null;
        this.minimized = false;
        this.currentId = '?';
        this.createPopup();
    }

    createPopup() {
        this.popup = document.createElement('div');
        this.popup.id = 'qc-popup';
        this.popup.innerHTML = `
      <div class="popup-header" id="popup-header">
        <div class="top-ids" id="top-ids"></div>
        <button id="minimize-btn">_</button>
      </div>
      <div class="popup-body" id="popup-body">
        <div class="default-view">Sẵn sàng quét</div>
      </div>
    `;
        document.body.appendChild(this.popup);

        const style = document.createElement('style');
        style.textContent = `
      #qc-popup { position: fixed; top: 50px; left: 50px; width: 360px; background: #fff; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.25); z-index: 999999; font-family: 'Segoe UI', Arial; }
      .popup-header { display: flex; justify-content: space-between; align-items: center; background: #1677ff; color: white; padding: 10px 16px; border-radius: 12px 12px 0 0; cursor: move; }
      .popup-body { padding: 16px; font-size: 14px; }
      .top-ids { display: flex; gap: 6px; flex-wrap: wrap; }
      .badge { background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 10px; font-weight: bold; font-size: 12px; }
      .warning { color: red; }
      .full-alert { margin-top: 10px; }
      .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-weight: bold; }
      .btn-close { background: #52c41a; color: white; }
      .btn-print { background: #fa8c16; color: white; }
      .minimized { width: 48px; height: 48px; border-radius: 50%; overflow: hidden; cursor: pointer; }
      .minimized .popup-body { display: none; }
      .minimized .popup-header { border-radius: 50%; justify-content: center; padding: 0; background: #1677ff; }
      .minimized #minimize-btn { display: none; }
      .minimized .top-ids { justify-content: center; font-size: 16px; }
    `;
        document.head.appendChild(style);

        this.makeDraggable();
        document.getElementById('minimize-btn').onclick = () => this.toggleMinimize();
    }

    makeDraggable() {
        const header = document.getElementById('popup-header');
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        header.onmousedown = dragMouseDown;
        const self = this;
        function dragMouseDown(e) {
            e.preventDefault();
            pos3 = e.clientX; pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }
        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
            pos3 = e.clientX; pos4 = e.clientY;
            self.popup.style.top = (self.popup.offsetTop - pos2) + "px";
            self.popup.style.left = (self.popup.offsetLeft - pos1) + "px";
        }
        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    toggleMinimize() {
        this.minimized = !this.minimized;
        if (this.minimized) {
            this.popup.classList.add('minimized');
            document.getElementById('top-ids').innerHTML = `<span class="badge">${this.currentId}</span>`;
        } else {
            this.popup.classList.remove('minimized');
            this.state.getTop5().then(sessions => this.updateTop5(sessions.slice(0, 5)));
        }
    }

    updateTop5(sessions) {
        if (!this.minimized) {
            document.getElementById('top-ids').innerHTML = sessions.map(s => `<span class="badge">${s.id}:${s.item_count}</span>`).join('');
        }
    }

    showSuccess(rv, type, id, serverData) {
        this.currentId = id;
        document.getElementById('popup-body').innerHTML = `
      <div><b>RV:</b> ${rv}</div>
      <div><b>Type:</b> ${type}</div>
      <div><b>ID:</b> ${id} (${serverData.item_count}/${serverData.threshold})</div>
      <div><b>Trạng thái:</b> ${serverData.status === 'full' ? 'Đầy' : 'Đang mở'}</div>
    `;
    }

    showFullAlert(id, type) {
        document.getElementById('popup-body').innerHTML += `
      <div class="full-alert">
        <button class="btn btn-close" id="close-btn">Xác nhận đóng gói</button>
      </div>`;
        document.getElementById('close-btn').onclick = () => this.state.closeSession(id, type);
    }

    showWarning(msg) {
        document.getElementById('popup-body').innerHTML = `<div class="warning">${msg}</div>`;
    }

    showError(msg) {
        document.getElementById('popup-body').innerHTML = `<div style="color:red">${msg}</div>`;
    }

    printAndClose(id, type, toNumber, itemCount) {
        const date = new Date();
        const dateStr = `${date.getDate().toString().padStart(2, '0')} ${date.getMonth() + 1} ${date.getFullYear().toString().slice(-2)}`;
        const numberPart = toNumber.split('-').pop();
        printLabel(toNumber, type, id, dateStr, numberPart, this.state.email, itemCount);
        document.getElementById('popup-body').innerHTML = `<div>Đã in tem và đóng gói thành công.</div>`;
        setTimeout(() => {
            document.getElementById('popup-body').innerHTML = '<div class="default-view">Sẵn sàng quét</div>';
        }, 3000);
    }
}