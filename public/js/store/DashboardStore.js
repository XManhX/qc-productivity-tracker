import { fetchDashboard, fetchRoles } from "../services/api.js";

class DashboardStore {
  constructor() {
    this.state = {
      data: [],
      total: 0,
      filters: {
        date: "",
        role: "",
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

  // ========== Computed (đồng bộ với UserStore) ==========
  get items() {
    return this.state.data;
  }

  get totalItems() {
    return this.state.total;
  }

  get totalPages() {
    return Math.max(
      1,
      Math.ceil(this.state.total / Number(this.state.filters.pageSize)),
    );
  }

  getTodayVN() {
    const now = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
    return now.toISOString().split("T")[0];
  }

  loadFiltersFromStorage() {
    const params = new URLSearchParams(window.location.search);
    let obj = {};
    if ([...params.keys()].length > 0) {
      obj = Object.fromEntries(params.entries());
    } else {
      try {
        const raw = localStorage.getItem("qc_dashboard_filters");
        if (raw) obj = JSON.parse(raw);
      } catch (e) {}
    }

    const today = this.getTodayVN();
    if (obj.date) this.state.filters.date = obj.date;
    else this.state.filters.date = today;

    if (obj.role !== undefined) this.state.filters.role = obj.role;
    if (obj.q !== undefined) this.state.filters.q = obj.q;
    if (obj.minTotal !== undefined) this.state.filters.minTotal = obj.minTotal;
    if (obj.hourStart !== undefined)
      this.state.filters.hourStart = obj.hourStart;
    if (obj.hourEnd !== undefined) this.state.filters.hourEnd = obj.hourEnd;
    if (obj.isActive !== undefined)
      this.state.filters.activeOnly =
        obj.isActive === "1" || obj.isActive === "true";
    if (obj.limit !== undefined) this.state.filters.pageSize = obj.limit;
    this.state.filters.page = obj.page ? Math.max(1, Number(obj.page)) : 1;

    const hs = Number(this.state.filters.hourStart);
    const he = Number(this.state.filters.hourEnd);
    this.state.filters.hourStart = Math.max(
      0,
      Math.min(23, isNaN(hs) ? 6 : hs),
    ).toString();
    this.state.filters.hourEnd = Math.max(
      0,
      Math.min(23, isNaN(he) ? 22 : he),
    ).toString();
    this.updateURL();
  }

  async loadRoles() {
    try {
      const roles = await fetchRoles();
      this.state.roles = roles;
      this.notify();
    } catch (e) {
      console.error(e);
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
    } catch (err) {
      this.state.error = err.message;
      this.state.data = [];
      this.state.total = 0;
    } finally {
      this.state.loading = false;
      this.notify();
    }
  }

  _buildParams() {
    const f = this.state.filters;
    const s = this.state.sort;
    return {
      date: f.date,
      page: String(f.page),
      limit: f.pageSize,
      sortBy: s.key,
      sortDir: s.direction,
      role: f.role,
      q: f.q,
      minTotal: f.minTotal,
      hourStart: f.hourStart,
      hourEnd: f.hourEnd,
      isActive: f.activeOnly ? "true" : "",
    };
  }

  setFilters(partial) {
    Object.assign(this.state.filters, partial);
    if (!("page" in partial)) this.state.filters.page = 1;
    this.updateURL();
    this.loadData();
  }

  setPage(page) {
    if (page === this.state.filters.page) return;
    this.state.filters.page = page;
    this.updateURL();
    this.loadData();
  }

  setSort(key) {
    if (this.state.sort.key === key) {
      this.state.sort.direction =
        this.state.sort.direction === "asc" ? "desc" : "asc";
    } else {
      this.state.sort.key = key;
      this.state.sort.direction = "desc";
    }
    this.state.filters.page = 1;
    this.updateURL();
    this.loadData();
  }

  resetFilters() {
    this.state.filters = {
      date: this.getTodayVN(),
      role: "",
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
    const f = this.state.filters;
    const params = new URLSearchParams();
    if (f.date) params.set("date", f.date);
    if (f.role) params.set("role", f.role);
    if (f.q) params.set("q", f.q);
    if (f.minTotal) params.set("minTotal", f.minTotal);
    if (f.hourStart) params.set("hourStart", f.hourStart);
    if (f.hourEnd) params.set("hourEnd", f.hourEnd);
    if (f.activeOnly) params.set("isActive", "1");
    if (f.pageSize) params.set("limit", f.pageSize);
    params.set("page", String(f.page));
    const url = window.location.pathname + "?" + params.toString();
    history.replaceState(null, "", url);
    try {
      localStorage.setItem(
        "qc_dashboard_filters",
        JSON.stringify(Object.fromEntries(params)),
      );
    } catch (e) {}
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
