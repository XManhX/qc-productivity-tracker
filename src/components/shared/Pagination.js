export class Pagination {
  /**
   * @param {HTMLElement} container
   * @param {Object} store - phải có: state.filters (page, pageSize), totalItems, totalPages, setPage, setFilters
   * @param {Object} options
   * @param {boolean} [options.showPageSizeDropdown] - có hiện dropdown chọn pageSize không?
   * @param {number[]} [options.pageSizeOptions] - các lựa chọn cho dropdown (mặc định [10,25,50,100])
   * @param {number} [options.windowSize] - nếu >0 sẽ hiện phân trang dạng cửa sổ, null để hiện tất cả
   */
  constructor(container, store, options = {}) {
    this.container = container;
    this.store = store;
    this.showPageSizeDropdown = options.showPageSizeDropdown ?? false;
    this.pageSizeOptions = options.pageSizeOptions ?? [10, 25, 50, 100];
    this.windowSize = options.windowSize ?? null;
    this._render();
    store.on("update", () => this._render());
  }

  _render() {
    const { filters } = this.store.state;
    const page = Number(filters.page);
    const pageSize = Number(filters.pageSize);
    const totalItems = this.store.totalItems;
    const totalPages = this.store.totalPages;

    const startItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
    const endItem = Math.min(page * pageSize, totalItems);

    let html = `
      <div class="border-t border-slate-100 bg-slate-50 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div class="text-xs text-slate-500">
          ${totalItems === 0 ? "Không có kết quả" : `Hiển thị ${startItem}–${endItem} trên ${totalItems} mục`}
        </div>
        <div class="flex items-center gap-3">
    `;

    if (this.showPageSizeDropdown) {
      html += `
        <div class="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2">
          <label class="text-sm text-slate-500 mr-2">Hiển thị</label>
          <select id="page-size-select" class="text-sm focus:outline-none bg-transparent">
            ${this.pageSizeOptions.map((opt) => `<option value="${opt}" ${opt === pageSize ? "selected" : ""}>${opt}</option>`).join("")}
          </select>
        </div>
      `;
    }

    html += `<div class="flex items-center gap-2" id="page-buttons"></div></div></div>`;
    this.container.innerHTML = html;

    // Bind page size dropdown
    const sizeSelect = this.container.querySelector("#page-size-select");
    if (sizeSelect) {
      sizeSelect.addEventListener("change", (e) => {
        this.store.setFilters({ pageSize: Number(e.target.value), page: 1 });
      });
    }

    // Nút phân trang
    const buttonsContainer = this.container.querySelector("#page-buttons");
    if (!buttonsContainer) return;
    if (totalPages <= 1) {
      buttonsContainer.innerHTML = "";
      return;
    }

    const makeBtn = (label, disabled, onClick) => {
      const btn = document.createElement("button");
      btn.className = `px-3 py-1 rounded-md text-sm font-medium ${disabled ? "bg-slate-100 text-slate-400 cursor-default" : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 transition"}`;
      btn.innerText = label;
      if (!disabled) btn.addEventListener("click", onClick);
      return btn;
    };

    buttonsContainer.appendChild(
      makeBtn("Trước", page <= 1, () => this.store.setPage(page - 1)),
    );

    let pages = [];
    if (this.windowSize && totalPages > this.windowSize) {
      let start = Math.max(1, page - Math.floor(this.windowSize / 2));
      let end = Math.min(totalPages, start + this.windowSize - 1);
      if (end - start < this.windowSize - 1)
        start = Math.max(1, end - this.windowSize + 1);
      for (let p = start; p <= end; p++) pages.push(p);
    } else {
      for (let p = 1; p <= totalPages; p++) pages.push(p);
    }

    pages.forEach((p) => {
      const btn = document.createElement("button");
      btn.className = `px-3 py-1 rounded-md text-sm font-medium transition ${p === page ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"}`;
      btn.innerText = String(p);
      if (p !== page)
        btn.addEventListener("click", () => this.store.setPage(p));
      buttonsContainer.appendChild(btn);
    });

    buttonsContainer.appendChild(
      makeBtn("Sau", page >= totalPages, () => this.store.setPage(page + 1)),
    );
  }
}
