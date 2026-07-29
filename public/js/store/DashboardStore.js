import { fetchDashboard, fetchRoles, fetchAlertConfig } from "../services/api.js";

class DashboardStore {
  constructor() {
    this.state = {
      data: [],
      total: 0,
      stats: null,
      filters: {
        date: "",
        roles: [],
        q: "",
        minTotal: "",
        hourStart: 6,
        hourEnd: 22,
        activeOnly: false,
        pageSize: 25,
        page: 1,
      },
      sort: { key: "total", direction: "desc" },
      roles: [],
      alertConfig: null,
      loading: false,
      error: null,
    };
    this.listeners = [];
    this._lastDateCheck = this.getTodayVN();
  }

  async loadAlertConfig() {
    try {
      const config = await fetchAlertConfig();
      this.state.alertConfig = config;
      this.notify();
    } catch (err) {
      console.error("Failed to load alert config:", err);
    }
  }

  getAlertConfig() {
    return this.state.alertConfig;
  }

  on(event, callback) {
    if (event === "update") this.listeners.push(callback);
  }

  notify() {
    this.listeners.forEach((cb) => cb());
  }

  get items() {
    return this.state.data;
  }
  get totalItems() {
    return this.state.total;
  }
  get totalPages() {
    return Math.max(1, Math.ceil(this.state.total / Number(this.state.filters.pageSize)));
  }

  getTodayVN() {
    const now = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
    return now.toISOString().split("T")[0];
  }

  loadFiltersFromStorage() {
    const params = new URLSearchParams(window.location.search);
    let rawFilters = {};

    if ([...params.keys()].length > 0) {
      rawFilters = Object.fromEntries(params.entries());
    } else {
      try {
        const stored = localStorage.getItem("qc_dashboard_filters");
        if (stored) rawFilters = JSON.parse(stored);
      } catch (e) { /* ignore */ }
    }

    const today = this.getTodayVN();
    this.state.filters.date =
      rawFilters.date && rawFilters.date === today ? rawFilters.date : today;

    // ---- Xử lý roles từ URL hoặc localStorage ----
    let roles = [];
    if (rawFilters.role) {
      // Hỗ trợ cả dạng string "qc1,qc2" hoặc mảng (từ localStorage cũ)
      const raw = Array.isArray(rawFilters.role) ? rawFilters.role : rawFilters.role.split(",");
      roles = raw.map((s) => s.trim()).filter(Boolean);
    }
    // Nếu không có trong URL, thử lấy từ localStorage (nếu có key roles)
    if (!roles.length && rawFilters.roles) {
      roles = Array.isArray(rawFilters.roles) ? rawFilters.roles : [];
    }
    this.state.filters.roles = roles;

    this.state.filters.q =
      typeof rawFilters.q === "string" ? rawFilters.q.trim() : "";
    this.state.filters.minTotal =
      typeof rawFilters.minTotal === "string" ? rawFilters.minTotal : "";

    let hs = parseInt(rawFilters.hourStart, 10);
    let he = parseInt(rawFilters.hourEnd, 10);
    this.state.filters.hourStart = isNaN(hs) ? 6 : Math.max(0, Math.min(23, hs));
    this.state.filters.hourEnd = isNaN(he) ? 22 : Math.max(0, Math.min(23, he));

    const rawActive = rawFilters.isActive;
    this.state.filters.activeOnly =
      rawActive === "1" || rawActive === "true" || rawActive === true;

    const limit = parseInt(rawFilters.limit, 10);
    this.state.filters.pageSize = isNaN(limit) ? 25 : Math.min(500, Math.max(1, limit));

    const page = parseInt(rawFilters.page, 10);
    this.state.filters.page = isNaN(page) || page < 1 ? 1 : page;

    const validSortKeys = ["total", "name", "role", ...Array(24).keys()].map((i) => `hour-${i}`);
    const rawSortKey = rawFilters.sortBy;
    const rawSortDir = rawFilters.sortDir;
    const sortKey = validSortKeys.includes(rawSortKey) ? rawSortKey : "total";
    const sortDir = rawSortDir === "asc" ? "asc" : "desc";
    this.state.sort = { key: sortKey, direction: sortDir };

    this.updateURL();
  }

  async loadRoles() {
    try {
      const roles = await fetchRoles();
      this.state.roles = roles;
      this.validateFilters(); // Kiểm tra role đã chọn có còn hợp lệ không
      this.notify();
    } catch (error) {
      console.error("Failed to load roles:", error);
    }
  }

