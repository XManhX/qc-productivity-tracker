import {
  fetchRoles,
  fetchTargets,
  createRole,
  updateRole,
  deleteRole,
  updateTarget,
} from "../services/api.js";

class TargetStore {
  constructor() {
    this.state = {
      roles: [],
      targets: [],
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

  async loadAll() {
    this.state.loading = true;
    this.state.error = null;
    this.notify();
    try {
      const [roles, targets] = await Promise.all([
        fetchRoles(),
        fetchTargets(),
      ]);
      this.state.roles = roles;
      this.state.targets = targets;
    } catch (err) {
      this.state.error = err.message;
    } finally {
      this.state.loading = false;
      this.notify();
    }
  }

  async addRole(data) {
    try {
      await createRole(data);
      await this.loadAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async updateRole(id, updates) {
    try {
      await updateRole({ id, ...updates });
      const idx = this.state.roles.findIndex((r) => r.id === id);
      if (idx !== -1) Object.assign(this.state.roles[idx], updates);
      this.notify();
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async removeRole(id) {
    try {
      await deleteRole(id);
      await this.loadAll(); // load lại để đồng bộ targets
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async updateTarget(role_id, low_threshold, medium_threshold) {
    try {
      await updateTarget({ role_id, low_threshold, medium_threshold });
      const idx = this.state.targets.findIndex((t) => t.role_id === role_id);
      if (idx !== -1) {
        this.state.targets[idx].low_threshold = low_threshold;
        this.state.targets[idx].medium_threshold = medium_threshold;
        this.notify();
      }
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
}

export const targetStore = new TargetStore();
