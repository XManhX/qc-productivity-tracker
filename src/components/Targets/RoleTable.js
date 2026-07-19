import { targetStore } from "../../store/TargetStore.js";
import { showToast } from "../../utils/toast.js";
import { escapeHtml } from "../../utils/escapeHtml.js";

export class RoleTable {
  constructor(container) {
    this.container = container;
    this._render();
    this._bindEvents();
    targetStore.on("update", () => this._updateView());
    this._updateView();
  }

  _render() {
    this.container.innerHTML = `
      <div class="p-6 border-b border-slate-100 bg-slate-50/70">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="bg-purple-50 p-2 rounded-lg text-purple-600"><i data-lucide="user-cog" class="w-5 h-5"></i></div>
            <h2 class="text-lg font-bold text-slate-900">Quản Lý Vai Trò (Roles)</h2>
          </div>
          <button id="add-role-btn" class="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition shadow-sm flex items-center gap-1">
            <i data-lucide="plus" class="w-4 h-4"></i> Thêm Role
          </button>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead><tr class="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider font-semibold"><th class="px-6 py-3">Role Key</th><th class="px-6 py-3">Tên Hiển Thị</th><th class="px-6 py-3">Trạng Thái</th><th class="px-6 py-3"></th></tr></thead>
          <tbody id="roles-tbody" class="divide-y divide-slate-100 text-sm"></tbody>
        </table>
      </div>
      <!-- Modal -->
      <div id="role-modal" class="fixed inset-0 bg-black bg-opacity-40 items-center justify-center z-50 hidden flex">
        <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
          <h3 id="modal-title" class="text-lg font-bold mb-4">Thêm Role Mới</h3>
          <div class="space-y-4">
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Role Key</label><input id="modal-role-key" type="text" class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="qc_xxx" /></div>
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Tên Hiển Thị</label><input id="modal-display-name" type="text" class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="QC RR" /></div>
            <div class="flex justify-end gap-2">
              <button id="modal-cancel" class="px-4 py-2 text-sm border border-slate-200 rounded-xl">Hủy</button>
              <button id="modal-save" class="px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl">Lưu</button>
            </div>
          </div>
        </div>
      </div>
    `;
    lucide.createIcons();
  }

  _bindEvents() {
    const modal = this.container.querySelector("#role-modal");
    this.container
      .querySelector("#add-role-btn")
      .addEventListener("click", () => {
        modal.querySelector("#modal-title").textContent = "Thêm Role Mới";
        modal.querySelector("#modal-role-key").value = "";
        modal.querySelector("#modal-display-name").value = "";
        modal.classList.remove("hidden");
      });
    this.container
      .querySelector("#modal-cancel")
      .addEventListener("click", () => modal.classList.add("hidden"));
    this.container
      .querySelector("#modal-save")
      .addEventListener("click", async () => {
        const role_key = modal.querySelector("#modal-role-key").value.trim();
        const display_name = modal
          .querySelector("#modal-display-name")
          .value.trim();
        if (!role_key)
          return showToast("Role key không được để trống", "error");
        const result = await targetStore.addRole({ role_key, display_name });
        if (result.success) {
          modal.classList.add("hidden");
          showToast("Đã thêm role mới");
        } else {
          showToast(`Lỗi: ${result.message}`, "error");
        }
      });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });

    // Xử lý trên bảng
    const tbody = this.container.querySelector("#roles-tbody");
    tbody.addEventListener(
      "blur",
      async (e) => {
        if (e.target.dataset.field === "displayName") {
          const id = Number(e.target.dataset.id);
          const name = e.target.value.trim();
          if (name) {
            const res = await targetStore.updateRole(id, {
              display_name: name,
            });
            if (res.success) showToast("Đã cập nhật tên");
            else showToast(`Lỗi: ${res.message}`, "error");
          }
        }
      },
      true,
    );
    tbody.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const id = Number(btn.dataset.id);
      if (btn.dataset.action === "toggle-active") {
        const isActive = btn.dataset.active === "true";
        await targetStore.updateRole(id, { is_active: !isActive });
      } else if (btn.dataset.action === "delete") {
        if (!confirm("Xóa role này?")) return;
        const res = await targetStore.removeRole(id);
        showToast(
          res.success ? "Đã xóa" : `Lỗi: ${res.message}`,
          res.success ? "success" : "error",
        );
      }
    });
  }

  _updateView() {
    const tbody = this.container.querySelector("#roles-tbody");
    const { loading, error, roles } = targetStore.state;
    if (loading) {
      tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-center">Đang tải...</td></tr>`;
      return;
    }
    if (error) {
      tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-rose-500">Lỗi: ${error}</td></tr>`;
      return;
    }
    if (!roles.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-center text-slate-400">Chưa có role</td></tr>`;
      return;
    }
    tbody.innerHTML = roles
      .map(
        (r) => `
      <tr>
        <td class="px-6 py-4 font-medium">${escapeHtml(r.role_key)}</td>
        <td class="px-6 py-4"><input data-field="displayName" data-id="${r.id}" value="${escapeHtml(r.display_name || "")}" class="w-full bg-transparent border-0 text-sm outline-none" /></td>
        <td class="px-6 py-4">
          <button data-action="toggle-active" data-id="${r.id}" data-active="${r.is_active}" class="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-slate-200/70 transition ${r.is_active ? "bg-emerald-500" : "bg-slate-300"}">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition ${r.is_active ? "translate-x-5" : "translate-x-0.5"}"></span>
          </button>
          <span class="ml-2 text-xs font-semibold ${r.is_active ? "text-emerald-700" : "text-slate-500"}">${r.is_active ? "Active" : "Khóa"}</span>
        </td>
        <td class="px-6 py-4 text-right"><button data-action="delete" data-id="${r.id}" class="text-rose-500 hover:underline text-xs">Xóa</button></td>
      </tr>
    `,
      )
      .join("");
    lucide.createIcons();
  }
}
