import {
  fetchUsers,
  fetchRoles,
  createUser,
  updateUser,
  bulkCreateUsers,
} from "../services/api.js";

class UserStore {
  constructor() {
    this.state = {
      users: [], // dữ liệu gốc từ API
      roles: [],
      filters: {
        searchQuery: "",
        statusFilter: "all", // 'all' | 'active' | 'inactive'
        roleFilter: "",
        page: 1,
        pageSize: 8,
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

  // ========== Computed (giờ đây có getter giống Dashboard) ==========
  get items() {
    // Dữ liệu đã được phân trang để hiển thị
    return this.pagedUsers;
  }

  get totalItems() {
    // Tổng số bản ghi sau khi lọc
    return this.filteredUsers.length;
  }

  get totalPages() {
    return Math.max(
      1,
      Math.ceil(this.totalItems / this.state.filters.pageSize),
    );
  }

  // Giữ nguyên các getter cũ (dùng nội bộ)
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

  // ========== Actions ==========
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
      this.state.filters.page = 1; // reset về trang 1
    } catch (err) {
      this.state.error = err.message;
    } finally {
      this.state.loading = false;
      this.notify();
    }
  }

  setFilters(partial) {
    Object.assign(this.state.filters, partial);
    if (!("page" in partial)) this.state.filters.page = 1; // reset về trang 1 trừ khi set page rõ ràng
    this.notify();
  }

  setPage(page) {
    if (page === this.state.filters.page) return;
    this.state.filters.page = page;
    this.notify();
  }

  async addUser({ name, email, role_key }) {
    try {
      await createUser({ name, email, role_key });
      await this.loadUsers();
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async updateUser(id, updates) {
    try {
      await updateUser({ id, ...updates });
      // Cập nhật cục bộ
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
      page: 1,
      pageSize: 8,
    };
    this.notify();
  }
}

export const userStore = new UserStore();
