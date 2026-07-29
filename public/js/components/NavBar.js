// public/js/components/NavBar.js
import { fetchMe } from '../services/api.js';

export class NavBar {
  /**
   * @param {HTMLElement} container - phần tử chứa navigation
   * @param {string} [currentPage] - 'dashboard' | 'users' | 'targets' | 'alert-config' | 'assignments'
   */
  constructor(container, currentPage = null) {
    this.container = container;
    this.currentPage = currentPage || this._detectPage();
    this.user = null;
    this._render();
    if (typeof lucide !== 'undefined') lucide.createIcons();
    this._initUser();
  }

  formatDisplayName(fullName) {
    if (!fullName || typeof fullName !== 'string') return '';
    const parts = fullName.trim().split(/\s+/); // tách theo khoảng trắng
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0]; // chỉ có 1 từ thì giữ nguyên

    const lastName = parts[parts.length - 1]; // tên
    const initials = parts
      .slice(0, -1) // họ + đệm
      .map(word => word.charAt(0).toUpperCase())
      .join('');

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
      .map((p) => {
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
              <!-- Khu vực user menu sẽ được cập nhật sau khi fetchMe hoàn tất -->
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
      this.user = await fetchMe();
      this._updateUserUI();
    } catch (err) {
      console.error('Không thể lấy thông tin người dùng:', err);
      // Token không hợp lệ hoặc hết hạn -> đăng xuất
      this._handleLogout();
    }
  }

  _updateUserUI() {
    if (!this.user) return;
    const userArea = this.container.querySelector('#user-menu-area');
    if (!userArea) return;

    // Chuẩn bị dữ liệu hiển thị
    const displayName = this.formatDisplayName(this.user.name) || this.user.email; // fallback email nếu không có tên
    const initials = (displayName || '?')[0].toUpperCase();
    const fullName = this.user.name || this.user.email;
    const email = this.user.email;

    userArea.innerHTML = `
      <div class="relative ml-3">
        <button id="user-menu-btn" class="flex items-center text-sm rounded-full pr-2 focus:outline-none focus:ring-2 focus:ring-amber-400 transition">
          <span class="sr-only">Mở menu người dùng</span>
          <div class="h-8 w-8 rounded-full bg-amber-500 flex items-center justify-center text-slate-900 font-bold text-sm">${initials}</div>
          <span class="ml-2 text-slate-300 text-sm hidden md:block">${displayName}</span>   <!-- hiển thị tên rút gọn -->
        </button>
        <div id="user-dropdown" class="hidden absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 z-50 border border-slate-200">
          <div class="px-4 py-3 border-b border-slate-100">
            <p class="text-sm font-medium text-slate-900">${fullName}</p>    <!-- tên đầy đủ -->
            <p class="text-xs text-slate-500 truncate">${email}</p>          <!-- vẫn hiển thị email phía dưới -->
          </div>
          <button id="logout-btn" class="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 rounded-b-xl transition">
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

    logoutBtn.addEventListener('click', () => {
      this._handleLogout();
    });

    window.addEventListener('click', (e) => {
      if (!menuBtn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });
  }

  _handleLogout() {
    localStorage.removeItem('qc_session_token');
    // Có thể gọi API logout nếu có (không bắt buộc)
    // Chuyển về trang đăng nhập
    window.location.href = '/login.html';
  }
}