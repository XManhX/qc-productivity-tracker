import { userStore } from "../store/UserStore.js";
import { escapeHtml } from "../utils/escapeHtml.js";
import { showToast } from "../utils/toast.js";
import { Pagination } from "./Pagination.js";

export class UserList {
  constructor(container) {
    this.container = container;
    this._render();
    this._bindEvents();
    this.pagination = new Pagination(
      this.container.querySelector("#pagination-wrapper"),
      userStore,
      {
        showPageSizeDropdown: true,
        pageSizeOptions: [10, 25, 50, 100],
        windowSize: 5,
      },
    );
    userStore.on("update", () => {
      this._updateView();
      // Pagination listens to the same event and re-renders itself
    });
    this._updateView();
  }

  _render() {
    this.container.innerHTML = `
      <div class="p-6 border-b border-slate-100 bg-slate-50/70">
        <div class="flex items-center justify-between gap-3 mb-4">
          <div class="flex items-center gap-2">
            <div class="bg-emerald-50 p-2 rounded-lg text-emerald-600"><i data-lucide="shield-check" class="w-5 h-5"></i></div>
            <div>
              <h2 class="text-lg font-bold text-slate-900">Danh Sách Allowed</h2>
              <p id="user-count-badge" class="text-slate-400 text-xs mt-0.5">0 nhân sự được ủy quyền</p>
            </div>
          </div>
          <button id="refresh-users-btn" class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-500 hover:text-slate-700 transition" title="Tải lại dữ liệu"><i data-lucide="refresh-cw" class="w-4 h-4"></i></button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div class="flex items-center justify-between"><div><p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Tổng</p><p id="summary-total" class="text-xl font-semibold text-slate-900">0</p></div><div class="rounded-xl bg-indigo-50 p-2 text-indigo-600"><i data-lucide="users" class="w-4 h-4"></i></div></div></div>
          <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div class="flex items-center justify-between"><div><p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Đang hoạt động</p><p id="summary-active" class="text-xl font-semibold text-emerald-600">0</p></div><div class="rounded-xl bg-emerald-50 p-2 text-emerald-600"><i data-lucide="check-circle-2" class="w-4 h-4"></i></div></div></div>
          <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div class="flex items-center justify-between"><div><p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Tạm khóa</p><p id="summary-inactive" class="text-xl font-semibold text-slate-600">0</p></div><div class="rounded-xl bg-slate-100 p-2 text-slate-600"><i data-lucide="pause-circle" class="w-4 h-4"></i></div></div></div>
        </div>
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label class="relative flex-1 h-11 flex items-center">
            <i data-lucide="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"></i>
            <input id="allowed-search" type="text" placeholder="Tìm theo tên hoặc email..." class="w-full h-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 leading-none" />
          </label>
          <div class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 h-11 text-sm text-slate-600">
              <i data-lucide="filter" class="w-4 h-4 text-slate-400"></i>
              <select id="allowed-status-filter" class="bg-transparent text-sm font-medium outline-none h-full">
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Đang hoạt động</option>
                <option value="inactive">Tạm khóa</option>
              </select>
            </label>
            <label class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 h-11 text-sm text-slate-600">
              <i data-lucide="user-cog" class="w-4 h-4 text-slate-400"></i>
              <select id="role-filter" class="bg-transparent text-sm font-medium outline-none h-full">
                <option value="">Tất cả vai trò</option>
              </select>
            </label>
            <button id="clear-filters-btn" class="rounded-xl border border-slate-200 bg-white px-3 h-11 text-sm font-medium text-slate-600 transition hover:bg-slate-100 flex items-center">Xóa bộ lọc</button>
          </div>
        </div>
      </div>
      <div class="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table class="w-full text-left border-collapse">
          <thead><tr class="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider font-semibold"><th class="px-6 py-3">Nhân Viên</th><th class="px-6 py-3">Email</th><th class="px-6 py-3">Vai Trò</th><th class="px-6 py-3">Trạng Thái</th><th class="px-6 py-3">Widget</th><th class="px-6 py-3">Mật khẩu</th></tr></thead>
          <tbody id="user-list-body" class="divide-y divide-slate-100 text-sm"></tbody>
        </table>
      </div>
      <div id="pagination-wrapper"></div>
    `;
    this._populateRoleFilter();
    lucide.createIcons();
  }

