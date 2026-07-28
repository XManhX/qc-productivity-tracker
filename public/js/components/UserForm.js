import { userStore } from "../store/UserStore.js";
import { showToast } from "../utils/toast.js";

export class UserForm {
  constructor(container) {
    this.container = container;
    this._render();
    this._bindEvents();
    userStore.on("update", () => this._updateRoleOptions());
  }

  _render() {
    this.container.innerHTML = `
      <div class="flex items-center gap-2 mb-4">
        <div class="bg-indigo-50 p-2 rounded-lg text-indigo-600"><i data-lucide="user-plus" class="w-5 h-5"></i></div>
        <h2 class="text-lg font-bold text-slate-900">Thêm Nhân Sự Mới</h2>
      </div>
      <hr class="border-slate-100 mb-4" />
      <form id="single-user-form" class="space-y-4">
        <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Thêm Từng Người</h3>
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">Họ và tên</label>
          <input type="text" id="user-name" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition" placeholder="Ví dụ: Nguyễn Văn A" required />
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">Email Shopee WMS</label>
          <input type="email" id="user-email" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition" placeholder="nguyenvana@shopee.com" required />
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">Mật khẩu (tuỳ chọn, ít nhất 6 ký tự)</label>
          <div class="relative">
            <input type="password" id="user-password" placeholder="Ít nhất 6 ký tự" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm pr-10 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition">
            <button type="button" id="toggle-password-visibility" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <i data-lucide="eye" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">Vai trò (Role)</label>
          <select id="user-role" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition"></select>
        </div>
        <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm py-2.5 rounded-xl transition shadow-sm">Cấp Quyền Truy Cập</button>
      </form>
    `;
    this._updateRoleOptions();
    lucide.createIcons();
  }

  _updateRoleOptions() {
    const select = this.container.querySelector("#user-role");
    if (!select) return;
    select.innerHTML = "";
    userStore.state.roles.forEach((role) => {
      const opt = document.createElement("option");
      opt.value = role.role_key;
      opt.textContent = role.display_name || role.role_key;
      select.appendChild(opt);
    });
  }

  _bindEvents() {
    // Toggle password visibility
    const passwordInput = this.container.querySelector('#user-password');
    const toggleBtn = this.container.querySelector('#toggle-password-visibility');
    toggleBtn.addEventListener('click', () => {
      const isPassword = passwordInput.getAttribute('type') === 'password';
      passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
      toggleBtn.innerHTML = isPassword
        ? '<i data-lucide="eye-off" class="w-4 h-4"></i>'
        : '<i data-lucide="eye" class="w-4 h-4"></i>';
      lucide.createIcons();
    });

    const form = this.container.querySelector("#single-user-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = form.querySelector("#user-name").value.trim();
      const email = form.querySelector("#user-email").value.trim();
      const password = passwordInput.value.trim();
      const role_key = form.querySelector("#user-role").value;
      if (!email) return showToast("Vui lòng nhập email", "error");
      if (password && password.length < 6) {
        showToast('Mật khẩu phải có ít nhất 6 ký tự', 'error');
        return;
      }

      const result = await userStore.addUser({ name, email, role_key, password: password || undefined });
      if (result.success) {
        form.reset();
        showToast("✅ Đã thêm thành công");
      } else {
        showToast(`❌ ${result.message}`, "error");
      }
    });
  }
}
