export class Pagination {
  /**
   * @param {HTMLElement} container - nơi render pagination
   * @param {Object} options
   * @param {number} options.page - trang hiện tại
   * @param {number} options.totalPages - tổng số trang
   * @param {number} options.totalItems - tổng số mục (để hiển thị thông tin)
   * @param {number} [options.pageSize] - số dòng mỗi trang (nếu có sẽ hiện dropdown)
   * @param {number[]} [options.pageSizeOptions] - các lựa chọn cho dropdown
   * @param {Function} options.onPageChange - callback khi đổi trang, nhận (newPage)
   * @param {Function} [options.onPageSizeChange] - callback khi đổi page size, nhận (newSize)
   * @param {number} [options.windowSize] - số nút trang hiển thị tối đa (mặc định null = hiển thị tất cả)
   */
  constructor(container, options) {
    this.container = container;
    this.options = options;
    this._render();
  }

  /** Cập nhật lại pagination khi state thay đổi (gọi từ bên ngoài) */
  refresh(options) {
    Object.assign(this.options, options);
    this._render();
  }

  _render() {
    const {
      page,
      totalPages,
      totalItems,
      pageSize,
      pageSizeOptions,
      onPageChange,
      onPageSizeChange,
      windowSize,
    } = this.options;
    const startItem = totalItems === 0 ? 0 : (page - 1) * (pageSize || 0) + 1;
    const endItem = Math.min(page * (pageSize || 0), totalItems);

    let html = `
      <div class="border-t border-slate-100 bg-slate-50 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div class="text-xs text-slate-500">
          ${totalItems === 0 ? "Không có kết quả" : `Hiển thị ${startItem}–${endItem} trên ${totalItems} mục`}
        </div>
        <div class="flex items-center gap-3">
    `;

    // Dropdown chọn page size (chỉ khi có onPageSizeChange và pageSizeOptions)
    if (onPageSizeChange && pageSizeOptions && pageSize) {
      html += `
        <div class="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2">
          <label class="text-sm text-slate-500 mr-2">Hiển thị</label>
          <select id="page-size-select" class="text-sm focus:outline-none bg-transparent">
            ${pageSizeOptions.map((opt) => `<option value="${opt}" ${opt === pageSize ? "selected" : ""}>${opt}</option>`).join("")}
          </select>
        </div>
      `;
    }

    html += `<div class="flex items-center gap-2" id="page-buttons"></div></div></div>`;
    this.container.innerHTML = html;

    // Bind sự kiện dropdown
    const sizeSelect = this.container.querySelector("#page-size-select");
    if (sizeSelect) {
      sizeSelect.addEventListener("change", (e) =>
        onPageSizeChange(Number(e.target.value)),
      );
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

    // Nút Trước
    buttonsContainer.appendChild(
      makeBtn("Trước", page <= 1, () => onPageChange(page - 1)),
    );

    // Tính toán các trang sẽ hiển thị
    let pages = [];
    if (windowSize && totalPages > windowSize) {
      let start = Math.max(1, page - Math.floor(windowSize / 2));
      let end = Math.min(totalPages, start + windowSize - 1);
      if (end - start < windowSize - 1)
        start = Math.max(1, end - windowSize + 1);
      for (let p = start; p <= end; p++) pages.push(p);
    } else {
      for (let p = 1; p <= totalPages; p++) pages.push(p);
    }

    pages.forEach((p) => {
      const btn = document.createElement("button");
      btn.className = `px-3 py-1 rounded-md text-sm font-medium transition ${p === page ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"}`;
      btn.innerText = String(p);
      if (p !== page) btn.addEventListener("click", () => onPageChange(p));
      buttonsContainer.appendChild(btn);
    });

    // Nút Sau
    buttonsContainer.appendChild(
      makeBtn("Sau", page >= totalPages, () => onPageChange(page + 1)),
    );
  }
}
