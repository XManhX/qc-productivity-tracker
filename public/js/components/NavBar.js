import userSession from '../services/userSession.js';

export class NavBar {
  constructor(container, currentPage = null) {
    this.container = container;
    this.currentPage = currentPage || this._detectPage();
    this.user = null;
    this._unsubscribe = null;
    this._render();
    if (typeof lucide !== 'undefined') lucide.createIcons();
    this._initUser();
  }

  formatDisplayName(fullName) {
    if (!fullName || typeof fullName !== 'string') return '';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    const lastName = parts[parts.length - 1];
    const initials = parts.slice(0, -1).map(w => w.charAt(0).toUpperCase()).join('');
    return `${initials} ${lastName}`;
  }

  _detectPage() {
    const path = window.location.pathname;
    if (path.endsWith('/users.html') || path.endsWith('/users')) return 'users';
    if (path.endsWith('/targets.html') || path.endsWith('/targets')) return 'targets';
    if (path.endsWith('/assignments.html') || path.endsWith('/assignments')) return 'assignments';
    if (path.endsWith('/alert-config.html') || path.endsWith('/alert-config')) return 'alert-config';
    return 'dashboard';
  }

  _render() {
    const pages = [
      { key: 'dashboard', href: '/', icon: 'bar-chart-3', label: 'Dashboard' },
      { key: 'users', href: '/users.html', icon: 'users', label: 'Nhân Sự' },
      { key: 'targets', href: '/targets.html', icon: 'target', label: 'Roles & Targets' },
      { key: 'assignments', href: '/assignments.html', icon: 'clipboard-list', label: 'Phân công' },
      { key: 'alert-config', href: '/alert-config.html', icon: 'bell-ring', label: 'Cấu hình Alert' }
    ];

    const linksHtml = pages
      .map(p => {
        const isActive = this.currentPage === p.key;
        const activeClass = isActive
          ? 'bg-slate-800 text-amber-400 border border-slate-700'
          : 'text-slate-300 hover:bg-slate-800 hover:text-white transition';
        return `
        <a href="${p.href}" class="flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium ${activeClass}">
          <i data-lucide="${p.icon}" class="w-4 h-4"></i>
          <span>${p.label}</span>
        </a>`;
      })
      .join('');

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
            <div class="flex items-center space-x-1">
              ${linksHtml}
              <div id="user-menu-area" class="ml-4 relative">
                <div class="h-8 w-8 rounded-full bg-slate-700 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      </nav>
    `;
  }

  async _initUser() {
    try {
      this.user = await userSession.getUser();
      this._updateUserUI();
    } catch (err) {
      console.error('Không thể lấy thông tin người dùng:', err);
    }

    this._unsubscribe = userSession.onUserLoaded((user) => {
      this.user = user;
      this._updateUserUI();
    });
  }

  _updateUserUI() {
    if (!this.user) return;
    const userArea = this.container.querySelector('#user-menu-area');
    if (!userArea) return;

    const displayName = this.formatDisplayName(this.user.name) || this.user.email;
    const initials = (displayName || '?')[0].toUpperCase();
    const fullName = this.user.name || this.user.email;
    const email = this.user.email;
    const isAdmin = this.user.role_key === 'admin';

    userArea.innerHTML = `
      <div class="relative ml-3">
        <button id="user-menu-btn" class="group flex items-center text-sm rounded-full pr-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 transition overflow-visible">
          <span class="sr-only">Mở menu người dùng</span>
          
          <!-- Avatar -->
          <div class="relative h-8 w-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-900 font-bold text-sm shadow-md
            group-hover:shadow-lg
            group-hover:ring-2 group-hover:ring-amber-400/60
            transition-all duration-200">
            ${initials}
            ${isAdmin ? `
            <!-- Badge admin -->
            <span class="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-gradient-to-br from-yellow-300 to-amber-400 text-slate-900 rounded-full flex items-center justify-center border-2 border-slate-900 shadow-sm" title="Quản trị viên">
              <i data-lucide="key" class="w-2.5 h-2.5 stroke-[2.5]"></i>
            </span>` : ''}
          </div>
          
          <span class="ml-2.5 text-slate-300 text-sm hidden md:block group-hover:text-white transition-colors">${displayName}</span>
        </button>
        
        <!-- Dropdown -->
        <div id="user-dropdown" class="hidden absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 z-50 border border-slate-200 overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-100">
            <p class="text-sm font-medium text-slate-900 flex items-center gap-1">
              ${fullName}
              ${isAdmin ? '<i data-lucide="key" class="w-3.5 h-3.5 text-amber-500 ml-1" title="Quản trị viên"></i>' : ''}
            </p>
            <p class="text-xs text-slate-500 truncate mt-0.5">${email}</p>
          </div>
          <button id="logout-btn" class="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors">
            <i data-lucide="log-out" class="w-4 h-4"></i>
            Đăng xuất
          </button>
        </div>
      </div>
    `;

    if (typeof lucide !== 'undefined') lucide.createIcons();

    const menuBtn = userArea.querySelector('#user-menu-btn');
    const dropdown = userArea.querySelector('#user-dropdown');
    const logoutBtn = userArea.querySelector('#logout-btn');

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
    });

    logoutBtn.addEventListener('click', () => this._handleLogout());

    window.addEventListener('click', (e) => {
      if (!menuBtn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });
  }

  _handleLogout() {
    localStorage.removeItem('qc_session_token');
    userSession.clear();
    window.location.href = '/login.html';
  }

  destroy() {
    if (this._unsubscribe) this._unsubscribe();
  }
}