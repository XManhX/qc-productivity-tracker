export class NavBar {
  /**
   * @param {HTMLElement} container - phần tử chứa navigation
   * @param {string} [currentPage] - 'dashboard' | 'users' | 'targets' (nếu không truyền sẽ tự detect từ URL)
   */
  constructor(container, currentPage = null) {
    this.container = container;
    this.currentPage = currentPage || this._detectPage();
    this._render();
    // Gọi lucide.createIcons() sau khi HTML đã được chèn vào DOM
    if (typeof lucide !== "undefined") lucide.createIcons();
  }

  _detectPage() {
    const path = window.location.pathname;
    if (path.endsWith("/users.html") || path.endsWith("/users")) return "users";
    if (path.endsWith("/targets.html") || path.endsWith("/targets"))
      return "targets";
    return "dashboard"; // mặc định
  }

  _render() {
    const pages = [
      { key: "dashboard", href: "/", icon: "bar-chart-3", label: "Dashboard" },
      { key: "users", href: "/users.html", icon: "users", label: "Nhân Sự" },
      {
        key: "targets",
        href: "/targets.html",
        icon: "target",
        label: "Roles & Targets",
      },
    ];

    const linksHtml = pages
      .map((p) => {
        const isActive = this.currentPage === p.key;
        const activeClass = isActive
          ? "bg-slate-800 text-amber-400 border border-slate-700"
          : "text-slate-300 hover:bg-slate-800 hover:text-white transition";
        return `
        <a href="${p.href}" class="flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium ${activeClass}">
          <i data-lucide="${p.icon}" class="w-4 h-4"></i>
          <span>${p.label}</span>
        </a>
      `;
      })
      .join("");

    this.container.innerHTML = `
      <nav class="bg-slate-900 border-b border-slate-800 sticky top-0 z-50 shadow-md">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-between h-16">
            <div class="flex items-center space-x-3">
              <div class="bg-amber-500 text-slate-950 p-2 rounded-lg flex items-center justify-center shadow-inner">
                <i data-lucide="zap" class="w-5 h-5"></i>
              </div>
              <span class="text-white font-bold text-lg tracking-wider">WMS QC MONITOR</span>
            </div>
            <div class="flex space-x-1">
              ${linksHtml}
            </div>
          </div>
        </div>
      </nav>
    `;
  }
}
