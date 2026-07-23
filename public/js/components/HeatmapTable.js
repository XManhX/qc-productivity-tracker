import { store } from "../store/DashboardStore.js";
import { refreshIcons } from "../utils/icons.js";
import { Pagination } from "./Pagination.js";

export class HeatmapTable {
  constructor(container) {
    this.container = container;
    this._renderStructure();

    // Khởi tạo Pagination (tự lắng nghe store.on('update'))
    this.pagination = new Pagination(
      this.container.querySelector("#pagination-wrapper"),
      store,
      {
        showPageSizeDropdown: true,
        pageSizeOptions: [10, 25, 50, 100],
        windowSize: 5,
      },
    );

    // Lắng nghe store để render lại bảng
    store.on("update", () => {
      this._renderTable();
      refreshIcons();
    });
  }

  _renderStructure() {
    this.container.innerHTML = `
      <div class="px-4 py-2 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <div>
          <h2 class="font-bold text-slate-800 flex items-center gap-2">
            <i data-lucide="grid" class="text-slate-400 w-5 h-5"></i> Bảng Thống Kê Sản Lượng Từng Giờ
          </h2>
          <div class="flex items-center gap-3 mt-1.5 text-xs text-slate-600">
            <span class="text-slate-400">Chú thích:</span>
            <span class="inline-flex items-center gap-1"><span class="legend-dot bg-red-50 border-red-200"></span> Thấp</span>
            <span class="inline-flex items-center gap-1"><span class="legend-dot bg-yellow-50 border-yellow-200"></span> Trung bình</span>
            <span class="inline-flex items-center gap-1"><span class="legend-dot bg-green-50 border-green-200"></span> Tốt</span>
            <span class="text-slate-400 italic ml-2">(ngưỡng theo từng role)</span>
          </div>
        </div>
        <span class="bg-emerald-100 text-emerald-800 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Cập nhật trực tiếp
        </span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-center border-collapse" id="data-table">
          <thead id="table-header" class="border-b border-slate-200 bg-slate-100 text-slate-600 text-xs uppercase tracking-wider font-semibold"></thead>
          <tbody id="dashboard-body" class="divide-y divide-slate-100 text-sm"></tbody>
        </table>
      </div>
      <div id="pagination-wrapper"></div>
    `;
    refreshIcons();
  }

  _buildHeader(headerRow, hourStart, hourEnd) {
    let html = `
      <th class="px-4 py-2 text-left font-semibold text-slate-700 hover:bg-slate-200/70" style="min-width: 220px">
        <button class="group flex items-center gap-1 w-full text-left" data-sort-trigger="name">
          <span class="w-full">Nhân viên</span>
          <span data-sort-icon="name"><i data-lucide="chevrons-up-down" class="w-3.5 h-3.5 text-slate-400"></i></span>
        </button>
      </th>
      <th class="px-4 py-2 text-left font-semibold text-slate-700 hover:bg-slate-200/70" style="min-width: 90px">
        <button class="group flex items-center gap-1 w-full text-left" data-sort-trigger="role">
          <span class="w-full">Role</span>
          <span data-sort-icon="role"><i data-lucide="chevrons-up-down" class="w-3.5 h-3.5 text-slate-400"></i></span>
        </button>
      </th>
      <th class="px-4 py-4 bg-emerald-50 font-bold text-emerald-800 hover:bg-emerald-100" style="min-width: 90px">
        <button class="group flex items-center justify-center gap-1 w-full" data-sort-trigger="total">
          <span class="w-full">Tổng</span>
          <span data-sort-icon="total"><i data-lucide="chevrons-up-down" class="w-3.5 h-3.5 text-slate-400"></i></span>
        </button>
      </th>`;

    for (let h = hourStart; h <= hourEnd; h++) {
      html += `
        <th class="px-3 py-4 text-slate-700 font-semibold border-l border-slate-200/50">
          <button class="group flex items-center justify-center gap-1 w-full" data-sort-trigger="hour-${h}">
            <span>${h}h</span>
            <span data-sort-icon="hour-${h}"><i data-lucide="chevrons-up-down" class="w-3.5 h-3.5 text-slate-400"></i></span>
          </button>
        </th>`;
    }

    headerRow.innerHTML = html;
    refreshIcons();
    this._attachSortEvents();
    this._updateSortIcons();
  }

