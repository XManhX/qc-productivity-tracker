import { AssignmentStore } from "../store/AssignmentStore.js";
import { escapeHtml } from "../utils/escapeHtml.js";
import { showToast } from "../utils/toast.js";
import { Pagination } from "./Pagination.js";

export class AssignmentList {
    constructor(container, store) {
        this.container = container;
        this.store = store;
        this._render();
        this._bindEvents();
        this.pagination = new Pagination(
            this.container.querySelector("#pagination-wrapper"),
            store,
            {
                showPageSizeDropdown: true,
                pageSizeOptions: [10, 25, 50, 100],
                windowSize: 5,
            }
        );
        store.on("update", () => {
            this._updateView();
            this.pagination.refresh({
                page: store.currentPage,
                totalPages: store.totalPages,
                totalItems: store.totalItems,
            });
        });
        this._updateView();
    }

    _render() {
        this.container.innerHTML = `
      <div class="p-6 border-b border-slate-100 bg-slate-50/70">
        <div class="flex items-center justify-between gap-3 mb-4">
          <div class="flex items-center gap-2">
            <div class="bg-amber-50 p-2 rounded-lg text-amber-600"><i data-lucide="clipboard-list" class="w-5 h-5"></i></div>
            <div>
              <h2 class="text-lg font-bold text-slate-900">Danh Sách Phân Công</h2>
              <p id="assignment-count-badge" class="text-slate-400 text-xs mt-0.5">0 phân công</p>
            </div>
          </div>
          <button id="refresh-assignments-btn" class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-500 hover:text-slate-700 transition" title="Tải lại"><i data-lucide="refresh-cw" class="w-4 h-4"></i></button>
        </div>
        <!-- Cards thống kê -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div class="flex items-center justify-between">
              <div><p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Tổng</p><p id="stat-total" class="text-xl font-semibold text-slate-900">0</p></div>
              <div class="rounded-xl bg-indigo-50 p-2 text-indigo-600"><i data-lucide="layers" class="w-4 h-4"></i></div>
            </div>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div class="flex items-center justify-between">
              <div><p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Hôm nay</p><p id="stat-today" class="text-xl font-semibold text-emerald-600">0</p></div>
              <div class="rounded-xl bg-emerald-50 p-2 text-emerald-600"><i data-lucide="calendar-check" class="w-4 h-4"></i></div>
            </div>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div class="flex items-center justify-between">
              <div><p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Đang diễn ra</p><p id="stat-active" class="text-xl font-semibold text-amber-600">0</p></div>
              <div class="rounded-xl bg-amber-50 p-2 text-amber-600"><i data-lucide="play-circle" class="w-4 h-4"></i></div>
            </div>
          </div>
        </div>
        <!-- Bộ lọc -->
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label class="relative flex-1 h-11 flex items-center">
            <i data-lucide="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"></i>
            <input id="assignment-search" type="text" placeholder="Tìm theo email hoặc lý do..." class="w-full h-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 leading-none" />
          </label>
          <div class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 h-11 text-sm text-slate-600">
              <i data-lucide="calendar" class="w-4 h-4 text-slate-400"></i>
              <input type="date" id="filter-date" class="bg-transparent text-sm font-medium outline-none h-full" />
            </label>
            <button id="clear-filters-btn" class="rounded-xl border border-slate-200 bg-white px-3 h-11 text-sm font-medium text-slate-600 transition hover:bg-slate-100 flex items-center">Xóa bộ lọc</button>
          </div>
        </div>
      </div>
      <div class="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table class="w-full text-left border-collapse">
          <thead><tr class="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider font-semibold"><th class="px-6 py-3">Email QC</th><th class="px-6 py-3">Bắt đầu</th><th class="px-6 py-3">Kết thúc</th><th class="px-6 py-3">Lý do</th><th class="px-6 py-3">Người tạo</th><th class="px-6 py-3 w-32">Hành động</th></tr></thead>
          <tbody id="assignment-list-body" class="divide-y divide-slate-100 text-sm"></tbody>
        </table>
      </div>
      <div id="pagination-wrapper"></div>
    `;
        lucide.createIcons();
    }

    _updateView() {
        this._updateStats();
        this._renderTable();
        lucide.createIcons();
    }

