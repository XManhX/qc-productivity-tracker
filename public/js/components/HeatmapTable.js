import { store } from "../store/DashboardStore.js";
import { refreshIcons } from "../utils/icons.js";
import { Pagination } from "./Pagination.js";

export class HeatmapTable {
  constructor(container) {
    this.container = container;
    this._renderStructure();

    this.pagination = new Pagination(
      this.container.querySelector("#pagination-wrapper"),
      store,
      {
        showPageSizeDropdown: true,
        pageSizeOptions: [10, 25, 50, 100],
        windowSize: 5,
      },
    );

    this._previousData = null;
    this._lastHourRange = null;
    this._lastSort = null;

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
      <div class="overflow-x-auto border border-slate-200 shadow-sm">
        <div class="max-h-[calc(100vh-16rem)] overflow-y-auto">
          <table class="w-full text-center border-collapse" id="data-table">
            <thead id="table-header" class="text-xs uppercase tracking-wider font-semibold"></thead>
            <tbody id="dashboard-body" class="divide-y divide-slate-100 text-sm bg-white"></tbody>
          </table>
        </div>
        <div id="pagination-wrapper"></div>
      </div>
    `;
    refreshIcons();
  }

  _buildHeader(headerRow, hourStart, hourEnd) {
    const leftName = 0;
    const leftRole = 260;
    const leftTotal = 260 + 90;

    let html = `
      <th class="sticky top-0 left-[${leftName}px] z-40 w-[260px] min-w-[260px] px-4 py-2 text-left font-semibold text-slate-700 bg-slate-100">
        <button class="group flex items-center gap-1 w-full text-left" data-sort-trigger="name">
          <span class="w-full">Nhân viên</span>
          <span data-sort-icon="name"><i data-lucide="chevrons-up-down" class="w-3.5 h-3.5 text-slate-400"></i></span>
        </button>
      </th>
      <th class="sticky top-0 left-[${leftRole}px] z-30 w-[90px] min-w-[90px] px-4 py-2 text-left font-semibold text-slate-700 bg-slate-100">
        <button class="group flex items-center gap-1 w-full text-left" data-sort-trigger="role">
          <span class="w-full">Role</span>
          <span data-sort-icon="role"><i data-lucide="chevrons-up-down" class="w-3.5 h-3.5 text-slate-400"></i></span>
        </button>
      </th>
      <th class="sticky top-0 left-[${leftTotal}px] z-30 w-[90px] min-w-[90px] px-4 py-4 bg-emerald-50 font-bold text-emerald-800">
        <button class="group flex items-center justify-center gap-1 w-full" data-sort-trigger="total">
          <span class="w-full">Tổng</span>
          <span data-sort-icon="total"><i data-lucide="chevrons-up-down" class="w-3.5 h-3.5 text-slate-400"></i></span>
        </button>
      </th>`;

    for (let h = hourStart; h <= hourEnd; h++) {
      html += `
        <th class="sticky top-0 z-20 px-3 py-4 text-slate-700 font-semibold border-l border-slate-200/50 bg-slate-100">
          <button class="group flex items-center justify-center gap-1 w-full" data-sort-trigger="hour-${h}">
            <span class="w-full">${h}h</span>
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
    const sortConfig = store.state.sort;

    const hourChanged =
      !this._lastHourRange ||
      this._lastHourRange.hourStart !== hourStart ||
      this._lastHourRange.hourEnd !== hourEnd;
    const sortChanged =
      !this._lastSort ||
      this._lastSort.key !== sortConfig.key ||
      this._lastSort.direction !== sortConfig.direction;

    if (hourChanged || sortChanged) {
      this._previousData = null;
    }

    this._buildHeader(headerRow, hourStart, hourEnd);

    const data = store.items;

    if (store.state.loading && !data.length) {
      tbody.innerHTML = `<tr><td colspan="${3 + (hourEnd - hourStart + 1)}" class="py-12 text-center text-slate-400">
        <div class="flex flex-col items-center gap-2"><div class="loading-spinner w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div><span>Đang tải dữ liệu...</span></div>
      </td></tr>`;
      this._previousData = null;
      return;
    }

    if (store.state.error && !data.length) {
      tbody.innerHTML = `<tr><td colspan="${3 + (hourEnd - hourStart + 1)}" class="py-12 text-rose-500 text-center">
        <i data-lucide="alert-triangle" class="w-10 h-10 mx-auto"></i><span>Lỗi: ${store.state.error}</span>
      </td></tr>`;
      this._previousData = null;
      return;
    }

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="${3 + (hourEnd - hourStart + 1)}" class="py-12 text-center text-slate-400">
        <div class="flex flex-col items-center gap-2"><i data-lucide="inbox" class="w-10 h-10 text-slate-300"></i><span>Không có dữ liệu</span></div>
      </td></tr>`;
      this._previousData = null;
      return;
    }

    const sorted = [...data].sort((a, b) => {
      const av = this._getSortValue(a, sortConfig.key);
      const bv = this._getSortValue(b, sortConfig.key);
      if (av < bv) return sortConfig.direction === "asc" ? -1 : 1;
      if (av > bv) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

    if (!this._previousData || this._previousData.length !== sorted.length) {
      this._fullRender(sorted, hourStart, hourEnd);
    } else {
      this._diffUpdate(sorted, hourStart, hourEnd);
    }

    this._previousData = sorted;
    this._lastHourRange = { hourStart, hourEnd };
    this._lastSort = { key: sortConfig.key, direction: sortConfig.direction };

    refreshIcons();
  }

  _fullRender(data, hourStart, hourEnd) {
    const tbody = this.container.querySelector("#dashboard-body");
    tbody.innerHTML = "";

    const leftName = 0;
    const leftRole = 260;
    const leftTotal = 350;

    data.forEach((user) => {
      const tr = this._createRow(
        user,
        hourStart,
        hourEnd,
        leftName,
        leftRole,
        leftTotal,
      );
      tbody.appendChild(tr);
    });
  }

  _createRow(user, hourStart, hourEnd, leftName, leftRole, leftTotal) {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50/80 transition duration-150";
    tr.dataset.userEmail = user.email;

    const tdName = document.createElement("td");
    tdName.className = `sticky left-[${leftName}px] z-10 bg-white w-[260px] min-w-[260px] px-4 py-2 text-left font-medium text-slate-900 border-r border-slate-100 max-w-[260px]`;
    tdName.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 uppercase border border-slate-200 flex-shrink-0">
          ${(user.name || user.email).substring(0, 2)}
        </div>
        <div class="min-w-0">
          <div class="font-semibold text-slate-800 truncate" title="${user.name || user.email}">${user.name || user.email}</div>
          <div class="text-xs text-slate-500 truncate" title="${user.name ? user.email : ""}">${user.name ? user.email : ""}</div>
        </div>
      </div>`;
    tr.appendChild(tdName);

    const tdRole = document.createElement("td");
    tdRole.className = `sticky left-[${leftRole}px] z-10 bg-white w-[90px] min-w-[90px] px-2 py-2 border-r border-slate-100 text-sm`;
    tdRole.textContent = user.display_name || user.role_key || "-";
    tr.appendChild(tdRole);

    const total = user.total || 0;
    const workingHours = hourEnd - hourStart + 1;
    const lowTotal = (user.low_threshold || 10) * workingHours;
    const highTotal = (user.medium_threshold || 16) * workingHours;
    const tdTotal = document.createElement("td");
    tdTotal.className = this._getTotalCellClass(
      total,
      lowTotal,
      highTotal,
      leftTotal,
    );
    tdTotal.textContent = total;
    tr.appendChild(tdTotal);

    for (let h = hourStart; h <= hourEnd; h++) {
      const count = user.hourly?.[h] || 0;
      const td = document.createElement("td");
      td.className = this._getHourCellClass(
        count,
        user.low_threshold || 10,
        user.medium_threshold || 16,
      );
      td.textContent = count === 0 ? "-" : count;
      if (count > 0) {
        const lt = user.low_threshold || 10;
        const mt = user.medium_threshold || 16;
        td.title =
          count < lt
            ? `Thấp (< ${lt})`
            : count < mt
              ? `Trung bình (${lt}-${mt - 1})`
              : `Tốt (≥ ${mt})`;
      }
      tr.appendChild(td);
    }

    return tr;
  }

