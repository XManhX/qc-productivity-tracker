// content/stateManager.js
export class StateManager {
    constructor(masterData, email) {
        this.masterData = masterData;
        this.email = email;
        this.apiBase = 'https://return-sort-arrived.vercel.app/api/scan';
        this.ui = null;
        this.sessions = [];
        this.typeToId = {};
        this._pendingEvents = [];

        // Lấy type mapping từ background (qua message)
        this._loadTypeMapping();

        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.action === 'UPDATE_SESSIONS' && this.ui) {
                this._onSessionsUpdate(msg.sessions);
            }
        });

        chrome.runtime.sendMessage({ action: 'GET_SESSIONS' }, (response) => {
            if (response?.sessions) this._onSessionsUpdate(response.sessions);
        });
    }

    _loadTypeMapping() {
        chrome.runtime.sendMessage({ action: 'GET_TYPE_MAPPING' }, (response) => {
            if (response?.mapping) {
                this.typeToId = response.mapping;
                console.log('[StateManager] Type mapping loaded:', Object.keys(this.typeToId).length);
            } else {
                console.warn('[StateManager] No type mapping received');
            }
        });
    }

    async _callApi(endpoint, body) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { action: 'API_CALL', endpoint, body },
                (res) => {
                    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                    else if (!res.success) reject(new Error(res.error));
                    else resolve(res.data);
                }
            );
        });
    }

    _onSessionsUpdate(sessions) {
        this.sessions = sessions || [];
        if (this.ui) this.ui.updateTop5(this.sessions.slice(0, 5));
    }

    _fetchSessions() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'GET_SESSIONS' }, (response) => {
                resolve(response?.sessions || []);
            });
        });
    }

    setUI(ui) {
        this.ui = ui;
        if (this.sessions.length) this.ui.updateTop5(this.sessions.slice(0, 5));
        this._pendingEvents.forEach(event => this._processEvent(event));
        this._pendingEvents = [];
    }

    _processEvent(event) {
        if (event.type === 'detected') {
            const { rv, type, id, session } = event;
            this.ui.showDetected(rv, type, id, session);
        } else if (event.type === 'arrived') {
            this.handleScan(event.rv);
        } else if (event.type === 'error') {
            this.ui.showWarning(event.message);
        }
    }

    _queueEvent(event) {
        if (this.ui) {
            this._processEvent(event);
        } else {
            this._pendingEvents.push(event);
        }
    }

    getType(rv) {
        return this.masterData[rv.toUpperCase().replace(/\s+/g, '')] || null;
    }

    getId(type) {
        return this.typeToId[type] || null;
    }

    handleDetected(rv) {
        const type = this.getType(rv);
        const id = type ? this.getId(type) : null;
        if (type && id) {
            const session = this.sessions.find(s => s.id === id);
            this._queueEvent({ type: 'detected', rv, type, id, session });
        } else {
            this._queueEvent({ type: 'error', message: 'Không có trong master data' });
        }
    }

    handleArrived(rv) {
        this._queueEvent({ type: 'arrived', rv });
    }

    async handleScan(rv) {
        if (!this.ui) {
            this._queueEvent({ type: 'arrived', rv });
            return;
        }
        const type = this.getType(rv);
        if (!type) { this.ui.showWarning('Không có trong master data'); return; }
        const id = this.getId(type);
        if (!id) { this.ui.showWarning('Không xác định được ID'); return; }
        try {
            const data = await this._callApi('increment', { id, rv, type, email: this.email });
            const freshSessions = await this._fetchSessions();
            this._onSessionsUpdate(freshSessions);
            this.ui.showSuccess(rv, type, id, data);
            if (data.status === 'full') {
                this.ui.showFullAlert(id, type);
                try { speechSynthesis.speak(new SpeechSynthesisUtterance(`ID ${id} đã đầy`)); } catch (e) { }
            }
        } catch (e) {
            this.ui.showError('Lỗi kết nối');
        }
    }

    async closeSession(id, type) {
        try {
            const data = await this._callApi('close', { id, email: this.email });
            const freshSessions = await this._fetchSessions();
            this._onSessionsUpdate(freshSessions);
            if (data.success) {
                this.ui.printAndClose(id, type, data.to_number, data.item_count);
            } else {
                this.ui.showError(data.error);
            }
        } catch (e) {
            this.ui.showError('Lỗi kết nối');
        }
    }

    updateMasterData(newData) {
        this.masterData = newData;
    }
}