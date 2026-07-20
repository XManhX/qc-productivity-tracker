import { targetStore } from "../store/TargetStore.js";
import { showToast } from "../utils/toast.js";

export class TargetTable {
  constructor(container) {
    this.container = container;
    this._saving = {}; // roleId -> true nếu đang gọi API
    this._saveTimeouts = {}; // roleId -> timeout ID cho debounce
    this._originalTargets = []; // bản sao dữ liệu gốc để so sánh
    this._suppressUpdate = false; // cờ tránh render lại khi tự lưu

    this._render();
    targetStore.on("update", () => {
      if (this._suppressUpdate) return;
      this._updateView();
    });
    this._updateView();
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

    // Validate tức thì khi gõ
    tbody.addEventListener("input", (e) => {
      const input = e.target;
      if (!input.matches('input[id^="low-"], input[id^="medium-"]')) return;
      const roleId = this._getRoleId(input);
      this._validateInputs(roleId);
    });

    // Khi focus vào input -> hủy debounce auto‑save đang chờ (nếu có)
    tbody.addEventListener("focusin", (e) => {
      const input = e.target;
      if (!input.matches('input[id^="low-"], input[id^="medium-"]')) return;
      const roleId = this._getRoleId(input);
      if (this._saveTimeouts[roleId]) {
        clearTimeout(this._saveTimeouts[roleId]);
        delete this._saveTimeouts[roleId];
      }
    });

    // Khi blur -> bắt đầu debounce để auto‑save
    tbody.addEventListener(
      "blur",
      (e) => {
        const input = e.target;
        if (!input.matches('input[id^="low-"], input[id^="medium-"]')) return;
        const roleId = this._getRoleId(input);
        this._scheduleAutoSave(roleId);
      },
      true,
    ); // capture vì blur không nổi bọt
  }

  // ---------- Helpers ----------
  _getRoleId(input) {
    return Number(input.id.split("-")[1]);
  }

  // ---------- Validate realtime ----------
  _validateInputs(roleId) {
    const lowEl = this.container.querySelector(`#low-${roleId}`);
    const mediumEl = this.container.querySelector(`#medium-${roleId}`);
    if (!lowEl || !mediumEl) return false;

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

  // ---------- Debounce & Auto‑save ----------
  _scheduleAutoSave(roleId) {
    // Hủy timeout cũ nếu có
    if (this._saveTimeouts[roleId]) {
      clearTimeout(this._saveTimeouts[roleId]);
    }
    // Đặt timeout mới (600ms, đủ để người dùng chuyển sang ô khác hoặc click chuột)
    this._saveTimeouts[roleId] = setTimeout(() => {
      delete this._saveTimeouts[roleId];
      this._saveRole(roleId);
    }, 600);
  }

  async _saveRole(roleId) {
    // Tránh gọi nhiều lần
    if (this._saving[roleId]) return;

    const lowEl = this.container.querySelector(`#low-${roleId}`);
    const mediumEl = this.container.querySelector(`#medium-${roleId}`);
    if (!lowEl || !mediumEl) return;

    const low = Number(lowEl.value);
    const medium = Number(mediumEl.value);

    // Chỉ lưu nếu hợp lệ
    if (isNaN(low) || isNaN(medium) || low >= medium) return;

    // So sánh với dữ liệu gốc
    const original = this._originalTargets.find((t) => t.role_id === roleId);
    if (!original) return;
    if (low === original.low_threshold && medium === original.medium_threshold)
      return;

    this._saving[roleId] = true;

    try {
      const res = await targetStore.updateTarget(roleId, low, medium);
      if (res.success) {
        // Phản hồi thành công: viền xanh 1.5s
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

        // Cập nhật original để không lưu lại cùng giá trị
        const idx = this._originalTargets.findIndex(
          (t) => t.role_id === roleId,
        );
        if (idx !== -1) {
          this._originalTargets[idx].low_threshold = low;
          this._originalTargets[idx].medium_threshold = medium;
        }

        // Chặn render lại từ store update (chính mình gây ra)
        this._suppressUpdate = true;
        setTimeout(() => {
          this._suppressUpdate = false;
        }, 100);
      } else {
        showToast(`Lỗi: ${res.message}`, "error");
      }
    } catch (err) {
      showToast("Lỗi kết nối", "error");
    } finally {
      delete this._saving[roleId];
    }
  }

  // ---------- Cập nhật giao diện (chỉ khi dữ liệu từ store thay đổi) ----------
  _updateView() {
    const tbody = this.container.querySelector("#targets-tbody");
    const { loading, error, targets } = targetStore.state;

    if (loading) {
      tbody.innerHTML = `<tr><td colspan="3" class="py-12 text-center">Đang tải...</td></tr>`;
      return;
    }
    if (error) {
      tbody.innerHTML = `<tr><td colspan="3" class="py-12 text-rose-500">Lỗi: ${error}</td></tr>`;
      return;
    }
    if (!targets.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="py-12 text-center text-slate-400">Chưa có role nào</td></tr>`;
      return;
    }

    // Lưu bản sao giá trị gốc
    this._originalTargets = targets.map((t) => ({ ...t }));

    // Render (chú ý: không còn nút Lưu)
    tbody.innerHTML = targets
      .map(
        (t) => `
        <tr>
          <td class="px-6 py-4 font-medium">${t.display_name || t.role_key}</td>
          <td class="px-6 py-4">
            <input id="low-${t.role_id}" type="number" min="0" value="${t.low_threshold}"
              class="w-20 rounded border border-slate-200 px-2 py-1 text-sm" />
          </td>
          <td class="px-6 py-4">
            <input id="medium-${t.role_id}" type="number" min="0" value="${t.medium_threshold}"
              class="w-20 rounded border border-slate-200 px-2 py-1 text-sm" />
          </td>
        </tr>
      `,
      )
      .join("");

    lucide.createIcons();
    // Sau khi render lại, validate tất cả role một lần để xoá trạng thái lỗi cũ (nếu có)
    targets.forEach((t) => this._validateInputs(t.role_id));
  }
}
