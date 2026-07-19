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

    const startItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
    const endItem = Math.min(page * pageSize, totalItems);

    this.container.innerHTML = `
      <div class="border-t border-slate-100 bg-slate-50 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div class="text-xs text-slate-500">
          ${totalItems === 0 ? "Không có kết quả" : `Hiển thị ${startItem}–${endItem} trên ${totalItems} mục`}
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2">
            <label class="text-sm text-slate-500 mr-2">Hiển thị</label>
            <select id="filter-page-size" class="text-sm focus:outline-none bg-transparent">
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

    // Xử lý change page size
    this.container
      .querySelector("#filter-page-size")
      .addEventListener("change", (e) => {
        store.setFilters({ pageSize: e.target.value, page: 1 });
      });

    // Xử lý các nút phân trang
    const controls = this.container.querySelector("#pagination-controls");
    if (totalPages <= 1) {
      controls.innerHTML = "";
      return;
    }

    const makeBtn = (label, disabled, onClick) => {
      const btn = document.createElement("button");
      btn.className = `px-3 py-1 rounded-md text-sm font-medium ${
        disabled
          ? "bg-slate-100 text-slate-400 cursor-default"
          : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 transition"
      }`;
      btn.innerText = label;
      if (!disabled) btn.addEventListener("click", onClick);
      return btn;
    };

    // Nút Trước
    controls.appendChild(
      makeBtn("Trước", page <= 1, () => store.setPage(page - 1)),
    );

    // Cửa sổ số trang (window = 5)
    const windowSize = 5;
    let startPage = Math.max(1, page - Math.floor(windowSize / 2));
    let endPage = Math.min(totalPages, startPage + windowSize - 1);
    if (endPage - startPage < windowSize - 1) {
      startPage = Math.max(1, endPage - windowSize + 1);
    }

    for (let p = startPage; p <= endPage; p++) {
      const btn = document.createElement("button");
      btn.className = `px-3 py-1 rounded-md text-sm font-medium transition ${
        p === page
          ? "bg-indigo-600 text-white shadow-sm"
          : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"
      }`;
      btn.innerText = String(p);
      if (p !== page) btn.addEventListener("click", () => store.setPage(p));
      controls.appendChild(btn);
    }

    // Nút Sau
    controls.appendChild(
      makeBtn("Sau", page >= totalPages, () => store.setPage(page + 1)),
    );
  }
}
