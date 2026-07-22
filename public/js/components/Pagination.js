export class Pagination {
  constructor(container, store, options = {}) {
    this.container = container;
    this.store = store;
    this.options = {
      showPageSizeDropdown: false,
      pageSizeOptions: [10, 25, 50, 100],
      windowSize: 5,
      ...options,
    };
    this.refresh();
  }

  refresh(data) {
    const page = data ? data.page : this.store.currentPage;
    const totalPages = data ? data.totalPages : this.store.totalPages;
    const totalItems = data ? data.totalItems : this.store.totalFiltered;

    if (!this.container) return;
    this.container.innerHTML = this._buildHTML(page, totalPages, totalItems);
    this._bindEvents();
  }

  _buildHTML(page, totalPages, totalItems) {
    const windowSize = this.options.windowSize;
    let pages = [];
    if (totalPages <= windowSize + 4) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      let start = Math.max(2, page - Math.floor(windowSize / 2));
      let end = Math.min(totalPages - 1, start + windowSize - 1);
      if (end - start < windowSize) start = Math.max(2, end - windowSize + 1);
      if (start > 2) pages.push("...");
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push("...");
      pages.push(totalPages);
    }

    const pageItems = pages
      .map((p) => {
        if (p === "...")
          return `<span class="px-2 py-1 text-slate-400">...</span>`;
        const active =
          p === page
            ? "bg-indigo-600 text-white"
            : "bg-white text-slate-700 hover:bg-slate-100";
        return `<button data-page="${p}" class="w-8 h-8 rounded-lg text-sm font-medium ${active} transition">${p}</button>`;
      })
      .join("");

    const pageSizeDropdown = this.options.showPageSizeDropdown
      ? `
      <select id="page-size-select" class="ml-3 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm">
        ${this.options.pageSizeOptions.map((s) => `<option value="${s}" ${s === this.store.state.filters.pageSize ? "selected" : ""}>${s}</option>`).join("")}
      </select>`
      : "";

    return `
      <div class="flex items-center justify-between p-4 border-t border-slate-100">
        <span class="text-sm text-slate-500">Tổng: ${totalItems} nhân sự</span>
        <div class="flex items-center gap-1">
          <button data-page="prev" ${page === 1 ? "disabled" : ""} class="w-8 h-8 rounded-lg bg-white text-slate-700 hover:bg-slate-100 transition disabled:opacity-40"><i data-lucide="chevron-left" class="w-4 h-4"></i></button>
          ${pageItems}
          <button data-page="next" ${page === totalPages ? "disabled" : ""} class="w-8 h-8 rounded-lg bg-white text-slate-700 hover:bg-slate-100 transition disabled:opacity-40"><i data-lucide="chevron-right" class="w-4 h-4"></i></button>
          ${pageSizeDropdown}
        </div>
      </div>
    `;
  }

  _bindEvents() {
    lucide.createIcons();
    this.container.querySelectorAll("button[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.page;
        if (val === "prev") this.store.setPage(this.store.currentPage - 1);
        else if (val === "next") this.store.setPage(this.store.currentPage + 1);
        else this.store.setPage(Number(val));
      });
    });
    const ps = this.container.querySelector("#page-size-select");
    if (ps) {
      ps.addEventListener("change", (e) => {
        this.store.setFilters({ pageSize: Number(e.target.value), page: 1 });
      });
    }
  }
}
