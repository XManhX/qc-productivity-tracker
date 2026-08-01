import { TYPE_TO_ID } from './idMapping.js';

export class StateManager {
    constructor(masterData, email) {
        this.masterData = masterData;
        this.email = email;
        this.apiBase = 'https://arrival-manager.vercel.app/api/scan';
        this.ui = null;
        this.pollingInterval = null;
        this.startPolling();
    }

    setUI(ui) { this.ui = ui; }

    getType(rv) {
        return this.masterData[rv.toUpperCase().replace(/\s+/g, '')] || null;
    }

    getId(type) {
        return TYPE_TO_ID[type] || null;
    }

    async handleScan(rv) {
        if (!this.ui) return;
        const type = this.getType(rv);
        if (!type) {
            this.ui.showWarning('Không có trong master data');
            return;
        }
        const id = this.getId(type);
        if (!id) {
            this.ui.showWarning('Không xác định được ID cho type: ' + type);
            return;
        }
        try {
            const res = await fetch(`${this.apiBase}/increment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, rv, type, email: this.email })
            });
            const data = await res.json();
            if (data.success) {
                this.ui.showSuccess(rv, type, id, data);
                if (data.status === 'full') {
                    this.ui.showFullAlert(id, type);
                    speechSynthesis.speak(new SpeechSynthesisUtterance(`ID ${id} đã đầy`));
                }
            } else {
                this.ui.showError(data.error || 'Lỗi server');
            }
        } catch (e) {
            this.ui.showError('Lỗi kết nối');
        }
    }

    async closeSession(id, type) {
        try {
            const res = await fetch(`${this.apiBase}/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, email: this.email })
            });
            const data = await res.json();
            if (data.success) {
                this.ui.printAndClose(id, type, data.to_number, data.item_count);
            } else {
                this.ui.showError(data.error || 'Lỗi đóng session');
            }
        } catch (e) {
            this.ui.showError('Lỗi kết nối');
        }
    }

    async getTop5() {
        try {
            const res = await fetch(`${this.apiBase}/status`);
            return await res.json();
        } catch (e) {
            return [];
        }
    }

    startPolling() {
        this.pollingInterval = setInterval(async () => {
            if (this.ui) {
                const sessions = await this.getTop5();
                this.ui.updateTop5(sessions.slice(0, 5));
            }
        }, 5000);
    }

    updateMasterData(newData) {
        this.masterData = newData;
    }
}