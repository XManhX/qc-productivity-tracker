// content/stateManager.js – backend ưu tiên, chờ cả hai luồng, hỗ trợ fetch active scan events
export class StateManager {
  constructor(masterData, email) {
    this.masterData = masterData;
    this.email = email;
    this.apiBase = "https://return-sort-arrived.vercel.app/api/scan";
    this.ui = null;
    this.sessions = [];
    this.typeToId = {};
    this.typeToDisplay = {};
    this._listeners = [];
    this._typeMappingReady = false;
    this._typeMappingPromise = null;
    this._pendingIncrements = new Map();

    this._initTypeMapping();
    this._initSessions();

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === "UPDATE_SESSIONS") {
        this._onSessionsUpdate(msg.sessions);
      }
    });
  }

  addListener(fn) {
    this._listeners.push(fn);
    if (this.sessions.length > 0) fn(this.sessions);
  }

  _initTypeMapping() {
    this._typeMappingPromise = new Promise((resolve) => {
      chrome.storage.local.get(["typeMapping"], (result) => {
        if (result?.typeMapping) {
          this._applyTypeMapping(result.typeMapping);
          resolve();
          return;
        }
        this._requestTypeMapping(resolve, 0);
      });
    });
  }

  _initSessions() {
    chrome.storage.local.get(["activeSessions"], (result) => {
      if (result?.activeSessions && Array.isArray(result.activeSessions)) {
        this._onSessionsUpdate(result.activeSessions);
      }
      // Luôn request sessions mới nhất
      this._requestSessions(0);
    });
  }

  _applyTypeMapping(mapping) {
    this.typeToId = {};
    this.typeToDisplay = {};
    for (const [typeName, info] of Object.entries(mapping)) {
      this.typeToId[typeName] = info.station_id;
      this.typeToDisplay[typeName] = info.display_name || typeName;
    }
    console.log(
      "[StateManager] Type mapping loaded:",
      Object.keys(this.typeToId).length,
    );
    this._typeMappingReady = true;
  }

  _requestTypeMapping(resolve, attempt) {
    chrome.runtime.sendMessage({ action: "GET_TYPE_MAPPING" }, (response) => {
      if (chrome.runtime.lastError) {
        if (attempt < 3)
          setTimeout(
            () => this._requestTypeMapping(resolve, attempt + 1),
            1000,
          );
        else {
          this._typeMappingReady = true;
          resolve();
        }
        return;
      }
      if (response?.mapping) {
        this._applyTypeMapping(response.mapping);
        chrome.storage.local.set({ typeMapping: response.mapping });
      } else {
        this._typeMappingReady = true;
      }
      resolve();
    });
  }

  _requestSessions(attempt) {
    chrome.runtime.sendMessage({ action: "GET_SESSIONS" }, (response) => {
      if (chrome.runtime.lastError) {
        if (attempt < 3)
          setTimeout(() => this._requestSessions(attempt + 1), 2000);
        return;
      }
      if (response?.sessions) this._onSessionsUpdate(response.sessions);
    });
  }

  async _waitForTypeMapping() {
    if (this._typeMappingReady) return;
    await this._typeMappingPromise;
  }

  getId(type) {
    return this.typeToId[type] || null;
  }
  getDisplayName(type) {
    return this.typeToDisplay[type] || type;
  }
  getType(returnTn) {
    if (!returnTn) return null;
    return this.masterData[returnTn.toUpperCase().replace(/\s+/g, "")] || null;
  }

  async _callApi(endpoint, body) {
    return new Promise((resolve, reject) => {
      if (!chrome.runtime?.id) {
        reject(new Error("Extension context không hợp lệ"));
        return;
      }
      chrome.runtime.sendMessage(
        { action: "API_CALL", endpoint, body },
        (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!res?.success) {
            reject(new Error(res?.error || "Lỗi không xác định"));
            return;
          }
          resolve(res.data);
        },
      );
    });
  }

  _onSessionsUpdate(sessions) {
    this.sessions = sessions || [];
    if (this.ui) this.ui.updateTop5(this.sessions.slice(0, 5));
    this._listeners.forEach((fn) => fn(this.sessions));
  }

  _fetchSessions() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "GET_SESSIONS" }, (response) =>
        resolve(response?.sessions || []),
      );
    });
  }

  setUI(ui) {
    this.ui = ui;
  }

  // ============ EVENT HANDLERS ============

  handleDetected(sheetId) {
    this._handleScan(sheetId);
  }

  handleArrived(returnTn, sheetId) {
    this._resolvePending(sheetId, true, 0, "", returnTn);
  }

  handleError(sheetId, retcode, message) {
    this._resolvePending(sheetId, false, retcode, message);
  }

  // ============ LOGIC CHÍNH ============

  async _handleScan(sheetId) {
    await this._waitForTypeMapping();
    if (!this.ui) return null;
    if (!sheetId) {
      this.ui.showWarning("Không có mã đơn hàng");
      return null;
    }

    const type = this.getType(sheetId);
    const id = type ? this.getId(type) : null;
    const displayType = type ? this.getDisplayName(type) : null;

    if (type) {
      const session = id ? this.sessions.find((s) => s.id === id) : null;
      this.ui.showDetected(sheetId, displayType, id, session, "processing");
      const utterance = new SpeechSynthesisUtterance(id || "không xác định");
      utterance.lang = "vi-VN";
      window.speechSynthesis.speak(utterance);
    } else {
      this.ui.showWarning("Không có trong master data");
      return null;
    }

    if (!id) {
      this.ui.showScanError({
        return_tn: sheetId,
        type: displayType,
        id: null,
        reason: "Lỗi ánh xạ",
        detail: `Type "${displayType}" chưa được gán ID`,
      });
      return null;
    }

    const incrementPromise = this._callApi("increment", {
      id,
      return_tn: sheetId,
      type,
      email: this.email,
    })
      .then(async (data) => {
        if (!data.success) {
          throw new Error(data.error || "Lỗi không xác định");
        }
        const freshSessions = await this._fetchSessions();
        this._onSessionsUpdate(freshSessions);
        return { success: true, data, displayType, id };
      })
      .catch((e) => {
        return { success: false, error: e.message, displayType, id };
      });

    this._pendingIncrements.set(sheetId, incrementPromise);
    return incrementPromise;
  }

  async _resolvePending(
    sheetId,
    responseSuccess,
    retcode,
    message,
    returnNo = null,
  ) {
    let incrementPromise = this._pendingIncrements.get(sheetId);

    if (!incrementPromise) {
      incrementPromise = await this._handleScan(sheetId);
      if (!incrementPromise) return;
    }

    const incResult = await incrementPromise;
    this._pendingIncrements.delete(sheetId);

    const { displayType, id } = incResult;

    if (incResult.success) {
      this.ui.showSuccess(sheetId, displayType, id, incResult.data);
      if (incResult.data.status === "full") {
        this.ui.showFullAlert(id, displayType);
        try {
          speechSynthesis.speak(
            new SpeechSynthesisUtterance(`ID ${id} đã đầy`),
          );
        } catch (e) { }
      }
    } else {
      this.ui.showScanError({
        return_tn: sheetId,
        type: displayType,
        id,
        reason: "Lỗi",
        detail: incResult.error,
      });
    }
  }

  // ============ CÁC PHƯƠNG CÒN LẠI ============

  async removeScan(return_tn, id, type) {
    if (!this.ui) return;
    try {
      const data = await this._callApi("decrement", { id, return_tn });
      if (!data.success) {
        this.ui.showError(data.error || "Không thể hủy đơn này");
        return;
      }
      const freshSessions = await this._fetchSessions();
      this._onSessionsUpdate(freshSessions);

      const updatedSession = freshSessions.find((s) => s.id === id);
      const newCount = updatedSession ? updatedSession.item_count : 0;
      const lastReturnTn = updatedSession
        ? updatedSession.last_return_tn
        : null;

      if (newCount > 0 && lastReturnTn) {
        const displayType = this.getDisplayName(updatedSession.type_group);
        this.ui.showSuccess(lastReturnTn, displayType, id, {
          item_count: newCount,
          status: updatedSession.status,
        });
      } else {
        this.ui.resetCard();
      }
    } catch (e) {
      this.ui.showError("Lỗi kết nối");
    }
  }

  async closeSession(id, type) {
    try {
      const data = await this._callApi("close", { id, email: this.email });
      const freshSessions = await this._fetchSessions();
      this._onSessionsUpdate(freshSessions);
      if (data.success)
        this.ui.printAndClose(id, type, data.to_number, data.item_count);
      else this.ui.showError(data.error);
    } catch (e) {
      this.ui.showError("Lỗi kết nối");
    }
  }

  async markPrinted(id) {
    try {
      await this._callApi("mark_printed", { id });
    } catch (e) { }
  }

  showSessionDetail(id) {
    if (!this.ui) return;
    const session = this.sessions.find((s) => s.id === id);
    if (session) {
      const displayType = this.getDisplayName(session.type_group);
      const returnTn = session.last_return_tn || `ID ${id}`;
      this.ui.showDetected(returnTn, displayType, id, session);
    }
  }

  fetchActiveEventsCount() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "GET_ACTIVE_EVENTS_COUNT" },
        (response) => {
          resolve(response?.count || 0);
        },
      );
    });
  }

  fetchActiveScanEvents(page = 1, limit = 20) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "GET_ACTIVE_SCAN_EVENTS", page, limit },
        (response) => {
          resolve(response?.events || []);
        },
      );
    });
  }

  async refreshMasterData() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: "FETCH_MASTER_DATA" },
        (response) => {
          if (response?.success) {
            this.masterData = response.masterData;
            resolve();
          } else
            reject(
              new Error(response?.error || "Không thể cập nhật master data"),
            );
        },
      );
    });
  }

  async refreshTypeMapping() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: "FETCH_TYPE_MAPPINGS" },
        (response) => {
          if (response?.success) {
            this._applyTypeMapping(response.mapping);
            resolve();
          } else
            reject(
              new Error(response?.error || "Không thể cập nhật type mapping"),
            );
        },
      );
    });
  }

  updateMasterData(newData) {
    this.masterData = newData;
  }
}
