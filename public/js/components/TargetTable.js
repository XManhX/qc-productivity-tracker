import { targetStore } from "../store/TargetStore.js";
import { showToast } from "../utils/toast.js";

export class TargetTable {
  constructor(container) {
    this.container = container;
    this._render();
    targetStore.on("update", () => this._updateView());
    this._updateView();
  }

  _render() {
    this.container.innerHTML = `
      <div class="p-6 border-b border-slate-100 bg-slate-50/70">
        <div class="flex items-center gap-2">
          <div class="bg-amber-50 p-2 rounded-lg text-amber-600"><i data-lucide="target" class="w-5 h-5"></i></div>
          <div>
            <h2 class="text-lg font-bold text-slate-900">Ngưỡng Năng Suất (Targets)</h2>
            <p class="text-xs text-slate-400 mt-0.5">Cài đặt low_threshold (<span class="text-red-500">thấp</span>) và medium_threshold (<span class="text-green-500">tốt</span>) cho từng role.</p>
          </div>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead><tr class="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider font-semibold"><th class="px-6 py-3">Role</th><th class="px-6 py-3">Low Threshold</th><th class="px-6 py-3">Medium Threshold</th><th class="px-6 py-3"></th></tr></thead>
          <tbody id="targets-tbody" class="divide-y divide-slate-100 text-sm"></tbody>
        </table>
      </div>
    `;
    lucide.createIcons();
    this._bindEvents();
  }

  _bindEvents() {
    this.container
      .querySelector("#targets-tbody")
      .addEventListener("click", async (e) => {
        const btn = e.target.closest('button[data-action="save-target"]');
        if (!btn) return;
        const role_id = Number(btn.dataset.roleId);
        const low = Number(
          this.container.querySelector(`#low-${role_id}`)?.value,
        );
        const medium = Number(
          this.container.querySelector(`#medium-${role_id}`)?.value,
        );
        if (isNaN(low) || isNaN(medium))
          return showToast("Vui lòng nhập số", "error");
        if (low >= medium) return showToast("Low phải nhỏ hơn Medium", "error");
        const res = await targetStore.updateTarget(role_id, low, medium);
        showToast(
          res.success ? "Đã lưu" : `Lỗi: ${res.message}`,
          res.success ? "success" : "error",
        );
      });
  }

  _updateView() {
    const tbody = this.container.querySelector("#targets-tbody");
    const { loading, error, targets } = targetStore.state;
    if (loading) {
      tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-center">Đang tải...</td></tr>`;
      return;
    }
    if (error) {
      tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-rose-500">Lỗi: ${error}</td></tr>`;
      return;
    }
    if (!targets.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-center text-slate-400">Chưa có role nào</td></tr>`;
      return;
    }
    tbody.innerHTML = targets
      .map(
        (t) => `
      <tr>
        <td class="px-6 py-4 font-medium">${t.display_name || t.role_key}</td>
        <td class="px-6 py-4"><input id="low-${t.role_id}" type="number" min="0" value="${t.low_threshold}" class="w-20 rounded border border-slate-200 px-2 py-1 text-sm" /></td>
        <td class="px-6 py-4"><input id="medium-${t.role_id}" type="number" min="0" value="${t.medium_threshold}" class="w-20 rounded border border-slate-200 px-2 py-1 text-sm" /></td>
        <td class="px-6 py-4"><button data-action="save-target" data-role-id="${t.role_id}" class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1 rounded-lg">Lưu</button></td>
      </tr>
    `,
      )
      .join("");
    lucide.createIcons();
  }
}
