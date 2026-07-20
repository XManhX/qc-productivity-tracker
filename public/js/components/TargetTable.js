import { targetStore } from "../store/TargetStore.js";
import { showToast } from "../utils/toast.js";

export class TargetTable {
  constructor(container) {
    this.container = container;
    this._saving = {};
    this._saveTimeouts = {};
    this._originalTargets = [];
    this._suppressUpdate = false;

    this._render();
    targetStore.on("update", () => {
      if (this._suppressUpdate) return;
      this._updateView();
    });

    // Nếu store đã có dữ liệu (không đang loading) → render ngay
    if (!targetStore.state.loading) {
      this._updateView();
    }
  }

  _render() {
    this.container.innerHTML = `
      <div class="p-6 border-b border-slate-100 bg-slate-50/70">
        <div class="flex items-center gap-2">
          <div class="bg-amber-50 p-2 rounded-lg text-amber-600">
            <i data-lucide="target" class="w-5 h-5"></i>
          </div>
          <div>
            <h2 class="text-lg font-bold text-slate-900">Ngưỡng Năng Suất (Targets)</h2>
            <p class="text-xs text-slate-400 mt-0.5">
              Nhập giá trị, dữ liệu sẽ tự động lưu sau khi bạn rời khỏi ô.
            </p>
          </div>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider font-semibold">
              <th class="px-6 py-3">Role</th>
              <th class="px-6 py-3">Low Threshold</th>
              <th class="px-6 py-3">Medium Threshold</th>
            </tr>
          </thead>
          <tbody id="targets-tbody" class="divide-y divide-slate-100 text-sm"></tbody>
        </table>
      </div>
    `;
    lucide.createIcons();
    this._bindEvents();
  }

  _bindEvents() {
    const tbody = this.container.querySelector("#targets-tbody");

    // Validate realtime
    tbody.addEventListener("input", (e) => {
      const input = e.target;
      if (!input.matches("input[data-role-id]")) return;
      const roleId = input.dataset.roleId;
      this._validateInputs(roleId);
    });

    // Hủy debounce khi focus trở lại
    tbody.addEventListener("focusin", (e) => {
      const input = e.target;
      if (!input.matches("input[data-role-id]")) return;
      const roleId = input.dataset.roleId;
      if (this._saveTimeouts[roleId]) {
        clearTimeout(this._saveTimeouts[roleId]);
        delete this._saveTimeouts[roleId];
      }
    });

    // Auto-save khi giá trị thay đổi và blur (dùng sự kiện change)
    tbody.addEventListener("change", (e) => {
      const input = e.target;
      if (!input.matches("input[data-role-id]")) return;
      const roleId = input.dataset.roleId;
      this._scheduleAutoSave(roleId);
    });
  }

  // ---------- Helpers ----------
  /**
   * Lấy định danh duy nhất của role từ dataset.
   * Trả về string để đảm bảo nhất quán với role_key (nếu có chữ).
   */
  _getRoleIdentifier(input) {
    return input.dataset.roleId; // role_id hoặc role_key, tùy cách bạn render
  }

  // ---------- Validate realtime ----------
  _validateInputs(roleIdentifier) {
    // Dùng attribute selector với data-role-id để tránh trùng id
    const lowEl = this.container.querySelector(
      `input[data-role-id="${roleIdentifier}"][id^="low-"]`,
    );
    const mediumEl = this.container.querySelector(
      `input[data-role-id="${roleIdentifier}"][id^="medium-"]`,
    );
    if (!lowEl || !mediumEl) return false;

    const low = Number(lowEl.value);
    const medium = Number(mediumEl.value);
    const isValid = !isNaN(low) && !isNaN(medium) && low < medium;

    // Xoá thông báo lỗi cũ
    [lowEl, mediumEl].forEach((el) => {
      el.parentNode
        .querySelectorAll(".target-feedback")
        .forEach((fb) => fb.remove());
    });

    if (isValid) {
      lowEl.classList.remove("target-error");
      mediumEl.classList.remove("target-error");
    } else {
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
    }
    return isValid;
  }

  // ---------- Debounce & Auto-save ----------
  _scheduleAutoSave(roleIdentifier) {
    if (this._saveTimeouts[roleIdentifier]) {
      clearTimeout(this._saveTimeouts[roleIdentifier]);
    }
    this._saveTimeouts[roleIdentifier] = setTimeout(() => {
      delete this._saveTimeouts[roleIdentifier];
      this._saveRole(roleIdentifier);
    }, 600);
  }