  _populateRoleFilter() {
    const select = this.container.querySelector("#role-filter");
    if (!select) return;
    select.innerHTML = '<option value="">Tất cả vai trò</option>';
    userStore.state.roles.forEach((role) => {
      const opt = document.createElement("option");
      opt.value = role.role_key;
      opt.textContent = role.display_name || role.role_key;
      select.appendChild(opt);
    });
  }

  _updateView() {
    this._updateSummaryCards();
    this._renderTable();
    lucide.createIcons();
  }

  _updateSummaryCards() {
    const users = userStore.state.users;
    const total = users.length;
    const active = users.filter((u) => u.is_active !== false).length;
    this.container.querySelector("#summary-total").textContent = total;
    this.container.querySelector("#summary-active").textContent = active;
    this.container.querySelector("#summary-inactive").textContent = total - active;
    const badge = this.container.querySelector("#user-count-badge");
    const filtered = userStore.filteredUsers;
    if (badge) {
      if (filtered.length === 0)
        badge.innerText = "Không có nhân sự nào phù hợp";
      else if (filtered.length === total)
        badge.innerText = `${total} nhân sự được ủy quyền`;
      else
        badge.innerText = `${filtered.length} / ${total} nhân sự phù hợp bộ lọc`;
    }
  }

  _renderTable() {
    const tbody = this.container.querySelector("#user-list-body");
    if (!tbody) return;
    const { loading, error, users, roles } = userStore.state;
    const pagedUsers = userStore.pagedUsers;
    const filteredUsers = userStore.filteredUsers;
    if (loading) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-slate-400"><div class="loading-spinner w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto"></div><span>Đang tải...</span></td></tr>`;
      return;
    }
    if (error) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-rose-500 text-center">Lỗi: ${error}</td></tr>`;
      return;
    }
    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-14 text-center text-slate-400"><i data-lucide="user-x" class="w-8 h-8 mx-auto"></i><p class="font-semibold mt-2">Chưa có nhân viên nào</p><p class="text-sm">Thêm nhân sự mới để bắt đầu.</p></td></tr>`;
      return;
    }
    if (filteredUsers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-14 text-center text-slate-400"><i data-lucide="search-x" class="w-8 h-8 mx-auto"></i><p class="font-semibold mt-2">Không tìm thấy nhân sự</p><p class="text-sm">Thử lại với bộ lọc khác.</p></td></tr>`;
      return;
    }
    tbody.innerHTML = pagedUsers
      .map((user) => {
        const isActive = user.is_active !== false;
        const widgetVisible = user.widget_visible !== false;
        const roleOptions = roles
          .map(
            (r) =>
              `<option value="${r.role_key}" ${r.role_key === user.role_key ? "selected" : ""}>${r.display_name || r.role_key}</option>`,
          )
          .join("");
        return `
      <tr class="hover:bg-slate-50/50 transition">
        <td class="px-6 py-4"><input id="inline-name-${user.id}" value="${escapeHtml(user.name || "")}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-500" data-user-id="${user.id}" data-field="name" /></td>
        <td class="px-6 py-4"><input id="inline-email-${user.id}" value="${escapeHtml(user.email)}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-500" data-user-id="${user.id}" data-field="email" /></td>
        <td class="px-6 py-4"><select id="inline-role-${user.id}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-500" data-user-id="${user.id}" data-field="role">${roleOptions}</select></td>
        <td class="px-6 py-4">
          <button data-user-id="${user.id}" data-action="toggle-status" data-active="${isActive}" class="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-slate-200/70 transition ${isActive ? "bg-emerald-500" : "bg-slate-300"}">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition ${isActive ? "translate-x-5" : "translate-x-0.5"}"></span>
          </button>
          <span class="ml-2 text-xs font-semibold ${isActive ? "text-emerald-700" : "text-slate-500"}">${isActive ? "Active" : "Khóa"}</span>
        </td>
        <td class="px-6 py-4">
          <button data-user-id="${user.id}" data-action="toggle-widget" data-visible="${widgetVisible}" class="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-slate-200/70 transition ${widgetVisible ? "bg-indigo-500" : "bg-slate-300"}">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition ${widgetVisible ? "translate-x-5" : "translate-x-0.5"}"></span>
          </button>
          <span class="ml-2 text-xs font-semibold ${widgetVisible ? "text-indigo-700" : "text-slate-500"}">${widgetVisible ? "Hiện" : "Ẩn"}</span>
        </td>
        <td class="px-6 py-4 text-center">
          ${user.has_password ? '<i data-lucide="lock" class="w-4 h-4 text-emerald-500 inline-block" title="Đã đặt mật khẩu"></i>' : '<i data-lucide="unlock" class="w-4 h-4 text-slate-300 inline-block" title="Chưa có mật khẩu"></i>'}
        </td>
      </tr>`;
      })
      .join("");
  }

  _bindEvents() {
    this.container
      .querySelector("#allowed-search")
      .addEventListener("input", (e) =>
        userStore.setFilters({ searchQuery: e.target.value }),
      );
    this.container
      .querySelector("#allowed-status-filter")
      .addEventListener("change", (e) =>
        userStore.setFilters({ statusFilter: e.target.value }),
      );
    this.container
      .querySelector("#role-filter")
      .addEventListener("change", (e) =>
        userStore.setFilters({ roleFilter: e.target.value }),
      );
    this.container
      .querySelector("#clear-filters-btn")
      .addEventListener("click", () => {
        this.container.querySelector("#allowed-search").value = "";
        this.container.querySelector("#allowed-status-filter").value = "all";
        this.container.querySelector("#role-filter").value = "";
        userStore.resetFilters();
      });
    this.container
      .querySelector("#refresh-users-btn")
      .addEventListener("click", () => userStore.loadUsers());

    const tbody = this.container.querySelector("#user-list-body");
    tbody.addEventListener(
      "blur",
      async (e) => {
        const el = e.target;
        if (
          el.dataset.userId &&
          (el.dataset.field === "name" || el.dataset.field === "email")
        ) {
          await this._saveInline(Number(el.dataset.userId));
        }
      },
      true,
    );
    tbody.addEventListener("change", async (e) => {
      if (e.target.dataset.userId && e.target.dataset.field === "role") {
        await this._saveInline(Number(e.target.dataset.userId));
      }
    });
    tbody.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn?.dataset.userId) return;
      const id = Number(btn.dataset.userId);
      if (btn.dataset.action === "toggle-status") {
        const isActive = btn.dataset.active === "true";
        const result = await userStore.updateUser(id, { is_active: !isActive });
        showToast(
          result.success ? "Đã cập nhật trạng thái" : `Lỗi: ${result.message}`,
          result.success ? "success" : "error",
        );
      } else if (btn.dataset.action === "toggle-widget") {
        const visible = btn.dataset.visible === "true";
        const result = await userStore.updateUser(id, {
          widget_visible: !visible,
        });
        showToast(
          result.success ? "Đã cập nhật widget" : `Lỗi: ${result.message}`,
          result.success ? "success" : "error",
        );
      }
    });
  }

  async _saveInline(userId) {
    const nameEl = this.container.querySelector(`#inline-name-${userId}`);
    const emailEl = this.container.querySelector(`#inline-email-${userId}`);
    const roleEl = this.container.querySelector(`#inline-role-${userId}`);
    if (!nameEl || !emailEl || !roleEl) return;
    const name = nameEl.value.trim();
    const email = emailEl.value.trim();
    if (!email) return showToast("Email không được để trống", "error");
    const result = await userStore.updateUser(userId, {
      name,
      email,
      role_key: roleEl.value,
    });
    if (result.success) showToast("✅ Đã lưu thay đổi");
    else showToast(`Lỗi: ${result.message}`, "error");
  }
}