  validateFilters() {
    if (this.state.roles.length > 0) {
      const validKeys = this.state.roles.map((r) => r.role_key);
      const filtered = this.state.filters.roles.filter((r) => validKeys.includes(r));
      if (filtered.length !== this.state.filters.roles.length) {
        console.warn("Một số role đã bị xóa khỏi hệ thống, bộ lọc đã được cập nhật.");
        this.state.filters.roles = filtered;
        this.updateURL();
      }
    }
  }

  async loadData() {
    this.state.loading = true;
    this.state.error = null;
    this.notify();

    try {
      const params = this._buildParams();
      const result = await fetchDashboard(params);
      this.state.data = result.items || [];
      this.state.total = result.total || 0;
      this.state.stats = result.stats || null;

      if (this.state.filters.page > this.totalPages) {
        this.state.filters.page = this.totalPages;
        this.updateURL();
      }
    } catch (err) {
      this.state.error = err.message;
      this.state.data = [];
      this.state.total = 0;
      console.error("Failed to load dashboard data:", err);
    } finally {
      this.state.loading = false;
      this.notify();
    }
  }

  _buildParams() {
    const { filters, sort } = this.state;
    const params = {
      date: filters.date,
      page: String(filters.page),
      limit: filters.pageSize,
      sortBy: sort.key,
      sortDir: sort.direction,
    };
    if (filters.roles && filters.roles.length) {
      params.role = filters.roles.join(","); // gửi dạng chuỗi, backend tự tách
    }
    if (filters.q) params.q = filters.q;
    if (filters.minTotal) params.minTotal = filters.minTotal;
    if (filters.activeOnly) params.isActive = "true";
    params.hourStart = String(filters.hourStart);
    params.hourEnd = String(filters.hourEnd);
    return params;
  }

  setFilters(partial) {
    // Hỗ trợ tương thích nếu ai đó vẫn truyền partial.role (string)
    if (partial.role !== undefined) {
      partial.roles = typeof partial.role === "string"
        ? partial.role.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      delete partial.role;
    }
    Object.assign(this.state.filters, partial);
    if (!("page" in partial)) {
      this.state.filters.page = 1;
    }
    this.updateURL();
    this.loadData();
  }

  setPage(page) {
    const p = Number(page);
    if (isNaN(p) || p < 1 || p === this.state.filters.page) return;
    this.state.filters.page = p;
    this.updateURL();
    this.loadData();
  }

  setSort(key) {
    const { sort } = this.state;
    if (sort.key === key) {
      sort.direction = sort.direction === "asc" ? "desc" : "asc";
    } else {
      sort.key = key;
      sort.direction = "desc";
    }
    this.state.filters.page = 1;
    this.updateURL();
    this.loadData();
  }

  resetFilters() {
    this.state.filters = {
      date: this.getTodayVN(),
      roles: [],
      q: "",
      minTotal: "",
      hourStart: 6,
      hourEnd: 22,
      activeOnly: false,
      pageSize: 25,
      page: 1,
    };
    this.state.sort = { key: "total", direction: "desc" };
    localStorage.removeItem("qc_dashboard_filters");
    history.replaceState(null, "", window.location.pathname);
    this.loadData();
  }

  updateURL() {
    const { filters, sort } = this.state;
    const params = new URLSearchParams();
    params.set("date", filters.date);
    params.set("page", String(filters.page));
    params.set("limit", String(filters.pageSize));
    params.set("sortBy", sort.key);
    params.set("sortDir", sort.direction);
    if (filters.roles && filters.roles.length) {
      params.set("role", filters.roles.join(","));
    }
    if (filters.q) params.set("q", filters.q);
    if (filters.minTotal) params.set("minTotal", filters.minTotal);
    if (filters.activeOnly) params.set("isActive", "1");
    params.set("hourStart", String(filters.hourStart));
    params.set("hourEnd", String(filters.hourEnd));
    const url = `${window.location.pathname}?${params.toString()}`;
    history.replaceState(null, "", url);

    try {
      const toStore = {
        date: filters.date,
        roles: filters.roles,
        q: filters.q,
        minTotal: filters.minTotal,
        hourStart: filters.hourStart,
        hourEnd: filters.hourEnd,
        activeOnly: filters.activeOnly,
        limit: filters.pageSize,
        page: filters.page,
        sortBy: sort.key,
        sortDir: sort.direction,
      };
      localStorage.setItem("qc_dashboard_filters", JSON.stringify(toStore));
    } catch (e) { }
  }

  getExportData() {
    return {
      data: this.state.data,
      hourStart: Number(this.state.filters.hourStart),
      hourEnd: Number(this.state.filters.hourEnd),
    };
  }
}

export const store = new DashboardStore();