  async _saveRole(roleIdentifier) {
    if (this._saving[roleIdentifier]) return;

    const lowEl = this.container.querySelector(
      `input[data-role-id="${roleIdentifier}"][id^="low-"]`,
    );
    const mediumEl = this.container.querySelector(
      `input[data-role-id="${roleIdentifier}"][id^="medium-"]`,
    );
    if (!lowEl || !mediumEl) return;

    const low = Number(lowEl.value);
    const medium = Number(mediumEl.value);
    if (isNaN(low) || isNaN(medium) || low >= medium) return;

    // So sánh với dữ liệu gốc (dùng roleIdentifier để tìm)
    const original = this._originalTargets.find(
      (t) => this._getTargetIdentifier(t) === roleIdentifier,
    );
    if (!original) return;
    if (low === original.low_threshold && medium === original.medium_threshold)
      return;

    this._saving[roleIdentifier] = true;

    try {
      // Gửi API với role_id thật (có thể lấy từ original.role_id hoặc parse)
      const numericRoleId = Number(roleIdentifier); // nếu roleIdentifier là string số
      const res = await targetStore.updateTarget(
        isNaN(numericRoleId) ? roleIdentifier : numericRoleId,
        low,
        medium,
      );

      if (res.success) {
        [lowEl, mediumEl].forEach((el) => {
          el.style.borderColor = "#10b981";
          el.style.boxShadow = "0 0 0 1px #10b981";
        });
        setTimeout(() => {
          [lowEl, mediumEl].forEach((el) => {
            el.style.borderColor = "";
            el.style.boxShadow = "";
          });
        }, 1500);

        const idx = this._originalTargets.findIndex(
          (t) => this._getTargetIdentifier(t) === roleIdentifier,
        );
        if (idx !== -1) {
          this._originalTargets[idx].low_threshold = low;
          this._originalTargets[idx].medium_threshold = medium;
        }

        this._suppressUpdate = true;
        setTimeout(() => {
          this._suppressUpdate = false;
        }, 100);

        showToast("Đã lưu ngưỡng năng suất", "success");
      } else {
        showToast(`Lỗi: ${res.message}`, "error");
      }
    } catch (err) {
      showToast("Lỗi kết nối", "error");
    } finally {
      delete this._saving[roleIdentifier];
    }
  }

  /**
   * Tạo định danh duy nhất cho target dựa vào role_id hoặc role_key.
   * Fallback: nếu không có cả hai, dùng index (chỉ khi render).
   */
  _getTargetIdentifier(target) {
    return target.role_id != null ? String(target.role_id) : target.role_key;
  }

  // ---------- Cập nhật giao diện ----------
  _updateView() {
    const tbody = this.container.querySelector("#targets-tbody");
    const { loading, error, targets } = targetStore.state;
    console.log("Raw targets from store:", JSON.stringify(targets, null, 2));

    if (loading) {
      tbody.innerHTML = `<tr><td colspan="3" class="py-12 text-center">Đang tải...</td></tr>`;
      return;
    }
    if (error) {
      tbody.innerHTML = `<tr><td colspan="3" class="py-12 text-rose-500">Lỗi: ${error}</td></tr>`;
      return;
    }
    if (!targets || !targets.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="py-12 text-center text-slate-400">Chưa có role nào</td></tr>`;
      return;
    }

    // Lưu bản sao gốc, đảm bảo không undefined
    this._originalTargets = targets.map((t) => ({
      ...t,
      low_threshold: t.low_threshold ?? 0,
      medium_threshold: t.medium_threshold ?? 0,
    }));

    // Render với data-role-id để định danh duy nhất
    tbody.innerHTML = targets
      .map((t, index) => {
        const identifier = this._getTargetIdentifier(t) || `index-${index}`; // fallback cứng
        return `
          <tr>
            <td class="px-6 py-4 font-medium">${t.display_name || t.role_key || `Role ${index + 1}`}</td>
            <td class="px-6 py-4">
              <input id="low-${identifier}" data-role-id="${identifier}" type="number" min="0" 
                     value="${t.low_threshold ?? 0}"
                     class="w-20 rounded border border-slate-200 px-2 py-1 text-sm" />
            </td>
            <td class="px-6 py-4">
              <input id="medium-${identifier}" data-role-id="${identifier}" type="number" min="0" 
                     value="${t.medium_threshold ?? 0}"
                     class="w-20 rounded border border-slate-200 px-2 py-1 text-sm" />
            </td>
          </tr>
        `;
      })
      .join("");

    lucide.createIcons();
    // Validate tất cả để xoá lỗi cũ
    targets.forEach((t) => {
      const id = this._getTargetIdentifier(t);
      if (id) this._validateInputs(id);
    });
  }
}
