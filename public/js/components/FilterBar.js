import { store } from "../store/DashboardStore.js";
import { debounce } from "../utils/debounce.js";
import { refreshIcons } from "../utils/icons.js";

export class FilterBar {
  constructor(container) {
    this.container = container;
    this._lastRoleKeys = ""; // để theo dõi danh sách roles thay đổi
    this._initialRender();
    this._bindEvents();
    store.on("update", () => this._applyState());
    this._applyState();
  }

  _initialRender() {
    this.container.innerHTML = `
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <i data-lucide="trending-up" class="text-emerald-500"></i>
            Theo Dõi Năng Suất Thời Gian Thực
          </h1>
          <p class="text-slate-500 text-sm mt-1">
            Phân tích chi tiết lượng đơn quét của từng QC theo từng khung giờ trong ngày.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex items-center bg-slate-100 border border-slate-200 rounded-xl px-3 h-11">
            <i data-lucide="calendar" class="w-4 h-4 text-slate-400 mr-2"></i>
            <input type="date" id="filter-date" class="bg-transparent border-0 text-slate-700 text-sm font-semibold focus:ring-0 focus:outline-none" />
          </div>

          <!-- MULTI-SELECT ROLE -->
          <div class="relative" id="role-multi-select">
            <button type="button" id="role-btn" class="flex items-center bg-white border border-slate-200 rounded-xl px-3 h-11 text-sm focus:outline-none min-w-[180px] hover:bg-slate-50 transition-colors">
              <i data-lucide="user-cog" class="w-4 h-4 text-slate-400 mr-2"></i>
              <span id="role-btn-text" class="flex-1 text-left text-slate-700 truncate">Tất cả role</span>
              <i data-lucide="chevron-down" id="role-arrow" class="w-4 h-4 text-slate-400 ml-2 transition-transform duration-200"></i>
            </button>
            <div id="role-dropdown" class="absolute left-0 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg z-30 max-h-72 overflow-hidden transition-all duration-200 ease-in-out"
                 style="max-height: 0; opacity: 0; visibility: hidden;">
              <div class="p-2 border-b border-slate-100 flex justify-between">
                <button type="button" id="select-all-roles" class="text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors">Chọn tất cả</button>
                <button type="button" id="deselect-all-roles" class="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors">Bỏ chọn</button>
              </div>
              <div id="role-checkboxes" class="p-2 space-y-1 overflow-y-auto max-h-48"></div>
            </div>
          </div>

          <div class="flex items-center bg-white border border-slate-200 rounded-xl px-3 h-11">
            <i data-lucide="search" class="w-4 h-4 text-slate-400 mr-2"></i>
            <input id="filter-q" placeholder="Tìm theo tên hoặc email" class="text-sm focus:outline-none w-44" />
          </div>
          <div class="flex items-center bg-white border border-slate-200 rounded-xl px-3 h-11">
            <label class="text-sm text-slate-500 mr-2 whitespace-nowrap">Min Tổng</label>
            <input id="filter-min-total" type="number" min="0" placeholder="0" class="w-20 text-sm focus:outline-none" />
          </div>
          <div class="flex items-center bg-white border border-slate-200 rounded-xl px-3 h-11">
            <label class="text-sm text-slate-500 mr-2 whitespace-nowrap">Giờ</label>
            <input id="filter-hour-start" type="number" min="0" max="23" class="w-14 text-sm focus:outline-none mr-2" />
            <span class="text-sm text-slate-400">→</span>
            <input id="filter-hour-end" type="number" min="0" max="23" class="w-14 text-sm focus:outline-none ml-2" />
          </div>
          <div class="flex items-center bg-white border border-slate-200 rounded-xl px-3 h-11">
            <label class="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer whitespace-nowrap">
              <input id="filter-active-only" type="checkbox" />
              <span>Chỉ hiển thị đang active</span>
            </label>
          </div>
          <div class="flex items-center gap-3 ml-auto">
            <button id="export-btn" class="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-5 h-11 rounded-xl transition shadow-sm">
              <i data-lucide="download" class="w-4 h-4"></i> Xuất Excel
            </button>
            <button id="reset-btn" class="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white font-semibold text-sm px-4 h-11 rounded-xl transition shadow-sm">
              <i data-lucide="trash-2" class="w-4 h-4"></i> Đặt lại
            </button>
            <button id="refresh-btn" class="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm px-5 h-11 rounded-xl transition shadow-sm">
              <i data-lucide="refresh-cw" class="w-4 h-4"></i> Làm Mới
            </button>
          </div>
        </div>
      </div>
    `;
    refreshIcons();
  }

