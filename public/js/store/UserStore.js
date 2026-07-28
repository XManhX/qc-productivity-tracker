import {
  fetchUsers,
  fetchRoles,
  createUser,
  updateUser,
  deleteUser,
} from "../services/api.js";

class UserStore {
  constructor() {
    this.state = {
      users: [],
      roles: [],
      filters: {
        searchQuery: "",
        statusFilter: "all",
        roleFilter: "",
        pageSize: 25,
        page: 1,
      },
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

  get items() {
    return this.pagedUsers;
  }
  get totalItems() {
    return this.filteredUsers.length;
  }
  get totalPages() {
    return Math.max(
      1,
      Math.ceil(this.totalItems / this.state.filters.pageSize),
    );
  }
  get currentPage() {
    return this.state.filters.page;
  }
  get totalFiltered() {
    return this.totalItems;
  }

  get filteredUsers() {
    const { users, filters } = this.state;
    const q = filters.searchQuery.toLowerCase().trim();
    return users.filter((user) => {
      const name = (user.name || "").toLowerCase();
      const email = (user.email || "").toLowerCase();
      const active = user.is_active !== false;
      const roleKey = (user.role_key || "").toLowerCase();
      const matchQ = !q || name.includes(q) || email.includes(q);
      const matchStatus =
        filters.statusFilter === "all" ||
        (filters.statusFilter === "active" && active) ||
        (filters.statusFilter === "inactive" && !active);
      const matchRole =
        !filters.roleFilter || roleKey === filters.roleFilter.toLowerCase();
      return matchQ && matchStatus && matchRole;
    });
  }

  get pagedUsers() {
    const start = (this.state.filters.page - 1) * this.state.filters.pageSize;
    return this.filteredUsers.slice(start, start + this.state.filters.pageSize);
  }

  async loadRoles() {
    try {
      const roles = await fetchRoles();
      this.state.roles = roles;
      this.notify();
    } catch (e) {
      console.error("Load roles error:", e);
    }
  }

  async loadUsers() {
    this.state.loading = true;
    this.state.error = null;
    this.notify();
    try {
      const users = await fetchUsers();
      this.state.users = users;
      this.state.filters.page = 1;
    } catch (err) {
      this.state.error = err.message;
    } finally {
      this.state.loading = false;
      this.notify();
    }
  }

  setFilters(partial) {
    Object.assign(this.state.filters, partial);
    if (!("page" in partial)) this.state.filters.page = 1;
    this.notify();
  }

  setPage(page) {
    if (page === this.state.filters.page) return;
    this.state.filters.page = page;
    this.notify();
  }

  async addUser({ name, email, role_key, password }) {
    try {
      await createUser({ name, email, role_key, password });
      await this.loadUsers();
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async updateUser(id, updates) {
    try {
      await updateUser({ id, ...updates });
      const idx = this.state.users.findIndex((u) => u.id == id);
      if (idx !== -1) {
        Object.assign(this.state.users[idx], updates);
        if (updates.role_key) {
          const role = this.state.roles.find(
            (r) => r.role_key === updates.role_key,
          );
          this.state.users[idx].display_name = role ? role.display_name : "";
        }
      }
      this.notify();
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async deleteUser(id) {
    try {
      await deleteUser(id); // gọi API
      this.state.users = this.state.users.filter((u) => u.id != id);
      this.notify();
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async resetPassword(id, newPassword) {
    try {
      // Gửi password qua updateUser, backend sẽ xử lý hash
      await updateUser({ id, password: newPassword });
      const user = this.state.users.find((u) => u.id == id);
      if (user) {
        user.has_password = true; // cập nhật trạng thái client
      }
      this.notify();
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async bulkAddUsers(emails, roleKey) {
    let success = 0,
      failed = 0;
    for (const email of emails) {
      try {
        await createUser({
          name: email.split("@")[0].toUpperCase(),
          email,
          role_key: roleKey,
        });
        success++;
      } catch {
        failed++;
      }
    }
    await this.loadUsers();
    return { success, failed };
  }

  async importWithUpsert(payloadArray, onProgress = null) {
    let created = 0,
      updated = 0,
      errors = 0;
    const total = payloadArray.length;
    for (let i = 0; i < total; i++) {
      const item = payloadArray[i];
      try {
        const existing = this.state.users.find((u) => u.email === item.email);
        if (existing) {
          const changes = {};
          if (item.name && item.name !== existing.name)
            changes.name = item.name;
          if (item.role_key && item.role_key !== existing.role_key)
            changes.role_key = item.role_key;
          if (Object.keys(changes).length > 0) {
            await updateUser({ id: existing.id, ...changes });
            Object.assign(existing, changes);
            if (changes.role_key) {
              const role = this.state.roles.find(
                (r) => r.role_key === changes.role_key,
              );
              existing.display_name = role ? role.display_name : "";
            }
            updated++;
          }
        } else {
          await createUser(item);
          created++;
        }
      } catch (err) {
        errors++;
      }
      if (onProgress) {
        onProgress({ processed: i + 1, total, created, updated, errors });
      }
    }
    await this.loadUsers();
    return { created, updated, errors };
  }

  async importUsers(payloadArray) {
    try {
      const result = await bulkCreateUsers({ import: payloadArray });
      await this.loadUsers();
      return result;
    } catch (err) {
      throw err;
    }
  }

  resetFilters() {
    this.state.filters = {
      searchQuery: "",
      statusFilter: "all",
      roleFilter: "",
      pageSize: 25,
      page: 1,
    };
    this.notify();
  }
}

export const userStore = new UserStore();