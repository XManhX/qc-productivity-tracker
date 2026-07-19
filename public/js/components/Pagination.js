import { store } from "../store/DashboardStore.js";

export class Pagination {
  constructor(container) {
    this.container = container;
    store.on("update", () => this._render());
    this._render();
  }

  _render() {
    const { filters, total } = store.state;
    const page = filters.page;
    const pageSize = Number(filters.pageSize);
    const totalItems = total;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    this.container.innerHTML = `
      <div class="px-4 py-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
        <div class="text-sm text-slate-600">
          Hiển thị <span id="page-info">${Math.min((page - 1) * pageSize + 1, totalItems)} - ${Math.min(page * pageSize, totalItems)} / ${totalItems}</span>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2">
            <label class="text-sm text-slate-500 mr-2">Hiển thị</label>
            <select id="filter-page-size" class="text-sm focus:outline-none">
              <option value="10" ${pageSize === 10 ? "selected" : ""}>10</option>
              <option value="25" ${pageSize === 25 ? "selected" : ""}>25</option>
              <option value="50" ${pageSize === 50 ? "selected" : ""}>50</option>
              <option value="100" ${pageSize === 100 ? "selected" : ""}>100</option>
            </select>
          </div>
          <div class="flex items-center gap-2" id="pagination-controls"></div>
        </div>
      </div>
    `;

    // Page size change
    this.container
      .querySelector("#filter-page-size")
      .addEventListener("change", (e) => {
        store.setFilters({ pageSize: e.target.value, page: 1 });
      });

    // Pagination buttons
    const controls = this.container.querySelector("#pagination-controls");
    controls.innerHTML = "";
    const makeBtn = (label, disabled, onClick) => {
      const btn = document.createElement("button");
      btn.className = `px-3 py-1 rounded-md text-sm ${disabled ? "bg-slate-100 text-slate-400" : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"}`;
      btn.innerText = label;
      if (!disabled) btn.addEventListener("click", onClick);
      return btn;
    };

    controls.appendChild(
      makeBtn("Prev", page <= 1, () => store.setPage(page - 1)),
    );

    const windowSize = 5;
    let start = Math.max(1, page - Math.floor(windowSize / 2));
    let end = Math.min(totalPages, start + windowSize - 1);
    if (end - start < windowSize - 1) start = Math.max(1, end - windowSize + 1);

    for (let p = start; p <= end; p++) {
      const btn = document.createElement("button");
      btn.className = `px-3 py-1 rounded-md text-sm ${p === page ? "bg-emerald-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"}`;
      btn.innerText = String(p);
      if (p !== page) btn.addEventListener("click", () => store.setPage(p));
      controls.appendChild(btn);
    }

    controls.appendChild(
      makeBtn("Next", page >= totalPages, () => store.setPage(page + 1)),
    );
  }
}