  _diffUpdate(newData, hourStart, hourEnd) {
    const tbody = this.container.querySelector("#dashboard-body");
    const oldDataMap = new Map(this._previousData.map((u) => [u.email, u]));
    const leftTotal = 350;

    newData.forEach((user) => {
      const tr = tbody.querySelector(`tr[data-user-email="${user.email}"]`);
      if (!tr) {
        this._fullRender(newData, hourStart, hourEnd);
        return;
      }

      const oldUser = oldDataMap.get(user.email);
      if (!oldUser) {
        this._fullRender(newData, hourStart, hourEnd);
        return;
      }

      this._updateRow(tr, user, oldUser, hourStart, hourEnd, leftTotal);
    });
  }

  _updateRow(tr, user, oldUser, hourStart, hourEnd, leftTotal) {
    const tds = tr.children;

    const nameChanged =
      (user.name || user.email) !== (oldUser.name || oldUser.email) ||
      (user.name ? user.email : "") !== (oldUser.name ? oldUser.email : "");
    if (nameChanged) {
      tds[0].innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 uppercase border border-slate-200 flex-shrink-0">
            ${(user.name || user.email).substring(0, 2)}
          </div>
          <div class="min-w-0">
            <div class="font-semibold text-slate-800 truncate" title="${user.name || user.email}">${user.name || user.email}</div>
            <div class="text-xs text-slate-500 truncate" title="${user.name ? user.email : ""}">${user.name ? user.email : ""}</div>
          </div>
        </div>`;
    }

    const roleChanged =
      (user.display_name || user.role_key || "-") !==
      (oldUser.display_name || oldUser.role_key || "-");
    if (roleChanged) {
      tds[1].textContent = user.display_name || user.role_key || "-";
    }

    const totalNew = user.total || 0;
    const totalOld = oldUser.total || 0;
    if (
      totalNew !== totalOld ||
      user.low_threshold !== oldUser.low_threshold ||
      user.medium_threshold !== oldUser.medium_threshold
    ) {
      const workingHours = hourEnd - hourStart + 1;
      const lowTotal = (user.low_threshold || 10) * workingHours;
      const highTotal = (user.medium_threshold || 16) * workingHours;
      tds[2].textContent = totalNew;
      tds[2].className = this._getTotalCellClass(
        totalNew,
        lowTotal,
        highTotal,
        leftTotal,
      );
    }

    for (let h = hourStart; h <= hourEnd; h++) {
      const idx = 3 + (h - hourStart);
      const td = tds[idx];
      const newCount = user.hourly?.[h] || 0;
      const oldCount = oldUser.hourly?.[h] || 0;
      const thresholdsChanged =
        user.low_threshold !== oldUser.low_threshold ||
        user.medium_threshold !== oldUser.medium_threshold;

      if (newCount !== oldCount || thresholdsChanged) {
        td.textContent = newCount === 0 ? "-" : newCount;
        td.className = this._getHourCellClass(
          newCount,
          user.low_threshold || 10,
          user.medium_threshold || 16,
        );
        if (newCount > 0) {
          const lt = user.low_threshold || 10;
          const mt = user.medium_threshold || 16;
          td.title =
            newCount < lt
              ? `Thấp (< ${lt})`
              : newCount < mt
                ? `Trung bình (${lt}-${mt - 1})`
                : `Tốt (≥ ${mt})`;
        } else {
          td.removeAttribute("title");
        }
      }
    }
  }

  _getTotalCellClass(total, lowTotal, highTotal, leftTotal) {
    let colorClass = "bg-slate-50 text-slate-400";
    if (total > 0) {
      if (total < lowTotal) colorClass = "bg-red-50 text-red-800";
      else if (total < highTotal) colorClass = "bg-yellow-50 text-yellow-800";
      else colorClass = "bg-green-50 text-green-800";
    }
    return `sticky left-[${leftTotal}px] z-10 ${colorClass} w-[90px] min-w-[90px] px-2 py-2 border-r border-slate-100 font-bold text-center`;
  }

  _getHourCellClass(count, lowThreshold, mediumThreshold) {
    let base =
      "px-3 py-4 border-l border-slate-100 transition-colors text-center ";
    if (count === 0) {
      return base + "bg-slate-50 text-slate-300";
    }
    if (count < lowThreshold) {
      return base + "bg-red-50 text-red-700 font-medium";
    } else if (count < mediumThreshold) {
      return base + "bg-yellow-50 text-yellow-700 font-semibold";
    } else {
      return base + "bg-green-50 text-green-700 font-bold";
    }
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
