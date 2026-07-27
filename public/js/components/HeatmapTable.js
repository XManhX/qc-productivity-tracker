import { store } from "../store/DashboardStore.js";
import { refreshIcons } from "../utils/icons.js";
import { Pagination } from "./Pagination.js";

export class HeatmapTable {
  constructor(container) {
    this.container = container;

    // Các giá trị sticky left cố định
    this._leftName = 0;
    this._leftRole = 280;
    this._leftTotal = 370;

    // Debounce cập nhật (NEW)
    this._debounceDelay = 300; // ms
    this._debounceTimer = null;

    this._renderStructure();

    // Pagination
    this.pagination = new Pagination(
      this.container.querySelector("#pagination-wrapper"),
      store,
      {
        showPageSizeDropdown: true,
        pageSizeOptions: [10, 25, 50, 100],
        windowSize: 5,
      },
    );

    // Trạng thái cho cập nhật động
    this._previousData = null;
    this._previousUserMap = null; // Map<email, user>
    this._rowMap = null; // Map<email, HTMLTableRowElement>
    this._lastHourRange = null;
    this._lastSort = null;

    // Live update indicator
    this._lastUpdateTime = null;
    this._updateStatus = "idle";
    this._refreshInterval = 120; // giây
    this._statusTimer = null;

    // Sử dụng debounce khi store update (NEW)
    store.on("update", () => {
      this._handleStoreUpdate();
      this._scheduleRender();
      refreshIcons();
    });

    this._startStatusTimer();
    this._updateStatusDisplay();
  }

  // ==================== WORK & BREAK CONFIG ====================
  _getWorkConfig() {
    const cfg = store.getAlertConfig();
    if (cfg) {
      return {
        workStart: cfg.work_start_hour ?? 8,
        workEnd: cfg.work_end_hour ?? 20,
        breakStart:
          (cfg.break_start_hour ?? 12) + (cfg.break_start_min ?? 30) / 60,
        breakEnd: (cfg.break_end_hour ?? 13) + (cfg.break_end_min ?? 30) / 60,
      };
    }
    return { workStart: 8, workEnd: 20, breakStart: 12.5, breakEnd: 13.5 };
  }

  _getBreakConfig() {
    const cfg = store.getAlertConfig();
    if (cfg) {
      return {
        startHour: cfg.break_start_hour ?? 12,
        startMin: cfg.break_start_min ?? 30,
        endHour: cfg.break_end_hour ?? 13,
        endMin: cfg.break_end_min ?? 30,
      };
    }
    return { startHour: 12, startMin: 30, endHour: 13, endMin: 30 };
  }

  _computeDisplayTotal(user, hourStart, hourEnd) {
    let rawTotal = 0;
    let activeHours = 0;

    for (let h = hourStart; h <= hourEnd; h++) {
      const cnt = user.hourly?.[h] || 0;
      if (cnt > 0) {
        activeHours++;
        rawTotal += cnt;
      }
    }

    if (activeHours === 0) {
      return { displayTotal: 0, effectiveHours: 0 };
    }

    const breakCfg = this._getBreakConfig();
    const breakStart = breakCfg.startHour + breakCfg.startMin / 60;
    const breakEnd = breakCfg.endHour + breakCfg.endMin / 60;
    const workStart = hourStart;
    const workEnd = hourEnd + 1;
    const hasFullBreak = workStart <= breakStart && workEnd >= breakEnd;

    let effectiveHours = activeHours;
    if (hasFullBreak && activeHours > 1) {
      effectiveHours = activeHours - 1;
    }

    return { displayTotal: rawTotal, effectiveHours };
  }

