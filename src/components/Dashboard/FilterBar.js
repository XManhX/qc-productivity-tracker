import * as XLSX from "xlsx";
import { store } from "../../store/DashboardStore.js";
import { debounce } from "../../utils/debounce.js";
import { refreshIcons } from "../../utils/icons.js";

export class FilterBar {
  constructor(container) {
    this.container = container;
    this._initialRender();
    this._bindEvents();
    store.on("update", () => this._applyState());
    this._applyState(); // đồng bộ giá trị từ store
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
          <div class="flex items-center bg-white border border-slate-200 rounded-xl px-3 h-11">
            <i data-lucide="user-cog" class="w-4 h-4 text-slate-400 mr-2"></i>
            <select id="filter-role" class="text-sm focus:outline-none bg-transparent"></select>
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
    const roleEl = this.container.querySelector("#filter-role");
    const qEl = this.container.querySelector("#filter-q");
    const minTotalEl = this.container.querySelector("#filter-min-total");
    const hourStartEl = this.container.querySelector("#filter-hour-start");
    const hourEndEl = this.container.querySelector("#filter-hour-end");
    const activeOnlyEl = this.container.querySelector("#filter-active-only");
    const exportBtn = this.container.querySelector("#export-btn");
    const resetBtn = this.container.querySelector("#reset-btn");
    const refreshBtn = this.container.querySelector("#refresh-btn");

    dateEl.addEventListener("change", () =>
      store.setFilters({ date: dateEl.value }),
    );
    roleEl.addEventListener("change", () =>
      store.setFilters({ role: roleEl.value }),
    );
    qEl.addEventListener(
      "input",
      debounce(() => store.setFilters({ q: qEl.value.trim() }), 350),
    );
    minTotalEl.addEventListener("change", () =>
      store.setFilters({ minTotal: minTotalEl.value }),
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
      store.setFilters({ activeOnly: activeOnlyEl.checked }),
    );

    exportBtn.addEventListener("click", () => this._exportExcel());
    resetBtn.addEventListener("click", () => store.resetFilters());
    refreshBtn.addEventListener("click", () => store.loadData());
  }

  _applyState() {
    const f = store.state.filters;
    const dateEl = this.container.querySelector("#filter-date");
    const roleEl = this.container.querySelector("#filter-role");
    const qEl = this.container.querySelector("#filter-q");
    const minTotalEl = this.container.querySelector("#filter-min-total");
    const hourStartEl = this.container.querySelector("#filter-hour-start");
    const hourEndEl = this.container.querySelector("#filter-hour-end");
    const activeOnlyEl = this.container.querySelector("#filter-active-only");

    dateEl.value = f.date;
    roleEl.value = f.role;
    qEl.value = f.q;
    minTotalEl.value = f.minTotal;
    hourStartEl.value = f.hourStart;
    hourEndEl.value = f.hourEnd;
    activeOnlyEl.checked = f.activeOnly;

    // Cập nhật dropdown roles nếu có thay đổi
    if (store.state.roles.length && roleEl.options.length <= 1) {
      roleEl.innerHTML = '<option value="">Tất cả role</option>';
      store.state.roles.forEach((r) => {
        const opt = document.createElement("option");
        opt.value = r.role_key;
        opt.textContent = r.display_name || r.role_key;
        roleEl.appendChild(opt);
      });
      roleEl.value = f.role;
    }
  }

  _exportExcel() {
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
