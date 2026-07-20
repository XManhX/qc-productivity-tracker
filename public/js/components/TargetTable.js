import { targetStore } from "../store/TargetStore.js";
import { showToast } from "../utils/toast.js";

export class TargetTable {
  constructor(container) {
    this.container = container;
    this._saving = {}; // cờ tránh gọi API trùng lặp cho từng role
    this._originalTargets = []; // lưu giá trị gốc để so sánh thay đổi
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
            <p class="text-xs text-slate-400 mt-0.5">Cài đặt low_threshold (<span class="text-red-500">thấp</span>) và medium_threshold (<span class="text-green-500">tốt</span>) cho từng role. Dữ liệu được tự động lưu khi rời khỏi ô nhập.</p>
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
    const tbody = this.container.querySelector("#targets-tbody");

    // Realtime validation khi nhập
    tbody.addEventListener("input", (e) => {
      const input = e.target;
      if (!input.matches('input[id^="low-"], input[id^="medium-"]')) return;
      this._validateInputs(input);
    });

    // Tự động lưu khi blur (chỉ khi hợp lệ)
    tbody.addEventListener(
      "blur",
      (e) => {
        const input = e.target;
        if (!input.matches('input[id^="low-"], input[id^="medium-"]')) return;
        // Dùng setTimeout để tránh xung đột với sự kiện click vào nút Lưu
        setTimeout(() => this._maybeAutoSave(input), 150);
      },
      true,
    ); // useCapture = true vì blur không nổi bọt

    // Vẫn giữ nút Lưu như một hành động thủ công (dự phòng)
    tbody.addEventListener("click", async (e) => {
      const btn = e.target.closest('button[data-action="save-target"]');
      if (!btn) return;
      const roleId = Number(btn.dataset.roleId);
      await this._saveRole(roleId);
    });
  }

  // ---------- Validate realtime ----------
  _validateInputs(input) {
    const roleId = Number(input.id.split("-")[1]);
    const lowEl = this.container.querySelector(`#low-${roleId}`);
    const mediumEl = this.container.querySelector(`#medium-${roleId}`);
    if (!lowEl || !mediumEl) return;

    const low = Number(lowEl.value);
    const medium = Number(mediumEl.value);
    const isValid = !isNaN(low) && !isNaN(medium) && low < medium;

    // Xoá thông báo lỗi cũ
    lowEl.parentNode
      .querySelectorAll(".target-feedback")
      .forEach((el) => el.remove());
    mediumEl.parentNode
      .querySelectorAll(".target-feedback")
      .forEach((el) => el.remove());

    if (!isValid) {
      lowEl.classList.add("target-error");
      mediumEl.classList.add("target-error");
      const msg =
        isNaN(low) || isNaN(medium)
          ? "Vui lòng nhập số"
          : "Low phải nhỏ hơn Medium";
      const feedback = document.createElement("div");
      feedback.className = "target-feedback";
      feedback.textContent = msg;
      mediumEl.parentNode.appendChild(feedback);
    } else {
      lowEl.classList.remove("target-error");
      mediumEl.classList.remove("target-error");
    }

    // Cập nhật trạng thái nút Lưu
    const saveBtn = this.container.querySelector(
      `button[data-role-id="${roleId}"]`,
    );
    if (saveBtn) saveBtn.disabled = !isValid;
  }

  // ---------- Tự động lưu khi blur ----------
  async _maybeAutoSave(input) {
    const roleId = Number(input.id.split("-")[1]);
    const lowEl = this.container.querySelector(`#low-${roleId}`);
    const mediumEl = this.container.querySelector(`#medium-${roleId}`);
    if (!lowEl || !mediumEl) return;

    const low = Number(lowEl.value);
    const medium = Number(mediumEl.value);
    // Không hợp lệ thì không lưu
    if (isNaN(low) || isNaN(medium) || low >= medium) return;

    // Kiểm tra có thay đổi so với giá trị gốc không
    const original = this._originalTargets.find((t) => t.role_id === roleId);
    if (!original) return;
    if (low === original.low_threshold && medium === original.medium_threshold)
      return;

    // Ngăn chặn gọi API nhiều lần
    if (this._saving[roleId]) return;
    this._saving[roleId] = true;

    const res = await targetStore.updateTarget(roleId, low, medium);
    if (res.success) {
      // Phản hồi trực quan: viền xanh tạm thời
      lowEl.style.borderColor = "#10b981";
      mediumEl.style.borderColor = "#10b981";
      setTimeout(() => {
        lowEl.style.borderColor = "";
        mediumEl.style.borderColor = "";
      }, 1500);
      // Cập nhật lại original để so sánh lần sau
      const idx = this._originalTargets.findIndex((t) => t.role_id === roleId);
      if (idx !== -1) {
        this._originalTargets[idx].low_threshold = low;
        this._originalTargets[idx].medium_threshold = medium;
      }
    } else {
      showToast(`Lỗi: ${res.message}`, "error");
    }
    delete this._saving[roleId];
  }

  // ---------- Nút Lưu thủ công ----------
  async _saveRole(roleId) {
    const lowEl = this.container.querySelector(`#low-${roleId}`);
    const mediumEl = this.container.querySelector(`#medium-${roleId}`);
    const low = Number(lowEl.value);
    const medium = Number(mediumEl.value);

    if (isNaN(low) || isNaN(medium))
      return showToast("Vui lòng nhập số", "error");
    if (low >= medium) return showToast("Low phải nhỏ hơn Medium", "error");

    if (this._saving[roleId]) return;
    this._saving[roleId] = true;

    const res = await targetStore.updateTarget(roleId, low, medium);
    if (res.success) {
      showToast("Đã lưu", "success");
      // Cập nhật original nếu store chưa tự cập nhật (tuỳ vào cách store hoạt động, có thể cần hoặc không)
      const idx = this._originalTargets.findIndex((t) => t.role_id === roleId);
      if (idx !== -1) {
        this._originalTargets[idx].low_threshold = low;
        this._originalTargets[idx].medium_threshold = medium;
      }
      // Xoá trạng thái lỗi nếu có
      lowEl.classList.remove("target-error");
      mediumEl.classList.remove("target-error");
      const fb = mediumEl.parentNode.querySelector(".target-feedback");
      if (fb) fb.remove();
    } else {
      showToast(`Lỗi: ${res.message}`, "error");
    }
    delete this._saving[roleId];
  }

  // ---------- Cập nhật giao diện ----------
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

    // Lưu bản sao giá trị gốc để so sánh thay đổi
    this._originalTargets = targets.map((t) => ({ ...t }));

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