  // ==================== GIAO DIỆN ====================
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
            <span class="text-slate-400 italic ml-2">(ngưỡng dựa trên giờ có sản lượng thực tế, đã trừ 1h nghỉ nếu có)</span>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <button id="btn-export-image" 
                  class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg 
                        bg-white border border-slate-200 text-slate-600 
                        hover:bg-slate-50 hover:border-slate-300 hover:text-slate-700
                        active:bg-slate-100 active:scale-95
                        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-slate-200
                        transition-all duration-200 shadow-sm"
                  title="Xuất toàn bộ bảng thành ảnh PNG">
            <i data-lucide="camera" class="w-4 h-4"></i>
            <span>Xuất ảnh</span>
          </button>
          <div id="live-update-status" class="flex items-center gap-2 text-xs font-medium">
            <span class="flex items-center gap-1.5 bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full">
              <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Đang kết nối...
            </span>
          </div>
        </div>  
      </div>
      <div class="overflow-x-auto border border-slate-200 shadow-sm" id="table-wrapper">
        <div class="max-h-[calc(100vh-12rem)] overflow-y-auto" id="table-scroll-container">
          <table class="w-full text-center border-collapse" id="data-table">
            <thead id="table-header" class="text-xs uppercase tracking-wider font-semibold"></thead>
            <tbody id="dashboard-body" class="divide-y divide-slate-100 text-sm bg-white"></tbody>
          </table>
        </div>
        <div id="pagination-wrapper"></div>
      </div>
    `;
    refreshIcons();
    const exportBtn = this.container.querySelector("#btn-export-image");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => this.exportToImage());
    }
  }

  // ==================== LIVE UPDATE STATUS ====================
  _startStatusTimer() {
    if (this._statusTimer) return;
    this._statusTimer = setInterval(() => this._updateStatusDisplay(), 1000);
  }

  _handleStoreUpdate() {
    if (store.state.loading) {
      this._updateStatus = "loading";
    } else if (store.state.error) {
      this._updateStatus = "error";
    } else {
      this._updateStatus = "success";
      this._lastUpdateTime = Date.now();
    }
    this._updateStatusDisplay();
  }

  _updateStatusDisplay() {
    const statusEl = this.container.querySelector("#live-update-status");
    if (!statusEl) return;

    const now = Date.now();
    let statusClass = "";
    let iconHtml = "";
    let label = "";
    let timeInfo = "";

    switch (this._updateStatus) {
      case "loading":
        statusClass = "bg-blue-50 text-blue-700";
        iconHtml = `<span class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>`;
        label = "Đang cập nhật";
        if (this._lastUpdateTime) {
          const elapsed = Math.floor((now - this._lastUpdateTime) / 1000);
          timeInfo = `đã tải ${this._formatDuration(elapsed)}`;
        }
        break;
      case "error":
        statusClass = "bg-red-50 text-red-700";
        iconHtml = `<i data-lucide="alert-circle" class="w-3.5 h-3.5"></i>`;
        label = "Lỗi cập nhật";
        timeInfo = "thử lại sau";
        break;
      case "success":
        statusClass = "bg-emerald-50 text-emerald-700";
        iconHtml = `<i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i>`;
        label = "Đã cập nhật";
        if (this._lastUpdateTime) {
          const elapsed = Math.floor((now - this._lastUpdateTime) / 1000);
          const remaining = Math.max(0, this._refreshInterval - elapsed);
          timeInfo = `⏳ ${this._formatDuration(remaining)}`;
        }
        break;
      default:
        statusClass = "bg-slate-100 text-slate-500";
        iconHtml = `<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>`;
        label = "Đang kết nối...";
        break;
    }

    statusEl.innerHTML = `
      <span class="flex items-center gap-1.5 ${statusClass} px-2.5 py-1 rounded-full">
        ${iconHtml} ${label}
      </span>
      ${timeInfo ? `<span class="text-slate-400 font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">${timeInfo}</span>` : ""}
    `;

    if (this._updateStatus === "error" || this._updateStatus === "success") {
      refreshIcons();
    }
  }

  _formatDuration(totalSeconds) {
    if (totalSeconds < 60) return `${totalSeconds}s`;
    if (totalSeconds < 3600) {
      const m = Math.floor(totalSeconds / 60);
      const s = totalSeconds % 60;
      return `${m}:${s.toString().padStart(2, "0")}`;
    }
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    return `${h}:${m.toString().padStart(2, "0")}h`;
  }

  destroy() {
    if (this._statusTimer) {
      clearInterval(this._statusTimer);
      this._statusTimer = null;
    }
    if (this._debounceTimer) {
      // NEW
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  }

  // ==================== DEBOUNCE (NEW) ====================
  _scheduleRender() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      this._renderTable();
    }, this._debounceDelay);
  }

  _showDelta(td, delta) {
    // Xóa badge cũ nếu có
    const existing = td.querySelector(".delta-badge");
    if (existing) existing.remove();

    if (delta === 0) return;

    const badge = document.createElement("span");
    badge.className = `delta-badge ${delta > 0 ? "delta-increase" : "delta-decrease"}`;
    badge.textContent = delta > 0 ? `↑+${delta}` : `↓-${delta}`;
    td.appendChild(badge);

    // Tự xóa sau khi animation kết thúc
    badge.addEventListener("animationend", () => badge.remove());
  }

  // ==================== HEADER ====================
  _buildHeader(headerRow, hourStart, hourEnd) {
    let html = `
      <th class="sticky top-0 left-[${this._leftName}px] z-40 w-[280px] min-w-[280px] text-left font-semibold text-slate-700 bg-slate-100">
        <button class="group flex items-center gap-1 w-full  px-4 py-2 text-left hover:text-amber-600 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded" data-sort-trigger="name">
          <span class="w-full">Nhân viên</span>
          <span data-sort-icon="name" class="group-hover:text-amber-500 transition-colors"><i data-lucide="chevrons-up-down" class="w-3.5 h-3.5 text-slate-400"></i></span>
        </button>
      </th>
      <th class="sticky top-0 left-[${this._leftRole}px] z-30 w-[90px] min-w-[90px] text-left font-semibold text-slate-700 bg-slate-100">
        <button class="group flex items-center gap-1 w-full  px-4 py-2 text-left hover:text-amber-600 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded" data-sort-trigger="role">
          <span class="w-full">Role</span>
          <span data-sort-icon="role" class="group-hover:text-amber-500 transition-colors"><i data-lucide="chevrons-up-down" class="w-3.5 h-3.5 text-slate-400"></i></span>
        </button>
      </th>
      <th class="sticky top-0 left-[${this._leftTotal}px] z-30 w-[90px] min-w-[90px] bg-emerald-50 font-bold text-emerald-800">
        <button class="group flex items-center justify-center gap-1 w-full  px-4 py-2 text-left hover:text-amber-600 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded" data-sort-trigger="total">
          <span class="w-full">Tổng</span>
          <span data-sort-icon="total" class="group-hover:text-amber-500 transition-colors"><i data-lucide="chevrons-up-down" class="w-3.5 h-3.5 text-slate-400"></i></span>
        </button>
      </th>`;

    const { workStart, workEnd, breakStart, breakEnd } = this._getWorkConfig();
    const breakStartHour = Math.floor(breakStart);
    const breakEndHour = Math.floor(breakEnd);

    for (let h = hourStart; h <= hourEnd; h++) {
      let bgClass = "bg-white text-slate-700";
      let tooltip = "";

      if (h < workStart || h >= workEnd) {
        bgClass = "bg-gray-50 text-gray-400";
      } else if (h >= breakStartHour && h < breakEndHour) {
        bgClass = "bg-orange-50 text-orange-600";
        tooltip = 'title="Nghỉ trưa"';
      }

      html += `
        <th class="sticky top-0 z-20 font-semibold border-l border-slate-200/50 ${bgClass}" ${tooltip}>
          <button class="group flex items-center justify-center gap-1 w-full px-3 py-3 text-left hover:text-amber-600 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded" data-sort-trigger="hour-${h}">
            <span class="w-full">${h}:00</span>
            <span data-sort-icon="hour-${h}" class="group-hover:text-amber-500 transition-colors"><i data-lucide="chevrons-up-down" class="w-3.5 h-3.5 text-slate-400"></i></span>
          </button>
        </th>`;
    }

    headerRow.innerHTML = html;
    refreshIcons();
    this._attachSortEvents();
    this._updateSortIcons();
  }

  // ==================== RENDER BẢNG CHÍNH ====================
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

    this._buildHeader(headerRow, hourStart, hourEnd);

    const data = store.items;

    if (store.state.loading && !data.length) {
      tbody.innerHTML = `<tr><td colspan="${3 + (hourEnd - hourStart + 1)}" class="py-12 text-center text-slate-400">
        <div class="flex flex-col items-center gap-2"><div class="loading-spinner w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div><span>Đang tải dữ liệu...</span></div>
      </td></tr>`;
      this._rowMap = null;
      this._previousUserMap = null;
      return;
    }

    if (store.state.error && !data.length) {
      tbody.innerHTML = `<tr><td colspan="${3 + (hourEnd - hourStart + 1)}" class="py-12 text-rose-500 text-center">
        <i data-lucide="alert-triangle" class="w-10 h-10 mx-auto"></i><span>Lỗi: ${store.state.error}</span>
      </td></tr>`;
      this._rowMap = null;
      this._previousUserMap = null;
      return;
    }

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="${3 + (hourEnd - hourStart + 1)}" class="py-12 text-center text-slate-400">
        <div class="flex flex-col items-center gap-2"><i data-lucide="inbox" class="w-10 h-10 text-slate-300"></i><span>Không có dữ liệu</span></div>
      </td></tr>`;
      this._rowMap = null;
      this._previousUserMap = null;
      return;
    }

    const sorted = [...data].sort((a, b) => {
      const av = this._getSortValue(a, sortConfig.key);
      const bv = this._getSortValue(b, sortConfig.key);
      if (av < bv) return sortConfig.direction === "asc" ? -1 : 1;
      if (av > bv) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

    if (hourChanged || !this._rowMap) {
      this._fullRender(sorted, hourStart, hourEnd);
      this._buildRowMap();
    } else {
      this._syncTable(sorted, hourStart, hourEnd);
    }

    this._previousUserMap = new Map(sorted.map((u) => [u.email, u]));
    this._lastHourRange = { hourStart, hourEnd };
    this._lastSort = { key: sortConfig.key, direction: sortConfig.direction };

    refreshIcons();
  }

  _fullRender(data, hourStart, hourEnd) {
    const tbody = this.container.querySelector("#dashboard-body");
    tbody.innerHTML = "";
    data.forEach((user) => {
      const tr = this._createRow(user, hourStart, hourEnd);
      tbody.appendChild(tr);
    });
  }

  _buildRowMap() {
    this._rowMap = new Map();
    this.container
      .querySelectorAll("#dashboard-body tr[data-user-email]")
      .forEach((tr) => {
        this._rowMap.set(tr.dataset.userEmail, tr);
      });
  }

  _syncTable(sortedData, hourStart, hourEnd) {
    const tbody = this.container.querySelector("#dashboard-body");
    const oldUserMap = this._previousUserMap || new Map();

    for (const user of sortedData) {
      let tr = this._rowMap.get(user.email);
      if (!tr) {
        tr = this._createRow(user, hourStart, hourEnd);
        this._rowMap.set(user.email, tr);
      } else {
        const oldUser = oldUserMap.get(user.email);
        if (oldUser) {
          this._updateRow(tr, user, oldUser, hourStart, hourEnd);
        } else {
          this._updateRowComplete(tr, user, hourStart, hourEnd);
        }
      }
      tbody.appendChild(tr);
    }

    const newEmails = new Set(sortedData.map((u) => u.email));
    const rowsToRemove = [];
    tbody.querySelectorAll("tr[data-user-email]").forEach((tr) => {
      if (!newEmails.has(tr.dataset.userEmail)) {
        rowsToRemove.push(tr);
      }
    });
    rowsToRemove.forEach((tr) => {
      tr.remove();
      this._rowMap.delete(tr.dataset.userEmail);
    });
  }

  _updateRowComplete(tr, user, hourStart, hourEnd) {
    // Cập nhật toàn bộ hàng (không có oldUser) – giống như _createRow nhưng không tạo mới
    // Để tránh trùng lặp code, ta có thể dùng _createRow rồi thay thế, nhưng ở đây ta ghi đè trực tiếp các td.
    const tds = tr.children;
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
    tds[1].textContent = user.display_name || user.role_key || "-";

    const { displayTotal, effectiveHours } = this._computeDisplayTotal(
      user,
      hourStart,
      hourEnd,
    );
    const lowTotal = (user.low_threshold || 10) * effectiveHours;
    const highTotal = (user.medium_threshold || 16) * effectiveHours;
    tds[2].textContent = displayTotal;
    tds[2].className = this._getTotalCellClass(
      displayTotal,
      lowTotal,
      highTotal,
    );
    tds[2].title = `Tổng ước tính cho ${effectiveHours} giờ làm việc thực tế (đã trừ 1h nghỉ trưa nếu có)`;

    for (let h = hourStart; h <= hourEnd; h++) {
      const idx = 3 + (h - hourStart);
      const td = tds[idx];
      const count = user.hourly?.[h] || 0;
      td.textContent = count === 0 ? "-" : count;
      td.className = this._getHourCellClass(
        count,
        user.low_threshold || 10,
        user.medium_threshold || 16,
      );
      if (count > 0) {
        const lt = user.low_threshold || 10;
        const mt = user.medium_threshold || 16;
        td.title =
          count < lt
            ? `Thấp (< ${lt})`
            : count < mt
              ? `Trung bình (${lt}-${mt - 1})`
              : `Tốt (≥ ${mt})`;
      } else {
        td.removeAttribute("title");
      }
    }
  }

  _createRow(user, hourStart, hourEnd) {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50/80 transition duration-150";
    tr.dataset.userEmail = user.email;

    // Cột Nhân viên
    const tdName = document.createElement("td");
    tdName.className = `sticky left-[${this._leftName}px] z-10 bg-white w-[280px] min-w-[280px] px-4 py-2 text-left font-medium text-slate-900 border-r border-slate-100 max-w-[280px]`;
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

    // Cột Role
    const tdRole = document.createElement("td");
    tdRole.className = `sticky left-[${this._leftRole}px] z-10 bg-white w-[90px] min-w-[90px] px-2 py-2 border-r border-slate-100 text-sm`;
    tdRole.textContent = user.display_name || user.role_key || "-";
    tr.appendChild(tdRole);

    // Cột Tổng (thêm class relative để chứa delta badge)
    const { displayTotal, effectiveHours } = this._computeDisplayTotal(
      user,
      hourStart,
      hourEnd,
    );
    const lowTotal = (user.low_threshold || 10) * effectiveHours;
    const highTotal = (user.medium_threshold || 16) * effectiveHours;
    const tdTotal = document.createElement("td");
    tdTotal.className = `${this._getTotalCellClass(displayTotal, lowTotal, highTotal)} relative`; // thêm relative
    tdTotal.textContent = displayTotal;
    tdTotal.title = `Tổng ước tính cho ${effectiveHours} giờ làm việc thực tế (đã trừ 1h nghỉ trưa nếu có)`;
    tr.appendChild(tdTotal);

    // Các cột giờ (cũng thêm relative)
    for (let h = hourStart; h <= hourEnd; h++) {
      const count = user.hourly?.[h] || 0;
      const td = document.createElement("td");
      td.className = `${this._getHourCellClass(count, user.low_threshold || 10, user.medium_threshold || 16)} relative`; // thêm relative
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

  _updateRow(tr, user, oldUser, hourStart, hourEnd) {
    const tds = tr.children;

    // Cập nhật tên
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

    // Role
    const roleChanged =
      (user.display_name || user.role_key || "-") !==
      (oldUser.display_name || oldUser.role_key || "-");
    if (roleChanged) {
      tds[1].textContent = user.display_name || user.role_key || "-";
    }

    // Tổng và delta
    const { displayTotal: totalNew, effectiveHours: effNew } =
      this._computeDisplayTotal(user, hourStart, hourEnd);
    const { displayTotal: totalOld } = this._computeDisplayTotal(
      oldUser,
      hourStart,
      hourEnd,
    );
    const thresholdsChanged =
      user.low_threshold !== oldUser.low_threshold ||
      user.medium_threshold !== oldUser.medium_threshold;

    const totalChanged = totalNew !== totalOld || thresholdsChanged;
    if (totalChanged) {
      const lowTotal = (user.low_threshold || 10) * effNew;
      const highTotal = (user.medium_threshold || 16) * effNew;
      tds[2].textContent = totalNew;
      tds[2].className = `${this._getTotalCellClass(totalNew, lowTotal, highTotal)} relative`;
      tds[2].title = `Tổng ước tính cho ${effNew} giờ làm việc thực tế (đã trừ 1h nghỉ trưa nếu có)`;

      // Delta cho tổng (chỉ khi giá trị thay đổi, không phải do threshold)
      if (totalNew !== totalOld) {
        this._showDelta(tds[2], totalNew - totalOld);
      }
    }

    // Từng giờ
    for (let h = hourStart; h <= hourEnd; h++) {
      const idx = 3 + (h - hourStart);
      const td = tds[idx];
      const newCount = user.hourly?.[h] || 0;
      const oldCount = oldUser.hourly?.[h] || 0;
      const countChanged = newCount !== oldCount || thresholdsChanged;
      if (countChanged) {
        td.textContent = newCount === 0 ? "-" : newCount;
        td.className = `${this._getHourCellClass(newCount, user.low_threshold || 10, user.medium_threshold || 16)} relative`;
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

        // Delta cho giờ (chỉ khi giá trị thay đổi)
        if (newCount !== oldCount) {
          this._showDelta(td, newCount - oldCount);
        }
      }
    }
  }

  _getTotalCellClass(total, lowTotal, highTotal) {
    let colorClass = "bg-slate-50 text-slate-400";
    if (total > 0) {
      if (total < lowTotal) colorClass = "bg-red-50 text-red-800";
      else if (total < highTotal) colorClass = "bg-yellow-50 text-yellow-800";
      else colorClass = "bg-green-50 text-green-800";
    }
    return `sticky left-[${this._leftTotal}px] z-10 ${colorClass} w-[90px] min-w-[90px] px-2 py-2 border-r border-slate-100 font-bold text-center`;
  }

  _getHourCellClass(count, lowThreshold, mediumThreshold) {
    let base =
      "px-3 py-4 border-l border-slate-100 transition-colors text-center ";
    if (count === 0) return base + "bg-slate-50 text-slate-300";
    if (count < lowThreshold)
      return base + "bg-red-50 text-red-700 font-medium";
    if (count < mediumThreshold)
      return base + "bg-yellow-50 text-yellow-700 font-semibold";
    return base + "bg-green-50 text-green-700 font-bold";
  }

  // ==================== SORT ====================
  _attachSortEvents() {
    this.container.querySelectorAll("[data-sort-trigger]").forEach((btn) => {
      btn.addEventListener("click", () =>
        store.setSort(btn.dataset.sortTrigger),
      );
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

  // ==================== EXPORT IMAGE ====================
  async exportToImage() {
    const exportBtn = this.container.querySelector("#btn-export-image");
    if (!exportBtn) return;

    const originalHTML = exportBtn.innerHTML;
    exportBtn.innerHTML =
      '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Đang xuất...</span>';
    exportBtn.disabled = true;
    exportBtn.classList.add(
      "bg-indigo-50",
      "border-indigo-200",
      "text-indigo-700",
    );

    refreshIcons();

    try {
      const { filters, sort } = store.state;
      const hourStart = Number(filters.hourStart);
      const hourEnd = Number(filters.hourEnd);
      const sortedData = [...store.items].sort((a, b) => {
        const av = this._getSortValue(a, sort.key);
        const bv = this._getSortValue(b, sort.key);
        if (av < bv) return sort.direction === "asc" ? -1 : 1;
        if (av > bv) return sort.direction === "asc" ? 1 : -1;
        return 0;
      });

      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.top = "-9999px";
      container.style.left = "0";
      container.style.backgroundColor = "#ffffff";
      container.style.padding = "12px";
      container.style.fontFamily = "Inter, sans-serif";

      let html = `<table style="border-collapse: collapse; width: auto; font-size: 13px;">`;
      html += `<thead><tr style="background: #f1f5f9; font-weight: 600; text-align: center;">`;
      html += `<th style="border: 1px solid #cbd5e1; padding: 8px 12px; min-width: 200px; text-align: left;">Nhân viên</th>`;
      html += `<th style="border: 1px solid #cbd5e1; padding: 8px 12px; min-width: 80px; text-align: left;">Role</th>`;
      html += `<th style="border: 1px solid #cbd5e1; padding: 8px 12px; min-width: 80px; background: #ecfdf5; font-weight: 700;">Tổng</th>`;
      for (let h = hourStart; h <= hourEnd; h++) {
        html += `<th style="border: 1px solid #cbd5e1; padding: 8px 12px; min-width: 55px;">${h}:00</th>`;
      }
      html += `</tr></thead><tbody>`;

      sortedData.forEach((user) => {
        const { displayTotal: total, effectiveHours } =
          this._computeDisplayTotal(user, hourStart, hourEnd);
        const lowTotal = (user.low_threshold || 10) * effectiveHours;
        const highTotal = (user.medium_threshold || 16) * effectiveHours;

        let totalBg = "#f8fafc";
        if (total > 0) {
          if (total < lowTotal) totalBg = "#fee2e2";
          else if (total < highTotal) totalBg = "#fef9c3";
          else totalBg = "#dcfce7";
        }

        html += `<tr>`;
        const name = user.name || user.email;
        const email = user.name ? user.email : "";
        html += `<td style="border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left;">
                <div style="font-weight: 500;">${name}</div>
                ${email ? `<div style="font-size: 11px; color: #64748b;">${email}</div>` : ""}
              </td>`;
        html += `<td style="border: 1px solid #e2e8f0; padding: 8px 12px;">${user.display_name || user.role_key || "-"}</td>`;
        html += `<td style="border: 1px solid #e2e8f0; padding: 8px 12px; text-align: center; font-weight: bold; background: ${totalBg};" title="Tổng ước tính cho ${effectiveHours} giờ làm việc thực tế">${total}</td>`;

        for (let h = hourStart; h <= hourEnd; h++) {
          const count = user.hourly?.[h] || 0;
          let bg = "#f8fafc";
          let color = "#94a3b8";
          if (count > 0) {
            const lt = user.low_threshold || 10;
            const mt = user.medium_threshold || 16;
            if (count < lt) {
              bg = "#fee2e2";
              color = "#991b1b";
            } else if (count < mt) {
              bg = "#fef9c3";
              color = "#854d0e";
            } else {
              bg = "#dcfce7";
              color = "#166534";
            }
          }
          html += `<td style="border: 1px solid #e2e8f0; padding: 8px 12px; text-align: center; background: ${bg}; color: ${color};">
                  ${count === 0 ? "-" : count}
                </td>`;
        }
        html += `</tr>`;
      });

      html += `</tbody></table>`;
      container.innerHTML = html;
      document.body.appendChild(container);

      await new Promise((r) => setTimeout(r, 100));

      const canvas = await html2canvas(container.firstElementChild, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });

      document.body.removeChild(container);

      const link = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      link.download = `QC_Heatmap_${dateStr}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();

      console.log("[Export] Ảnh đã tạo thành công!");
    } catch (error) {
      console.error("[Export] Lỗi:", error);
      alert("Xuất ảnh thất bại, vui lòng thử lại.");
    } finally {
      exportBtn.innerHTML = originalHTML;
      exportBtn.disabled = false;
      exportBtn.classList.remove(
        "bg-indigo-50",
        "border-indigo-200",
        "text-indigo-700",
      );

      refreshIcons();
    }
  }
}