  _renderTable() {
    const headerRow = this.container.querySelector("#table-header");
    const tbody = this.container.querySelector("#dashboard-body");
    const f = store.state.filters;
    const hourStart = Number(f.hourStart);
    const hourEnd = Number(f.hourEnd);

    this._buildHeader(headerRow, hourStart, hourEnd);

    if (store.state.loading) {
      tbody.innerHTML = `<tr><td colspan="${3 + (hourEnd - hourStart + 1)}" class="py-12 text-center text-slate-400">
        <div class="flex flex-col items-center gap-2"><div class="loading-spinner w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div><span>Đang tải dữ liệu...</span></div>
      </td></tr>`;
      return;
    }

    if (store.state.error) {
      tbody.innerHTML = `<tr><td colspan="${3 + (hourEnd - hourStart + 1)}" class="py-12 text-rose-500 text-center">
        <i data-lucide="alert-triangle" class="w-10 h-10 mx-auto"></i><span>Lỗi: ${store.state.error}</span>
      </td></tr>`;
      return;
    }

    const data = store.items; // sử dụng getter mới
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="${3 + (hourEnd - hourStart + 1)}" class="py-12 text-center text-slate-400">
        <div class="flex flex-col items-center gap-2"><i data-lucide="inbox" class="w-10 h-10 text-slate-300"></i><span>Không có dữ liệu</span></div>
      </td></tr>`;
      return;
    }

    const sortConfig = store.state.sort;
    // Sắp xếp client-side (dự phòng, vì server đã sort)
    const sorted = [...data].sort((a, b) => {
      const av = this._getSortValue(a, sortConfig.key);
      const bv = this._getSortValue(b, sortConfig.key);
      if (av < bv) return sortConfig.direction === "asc" ? -1 : 1;
      if (av > bv) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

    tbody.innerHTML = "";
    sorted.forEach((user) => {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50/80 transition duration-150";

      tr.innerHTML = `<td class="px-4 py-2 text-left font-medium text-slate-900 border-r border-slate-100 max-w-[260px]">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 uppercase border border-slate-200 flex-shrink-0">
            ${(user.name || user.email).substring(0, 2)}
          </div>
          <div class="min-w-0">
            <div class="font-semibold text-slate-800 truncate" title="${user.name || user.email}">${user.name || user.email}</div>
            <div class="text-xs text-slate-500 truncate" title="${user.name ? user.email : ""}">${user.name ? user.email : ""}</div>
          </div>
        </div></td>`;

      const tdRole = document.createElement("td");
      tdRole.className = "px-2 py-2 border-r border-slate-100 text-sm";
      tdRole.textContent = user.display_name || user.role_key || "-";
      tr.appendChild(tdRole);

      const total = user.total || 0;
      const workingHours = hourEnd - hourStart + 1;
      const lowTotal = (user.low_threshold || 10) * workingHours;
      const highTotal = (user.medium_threshold || 16) * workingHours;
      const tdTotal = document.createElement("td");
      let cls = "px-2 py-2 border-r border-slate-100 font-bold text-center ";
      if (total === 0) cls += "bg-slate-50 text-slate-400";
      else if (total < lowTotal) cls += "bg-red-50 text-red-800";
      else if (total < highTotal) cls += "bg-yellow-50 text-yellow-800";
      else cls += "bg-green-50 text-green-800";
      tdTotal.className = cls;
      tdTotal.textContent = total;
      tr.appendChild(tdTotal);

      for (let h = hourStart; h <= hourEnd; h++) {
        const count = user.hourly?.[h] || 0;
        const td = document.createElement("td");
        let c =
          "px-3 py-4 border-l border-slate-100 transition-colors text-center ";
        if (count === 0) {
          c += "bg-slate-50 text-slate-300";
          td.textContent = "-";
        } else {
          const lt = user.low_threshold || 10;
          const mt = user.medium_threshold || 16;
          if (count < lt) {
            c += "bg-red-50 text-red-700 font-medium";
            td.title = `Thấp (< ${lt})`;
          } else if (count < mt) {
            c += "bg-yellow-50 text-yellow-700 font-semibold";
            td.title = `Trung bình (${lt}-${mt - 1})`;
          } else {
            c += "bg-green-50 text-green-700 font-bold";
            td.title = `Tốt (≥ ${mt})`;
          }
          td.textContent = count;
        }
        td.className = c;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });

    refreshIcons();
  }

  _attachSortEvents() {
    this.container.querySelectorAll("[data-sort-trigger]").forEach((btn) => {
      btn.addEventListener("click", () => {
        store.setSort(btn.dataset.sortTrigger);
      });
    });
  }

  _updateSortIcons() {
    const sortConfig = store.state.sort;
    this.container.querySelectorAll("[data-sort-icon]").forEach((el) => {
      const key = el.getAttribute("data-sort-icon");
      const iconName =
        key === sortConfig.key
          ? sortConfig.direction === "asc"
            ? "arrow-up-narrow-wide"
            : "arrow-down-wide-narrow"
          : "chevrons-up-down";
      el.innerHTML = `<i data-lucide="${iconName}" class="w-3.5 h-3.5 ${key === sortConfig.key ? "text-amber-600" : "text-slate-400"}"></i>`;
    });
  }

  _getSortValue(row, key) {
    if (key === "name") return (row.name || row.email || "").toLowerCase();
    if (key === "role") return (row.role_key || "").toLowerCase();
    if (key === "total") return Number(row.total) || 0;
    if (key.startsWith("hour-")) {
      const hr = Number(key.split("-")[1]);
      return Number(row.hourly?.[hr] || 0);
    }
    return row[key] ?? "";
  }
}
