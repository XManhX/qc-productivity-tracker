import { fetchAlertConfig, updateAlertConfig } from "../services/api.js";

class AlertConfigStore {
  constructor() {
    this.state = {
      config: null, // object chứa tất cả trường từ DB
      loading: false,
      error: null,
    };
    this.listeners = [];
  }

  on(event, callback) {
    if (event === "update") this.listeners.push(callback);
  }

  notify() {
    this.listeners.forEach((cb) => cb());
  }

  getConfig() {
    return this.state.config;
  }

  isLoading() {
    return this.state.loading;
  }

  getError() {
    return this.state.error;
  }

  async loadConfig() {
    this.state.loading = true;
    this.state.error = null;
    this.notify();
    try {
      const config = await fetchAlertConfig();
      this.state.config = config;
    } catch (err) {
      this.state.error = err.message;
    } finally {
      this.state.loading = false;
      this.notify();
    }
  }

  async saveConfig(updates) {
    this.state.loading = true;
    this.state.error = null;
    this.notify();
    try {
      await updateAlertConfig(updates);
      // Cập nhật local state với dữ liệu mới
      Object.assign(this.state.config, updates);
      return { success: true };
    } catch (err) {
      this.state.error = err.message;
      return { success: false, message: err.message };
    } finally {
      this.state.loading = false;
      this.notify();
    }
  }
}

export const alertConfigStore = new AlertConfigStore();