  _bindEvents() {
    const dateEl = this.container.querySelector("#filter-date");
    const qEl = this.container.querySelector("#filter-q");
    const minTotalEl = this.container.querySelector("#filter-min-total");
    const hourStartEl = this.container.querySelector("#filter-hour-start");
    const hourEndEl = this.container.querySelector("#filter-hour-end");
    const activeOnlyEl = this.container.querySelector("#filter-active-only");
    const exportBtn = this.container.querySelector("#export-btn");
    const resetBtn = this.container.querySelector("#reset-btn");
    const refreshBtn = this.container.querySelector("#refresh-btn");

    // --- Các filter khác giữ nguyên ---
    dateEl.addEventListener("change", () =>
      store.setFilters({ date: dateEl.value })
    );
    qEl.addEventListener(
      "input",
      debounce(() => store.setFilters({ q: qEl.value.trim() }), 350)
    );
    minTotalEl.addEventListener("change", () =>
      store.setFilters({ minTotal: minTotalEl.value })
    );
    hourStartEl.addEventListener("change", () => {
      let v = Number(hourStartEl.value);
      if (isNaN(v) || v < 0) v = 0;
      if (v > 23) v = 23;
      hourStartEl.value = v;
      store.setFilters({ hourStart: v.toString(), hourEnd: hourEndEl.value });
    });
    hourEndEl.addEventListener("change", () => {
      let v = Number(hourEndEl.value);
      if (isNaN(v) || v < 0) v = 0;
      if (v > 23) v = 23;
      hourEndEl.value = v;
      store.setFilters({ hourStart: hourStartEl.value, hourEnd: v.toString() });
    });
    activeOnlyEl.addEventListener("change", () =>
      store.setFilters({ activeOnly: activeOnlyEl.checked })
    );
    exportBtn.addEventListener("click", () => this._exportExcel());
    resetBtn.addEventListener("click", () => store.resetFilters());
    refreshBtn.addEventListener("click", () => store.loadData());

    // --- Multi-select Role ---
    this.roleContainer = this.container.querySelector("#role-multi-select");
    this.roleBtn = this.container.querySelector("#role-btn");
    this.roleBtnText = this.container.querySelector("#role-btn-text");
    this.roleArrow = this.container.querySelector("#role-arrow");
    this.roleDropdown = this.container.querySelector("#role-dropdown");
    this.roleCheckboxesContainer = this.container.querySelector("#role-checkboxes");

    // Render danh sách checkbox ban đầu (dựa trên store.state.roles)
    this._renderRoleCheckboxes();

    // Toggle dropdown
    this.roleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggleRoleDropdown();
    });

    // Đóng dropdown khi click bên ngoài
    document.addEventListener("click", (e) => {
      if (this.roleContainer && !this.roleContainer.contains(e.target)) {
        this._closeRoleDropdown();
      }
    });

    // Chọn tất cả / Bỏ chọn
    this.container.querySelector("#select-all-roles").addEventListener("click", () => {
      const checkboxes = this.roleCheckboxesContainer.querySelectorAll(".role-checkbox");
      checkboxes.forEach((cb) => (cb.checked = true));
      this._updateRoleSelection();
    });
    this.container.querySelector("#deselect-all-roles").addEventListener("click", () => {
      const checkboxes = this.roleCheckboxesContainer.querySelectorAll(".role-checkbox");
      checkboxes.forEach((cb) => (cb.checked = false));
      this._updateRoleSelection();
    });

    // Lắng nghe thay đổi từng checkbox
    this.roleCheckboxesContainer.addEventListener("change", (e) => {
      if (e.target.classList.contains("role-checkbox")) {
        this._updateRoleSelection();
      }
    });
  }

  // ========== Các phương thức hỗ trợ multi‑select ==========

  _renderRoleCheckboxes() {
    const roles = store.state.roles;
    if (!roles || !roles.length) {
      this.roleCheckboxesContainer.innerHTML = `<p class="text-sm text-slate-400 p-2">Không có role</p>`;
      return;
    }
    let html = "";
    roles.forEach((r) => {
      html += `
        <label class="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer">
          <input type="checkbox" value="${r.role_key}" class="role-checkbox rounded border-slate-300 text-emerald-600 focus:ring-emerald-500">
          <span class="text-sm text-slate-700 truncate">${r.display_name || r.role_key}</span>
        </label>
      `;
    });
    this.roleCheckboxesContainer.innerHTML = html;
  }

  _toggleRoleDropdown(force) {
    const isOpen =
      this.roleDropdown.style.maxHeight !== "0px" &&
      this.roleDropdown.style.maxHeight !== "";
    const shouldOpen = force !== undefined ? force : !isOpen;

    if (shouldOpen) {
      this.roleDropdown.style.maxHeight = "300px";
      this.roleDropdown.style.opacity = "1";
      this.roleDropdown.style.visibility = "visible";
      this.roleArrow.style.transform = "rotate(180deg)";
    } else {
      this.roleDropdown.style.maxHeight = "0";
      this.roleDropdown.style.opacity = "0";
      this.roleDropdown.style.visibility = "hidden";
      this.roleArrow.style.transform = "rotate(0deg)";
    }
  }

  _closeRoleDropdown() {
    this._toggleRoleDropdown(false);
  }

  _updateRoleSelection() {
    const checked = Array.from(
      this.roleCheckboxesContainer.querySelectorAll(".role-checkbox:checked")
    ).map((cb) => cb.value);
    store.setFilters({ roles: checked });
    this._updateRoleButtonText(checked);
  }

  _updateRoleButtonText(selectedRoles) {
    if (!selectedRoles || selectedRoles.length === 0) {
      this.roleBtnText.textContent = "Tất cả role";
    } else if (selectedRoles.length === 1) {
      const role = store.state.roles.find(
        (r) => r.role_key === selectedRoles[0]
      );
      this.roleBtnText.textContent = role?.display_name || role?.role_key || selectedRoles[0];
    } else {
      this.roleBtnText.textContent = `Đã chọn ${selectedRoles.length}`;
    }
  }

  // ========== Áp dụng state từ store ==========

  _applyState() {
    const f = store.state.filters;
    const dateEl = this.container.querySelector("#filter-date");
    const qEl = this.container.querySelector("#filter-q");
    const minTotalEl = this.container.querySelector("#filter-min-total");
    const hourStartEl = this.container.querySelector("#filter-hour-start");
    const hourEndEl = this.container.querySelector("#filter-hour-end");
    const activeOnlyEl = this.container.querySelector("#filter-active-only");

    if (document.activeElement !== dateEl) dateEl.value = f.date;
    if (document.activeElement !== qEl) qEl.value = f.q;
    if (document.activeElement !== minTotalEl) minTotalEl.value = f.minTotal;
    if (document.activeElement !== hourStartEl) hourStartEl.value = f.hourStart;
    if (document.activeElement !== hourEndEl) hourEndEl.value = f.hourEnd;
    activeOnlyEl.checked = f.activeOnly;

    // Cập nhật multi‑select role
    const selectedRoles = store.state.filters.roles || [];
    const checkboxes = this.roleCheckboxesContainer.querySelectorAll(".role-checkbox");
    checkboxes.forEach((cb) => {
      cb.checked = selectedRoles.includes(cb.value);
    });
    this._updateRoleButtonText(selectedRoles);

    // Nếu danh sách roles từ server thay đổi (sau loadRoles), cần render lại
    const currentRoleKeys = store.state.roles.map((r) => r.role_key).join(",");
    if (this._lastRoleKeys !== currentRoleKeys) {
      this._renderRoleCheckboxes();
      this._lastRoleKeys = currentRoleKeys;
      // Sau khi render lại, đồng bộ trạng thái checked
      const newCheckboxes = this.roleCheckboxesContainer.querySelectorAll(".role-checkbox");
      newCheckboxes.forEach((cb) => {
        cb.checked = selectedRoles.includes(cb.value);
      });
    }
  }

  async _exportExcel() {
    // Load XLSX nếu chưa có
    if (typeof XLSX === 'undefined') {
      const { loadScript } = await import('../utils/loadScript.js');
      await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
    }

    const { data, hourStart, hourEnd } = store.getExportData();
    if (!data.length) return alert("Không có dữ liệu!");
    const sheetData = data.map((u, i) => {
      const row = {
        STT: i + 1,
        Tên: u.name || "",
        Email: u.email,
        Role: u.display_name || u.role_key || "",
        "Tổng Đơn": u.total,
      };
      for (let h = hourStart; h <= hourEnd; h++) {
        row[`${h}h`] = u.hourly?.[h] || 0;
      }
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Năng suất QC");
    XLSX.writeFile(wb, `WMS_QC_Productivity_${store.state.filters.date}.xlsx`);
  }
}