    _updateStats() {
        const stats = this.store.getStats();
        this.container.querySelector("#stat-total").textContent = stats.total;
        this.container.querySelector("#stat-today").textContent = stats.today;
        this.container.querySelector("#stat-active").textContent = stats.active;
        const badge = this.container.querySelector("#assignment-count-badge");
        const filtered = this.store.filteredAssignments;
        if (badge) {
            if (filtered.length === 0) badge.innerText = "Không có phân công nào phù hợp";
            else if (filtered.length === stats.total) badge.innerText = `${stats.total} phân công`;
            else badge.innerText = `${filtered.length} / ${stats.total} phân công phù hợp`;
        }
    }

    _renderTable() {
        const tbody = this.container.querySelector("#assignment-list-body");
        if (!tbody) return;
        const { loading, error } = this.store.state;
        const paged = this.store.pagedAssignments;
        const filtered = this.store.filteredAssignments;
        const total = this.store.state.assignments.length;

        if (loading) {
            tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-slate-400"><div class="loading-spinner w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto"></div><span>Đang tải...</span></td></tr>`;
            return;
        }
        if (error) {
            tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-rose-500 text-center">Lỗi: ${escapeHtml(error)}</td></tr>`;
            return;
        }
        if (total === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="py-14 text-center text-slate-400"><i data-lucide="clipboard-x" class="w-8 h-8 mx-auto"></i><p class="font-semibold mt-2">Chưa có phân công nào</p><p class="text-sm">Thêm phân công mới để bắt đầu.</p></td></tr>`;
            return;
        }
        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="py-14 text-center text-slate-400"><i data-lucide="search-x" class="w-8 h-8 mx-auto"></i><p class="font-semibold mt-2">Không tìm thấy phân công</p><p class="text-sm">Thử lại với bộ lọc khác.</p></td></tr>`;
            return;
        }
        tbody.innerHTML = paged
            .map((a) => `
      <tr class="hover:bg-slate-50/50 transition">
        <td class="px-6 py-4 font-medium">${escapeHtml(a.user_email)}</td>
        <td class="px-6 py-4">${new Date(a.start_time).toLocaleString("vi-VN")}</td>
        <td class="px-6 py-4">${new Date(a.end_time).toLocaleString("vi-VN")}</td>
        <td class="px-6 py-4">${escapeHtml(a.reason || "")}</td>
        <td class="px-6 py-4">${escapeHtml(a.created_by || "")}</td>
        <td class="px-6 py-4">
          <button class="edit-btn text-indigo-600 hover:text-indigo-800 mr-2 font-medium text-xs" data-id="${a.id}">Sửa</button>
          <button class="delete-btn text-rose-600 hover:text-rose-800 font-medium text-xs" data-id="${a.id}">Xoá</button>
        </td>
      </tr>`)
            .join("");
    }

    _bindEvents() {
        this.container.querySelector("#assignment-search").addEventListener("input", (e) =>
            this.store.setFilters({ searchQuery: e.target.value })
        );
        this.container.querySelector("#filter-date").addEventListener("change", (e) => {
            const date = e.target.value;
            this.store.setFilters({ date });
            // Reload với ngày mới
            this.store.loadAssignments({ date });
        });
        this.container.querySelector("#clear-filters-btn").addEventListener("click", () => {
            this.container.querySelector("#assignment-search").value = "";
            this.container.querySelector("#filter-date").value = "";
            this.store.setFilters({ searchQuery: "", date: "" });
            this.store.loadAssignments();
        });
        this.container.querySelector("#refresh-assignments-btn").addEventListener("click", () => {
            this.store.loadAssignments({ date: this.store.state.filters.date });
        });

        const tbody = this.container.querySelector("#assignment-list-body");
        tbody.addEventListener("click", async (e) => {
            const btn = e.target.closest("button");
            if (!btn?.dataset.id) return;
            const id = Number(btn.dataset.id);
            if (btn.classList.contains("edit-btn")) {
                const assignment = this.store.state.assignments.find((a) => a.id == id);
                if (assignment) {
                    document.dispatchEvent(new CustomEvent("edit-assignment", { detail: assignment }));
                }
            } else if (btn.classList.contains("delete-btn")) {
                if (confirm("Xoá phân công này?")) {
                    const result = await this.store.removeAssignment(id);
                    showToast(result.success ? "Đã xoá" : `Lỗi: ${result.message}`, result.success ? "success" : "error");
                }
            }
        });
    }
}