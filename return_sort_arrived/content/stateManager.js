// content/stateManager.js – hỗ trợ display_name
export class StateManager {
    constructor(masterData, email) {
        this.masterData = masterData;
        this.email = email;
        this.apiBase = 'https://return-sort-arrived.vercel.app/api/scan';
        this.ui = null;
        this.sessions = [];
        this.typeToId = {};
        this.typeToDisplay = {};
        this._listeners = [];
        this._typeMappingReady = false;
        this._typeMappingPromise = null;

        this._initTypeMapping();

        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.action === 'UPDATE_SESSIONS') {
                console.log('[StateManager] Received UPDATE_SESSIONS:', msg.sessions.length);
                this._onSessionsUpdate(msg.sessions);
            }
        });

        chrome.runtime.sendMessage({ action: 'GET_SESSIONS' }, (response) => {
            if (response?.sessions) this._onSessionsUpdate(response.sessions);
        });
    }

    addListener(fn) {
        this._listeners.push(fn);
        if (this.sessions.length > 0) fn(this.sessions);
    }

    _initTypeMapping() {
        this._typeMappingPromise = new Promise((resolve) => {
            // Ưu tiên lấy từ storage.local (nhanh, không cần message)
            chrome.storage.local.get(['typeMapping'], (result) => {
                if (result?.typeMapping) {
                    this._applyTypeMapping(result.typeMapping);
                    resolve();
                    return;
                }
                // Nếu chưa có, gửi message (có retry)
                this._requestTypeMapping(resolve, 0);
            });
        });
    }

    _applyTypeMapping(mapping) {
        this.typeToId = {};
        this.typeToDisplay = {};
        for (const [typeName, info] of Object.entries(mapping)) {
            this.typeToId[typeName] = info.station_id;
            this.typeToDisplay[typeName] = info.display_name || typeName;
        }
        console.log('[StateManager] Type mapping loaded:', Object.keys(this.typeToId).length);
        this._typeMappingReady = true;
    }

    _requestTypeMapping(resolve, attempt) {
        chrome.runtime.sendMessage({ action: 'GET_TYPE_MAPPING' }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('[StateManager] GET_TYPE_MAPPING failed:', chrome.runtime.lastError.message);
                // Retry sau 1 giây
                if (attempt < 3) {
                    setTimeout(() => this._requestTypeMapping(resolve, attempt + 1), 1000);
                } else {
                    console.warn('[StateManager] Type mapping failed after retries');
                    this._typeMappingReady = true; // vẫn resolve để không block
                    resolve();
                }
                return;
            }
            if (response?.mapping) {
                this._applyTypeMapping(response.mapping);
                // Lưu vào storage để lần sau dùng nhanh
                chrome.storage.local.set({ typeMapping: response.mapping });
            } else {
                console.warn('[StateManager] No type mapping in response');
                this._typeMappingReady = true;
            }
            resolve();
        });
    }

    async _waitForTypeMapping() {
        if (this._typeMappingReady) return;
        await this._typeMappingPromise;
    }

    getId(type) { return this.typeToId[type] || null; }
    getDisplayName(type) { return this.typeToDisplay[type] || type; }
    getType(return_tn) { return this.masterData[return_tn.toUpperCase().replace(/\s+/g, '')] || null; }

    async _callApi(endpoint, body) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'API_CALL', endpoint, body }, (res) => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else if (!res.success) reject(new Error(res.error));
                else resolve(res.data);
            });
        });
    }

    _onSessionsUpdate(sessions) {
        this.sessions = sessions || [];
        if (this.ui) this.ui.updateTop5(this.sessions.slice(0, 5));
        this._listeners.forEach(fn => fn(this.sessions));
    }

    _fetchSessions() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'GET_SESSIONS' }, (response) => resolve(response?.sessions || []));
        });
    }

    setUI(ui) { this.ui = ui; }

    handleArrived(return_tn) {
        this._handleScan(return_tn);
    }

    async fetchLastReturnTn(stationId) {
        try {
            const data = await this._callApi('last_return_tn', { id: stationId });
            return data.last_return_tn || null;
        } catch (e) {
            return null;
        }
    }

    showSessionDetail(id) {
        if (!this.ui) return;
        const session = this.sessions.find(s => s.id === id);
        if (session) {
            const displayType = this.getDisplayName(session.type_group);
            // Dùng last_return_tn từ session, không cần fetch API
            const returnTn = session.last_return_tn || `ID ${id}`;
            this.ui.showDetected(returnTn, displayType, id, session);
        }
    }

    async _handleScan(return_tn) {
        await this._waitForTypeMapping();
        if (!this.ui) return;
        if (!return_tn) {
            this.ui.showWarning('Không có mã đơn hàng');
            return;
        }

        const type = this.getType(return_tn);
        const id = type ? this.getId(type) : null;
        const displayType = type ? this.getDisplayName(type) : null;

        if (type) {
            const session = id ? this.sessions.find(s => s.id === id) : null;
            this.ui.showDetected(return_tn, displayType, id, session);
            const utterance = new SpeechSynthesisUtterance(id || 'không xác định');
            utterance.lang = 'vi';
            window.speechSynthesis.speak(utterance);
        } else {
            this.ui.showWarning('Không có trong master data');
            return;
        }

        if (!id) {
            this.ui.showScanError({
                return_tn, type: displayType, id: null,
                reason: 'Lỗi ánh xạ',
                detail: `Type "${displayType}" chưa được gán ID`
            });
            return;
        }

        try {
            const data = await this._callApi('increment', { id, return_tn, type, email: this.email });
            console.log('[StateManager] increment response:', data);

            if (!data.success) {
                let reason = 'Lỗi';
                let detail = data.error || 'Lỗi không xác định từ server';
                if (data.error && data.error.includes('Return TN đã được quét')) reason = 'Trùng lặp';
                else if (data.error && data.error.includes('ID đã đầy')) reason = 'Đầy';
                this.ui.showScanError({ return_tn, type: displayType, id, reason, detail });
                return;
            }

            const freshSessions = await this._fetchSessions();
            this._onSessionsUpdate(freshSessions);
            this.ui.showSuccess(return_tn, displayType, id, data);

            if (data.status === 'full') {
                this.ui.showFullAlert(id, displayType);
                try { speechSynthesis.speak(new SpeechSynthesisUtterance(`ID ${id} đã đầy`)); } catch (e) { }
            }
        } catch (e) {
            console.error('[StateManager] increment failed:', e);
            this.ui.showScanError({
                return_tn, type: displayType, id,
                reason: 'Lỗi',
                detail: 'Lỗi kết nối đến server'
            });
        }
    }

    async removeScan(return_tn, id, type) {
        try {
            const data = await this._callApi('decrement', { id, return_tn });
            if (!data.success) {
                this.ui.showError(data.error || 'Không thể hủy đơn này');
                return;
            }
            const freshSessions = await this._fetchSessions();
            this._onSessionsUpdate(freshSessions);
            this.ui.showSuccess(return_tn, type, id, { item_count: data.item_count, status: data.status });
        } catch (e) {
            this.ui.showError('Lỗi kết nối');
        }
    }

    async closeSession(id, type) {
        try {
            const data = await this._callApi('close', { id, email: this.email });
            const freshSessions = await this._fetchSessions();
            this._onSessionsUpdate(freshSessions);
            if (data.success) this.ui.printAndClose(id, type, data.to_number, data.item_count);
            else this.ui.showError(data.error);
        } catch (e) { this.ui.showError('Lỗi kết nối'); }
    }

    async markPrinted(id) {
        try {
            await this._callApi('mark_printed', { id });
            console.log('[StateManager] Marked as printed:', id);
        } catch (e) {
            console.error('[StateManager] Failed to mark printed:', e);
        }
    }

    // Refresh methods cho nút cập nhật
    async refreshMasterData() {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'FETCH_MASTER_DATA' }, (response) => {
                if (response?.success) {
                    this.masterData = response.masterData;
                    resolve();
                } else reject(new Error(response?.error || 'Không thể cập nhật master data'));
            });
        });
    }

    async refreshTypeMapping() {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'FETCH_TYPE_MAPPINGS' }, (response) => {
                if (response?.success) {
                    this.typeToId = {};
                    this.typeToDisplay = {};
                    for (const [typeName, info] of Object.entries(response.mapping)) {
                        this.typeToId[typeName] = info.station_id;
                        this.typeToDisplay[typeName] = info.display_name || typeName;
                    }
                    this._typeMappingReady = true;
                    resolve();
                } else reject(new Error(response?.error || 'Không thể cập nhật type mapping'));
            });
        });
    }

    updateMasterData(newData) { this.masterData = newData; }
}