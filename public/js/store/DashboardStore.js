// store/DashboardStore.js
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
    this._lastDateCheck = this.getTodayVN();
  }

  // ========== Subscriptions ==========
  on(event, callback) {
    if (event === "update") this.listeners.push(callback);
  }

  notify() {
    this.listeners.forEach((cb) => cb());
  }

  // ========== Computed Properties ==========
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

  // ========== Helpers ==========
  getTodayVN() {
    const now = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
    return now.toISOString().split("T")[0];
  }

  /**
   * Ép kiểu và làm sạch filter từ URL hoặc localStorage.
   */
  loadFiltersFromStorage() {
    const params = new URLSearchParams(window.location.search);
    let rawFilters = {};

    if ([...params.keys()].length > 0) {
      rawFilters = Object.fromEntries(params.entries());
    } else {
      try {
        const stored = localStorage.getItem("qc_dashboard_filters");
        if (stored) rawFilters = JSON.parse(stored);
      } catch (e) {
        /* ignore */
      }
    }

    const today = this.getTodayVN();

    // --- Ngày: Nếu đã lưu và là hôm nay thì giữ, còn không thì dùng hôm nay ---
    if (rawFilters.date && rawFilters.date === today) {
      this.state.filters.date = rawFilters.date; // vẫn trong ngày hôm nay
    } else {
      this.state.filters.date = today; // mặc định là hôm nay
    }

    // --- Role filter ---
    this.state.filters.role =
      typeof rawFilters.role === "string" ? rawFilters.role.trim() : "";

    // --- Query string (tên/email) ---
    this.state.filters.q =
      typeof rawFilters.q === "string" ? rawFilters.q.trim() : "";

    this.state.filters.minTotal =
      typeof rawFilters.minTotal === "string" ? rawFilters.minTotal : "";

    // --- Giờ ---
    let hs = parseInt(rawFilters.hourStart, 10);
    let he = parseInt(rawFilters.hourEnd, 10);
    this.state.filters.hourStart = isNaN(hs)
      ? 6
      : Math.max(0, Math.min(23, hs));
    this.state.filters.hourEnd = isNaN(he) ? 22 : Math.max(0, Math.min(23, he));

    // --- Active filter ---
    const rawActive = rawFilters.isActive;
    this.state.filters.activeOnly =
      rawActive === "1" || rawActive === "true" || rawActive === true;

    // --- Phân trang ---
    const limit = parseInt(rawFilters.limit, 10);
    this.state.filters.pageSize = isNaN(limit)
      ? 25
      : Math.min(500, Math.max(1, limit));

    const page = parseInt(rawFilters.page, 10);
    this.state.filters.page = isNaN(page) || page < 1 ? 1 : page;

    // --- Sắp xếp ---
    const validSortKeys = ["total", "name", "role", ...Array(24).keys()].map(
      (i) => `hour-${i}`,
    );
    const rawSortKey = rawFilters.sortBy;
    const rawSortDir = rawFilters.sortDir;

    const sortKey = validSortKeys.includes(rawSortKey) ? rawSortKey : "total";
    const sortDir = rawSortDir === "asc" ? "asc" : "desc";

    this.state.sort = { key: sortKey, direction: sortDir };

    // Đồng bộ URL và localStorage với giá trị đã chuẩn hóa
    this.updateURL();
  }

  // ========== Data Fetching ==========
  async loadRoles() {
    try {
      const roles = await fetchRoles();
      this.state.roles = roles;
      this.notify();
    } catch (error) {
      console.error("Failed to load roles:", error);
    }
  }

  /**
   * Xóa bộ lọc role nếu role đó không còn tồn tại trong danh sách mới.
   */
  validateFilters() {
    const { role } = this.state.filters;
    if (role && this.state.roles.length > 0) {
      const exists = this.state.roles.some((r) => r.role_key === role);
      if (!exists) {
        console.warn(`Role "${role}" no longer exists, removing filter.`);
        this.state.filters.role = "";
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

      // Nếu page hiện tại vượt quá tổng số trang, tự lùi về trang cuối
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

  /**
   * Xây dựng object params cho API, chỉ bao gồm những tham số có giá trị.
   */
  _buildParams() {
    const { filters, sort } = this.state;

    const params = {
      date: filters.date,
      page: String(filters.page),
      limit: filters.pageSize,
      sortBy: sort.key,
      sortDir: sort.direction,
    };

    // Chỉ thêm nếu có giá trị thực sự (không rỗng)
    if (filters.role) params.role = filters.role;
    if (filters.q) params.q = filters.q;
    if (filters.minTotal) params.minTotal = filters.minTotal;
    if (filters.activeOnly) params.isActive = "true";

    // hourStart/hourEnd luôn gửi (có thể giữ nguyên 6-22 mặc định cũng được)
    params.hourStart = String(filters.hourStart);
    params.hourEnd = String(filters.hourEnd);

    return params;
  }

  // ========== State Modifiers ==========
  setFilters(partial) {
    // Chuẩn hóa các giá trị string để loại bỏ khoảng trắng thừa
    if (typeof partial.q === "string") partial.q = partial.q.trim();
    if (typeof partial.role === "string") partial.role = partial.role.trim();

    // Loại bỏ các key có giá trị undefined (nếu có)
    Object.keys(partial).forEach((key) => {
      if (partial[key] === undefined) delete partial[key];
    });

    Object.assign(this.state.filters, partial);

    // Khi thay đổi filter (ngoại trừ thay đổi page), reset về trang 1
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
    const { filters, sort } = this.state;
    const params = new URLSearchParams();

    // Chỉ set những tham số có ý nghĩa
    params.set("date", filters.date);
    params.set("page", String(filters.page));
    params.set("limit", String(filters.pageSize));

    // Thêm sort vào URL
    params.set("sortBy", sort.key);
    params.set("sortDir", sort.direction);

    if (filters.role) params.set("role", filters.role);
    if (filters.q) params.set("q", filters.q);
    if (filters.minTotal) params.set("minTotal", filters.minTotal);
    if (filters.activeOnly) params.set("isActive", "1");
    params.set("hourStart", String(filters.hourStart));
    params.set("hourEnd", String(filters.hourEnd));

    const url = `${window.location.pathname}?${params.toString()}`;
    history.replaceState(null, "", url);

    // Lưu vào localStorage (giữ đúng kiểu dữ liệu)
    try {
      const toStore = {
        date: filters.date,
        role: filters.role,
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
    } catch (e) {
      // Nếu localStorage đầy hoặc lỗi, bỏ qua
    }
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