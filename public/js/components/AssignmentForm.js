import { showToast } from "../utils/toast.js";

export class AssignmentForm {
    constructor(container, store) {
        this.container = container;
        this.store = store;
        this.isEdit = false;
        this.editId = null;
        this.render();
        document.addEventListener("edit-assignment", (e) => {
            this.populateEdit(e.detail);
        });
    }

    populateEdit(assignment) {
        this.isEdit = true;
        this.editId = assignment.id;
        this.container.querySelector("#assignment-email").value = assignment.user_email;
        this.container.querySelector("#assignment-start").value = new Date(assignment.start_time).toISOString().slice(0, 16);
        this.container.querySelector("#assignment-end").value = new Date(assignment.end_time).toISOString().slice(0, 16);
        this.container.querySelector("#assignment-reason").value = assignment.reason || "";
        this.container.querySelector("#submit-btn").textContent = "Cập nhật";
    }

    render() {
        this.container.innerHTML = `
      <form id="assignment-form" class="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
        <h2 class="text-lg font-semibold text-slate-700">${this.isEdit ? "Chỉnh sửa" : "Thêm mới"} phân công</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Email QC</label>
            <input type="email" id="assignment-email" required placeholder="nguyenvana@example.com"
                   class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Lý do</label>
            <input type="text" id="assignment-reason" placeholder="Họp, training..."
                   class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Bắt đầu</label>
            <input type="datetime-local" id="assignment-start" required
                   class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Kết thúc</label>
            <input type="datetime-local" id="assignment-end" required
                   class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition">
          </div>
        </div>
        <div class="flex justify-end space-x-3">
          <button type="button" id="cancel-edit-btn" class="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold text-sm hover:bg-slate-50 transition ${this.isEdit ? '' : 'hidden'}">
            Huỷ
          </button>
          <button type="submit" id="submit-btn" class="px-4 py-2 bg-indigo-600 text-white font-semibold text-sm rounded-xl hover:bg-indigo-500 transition">
            ${this.isEdit ? "Cập nhật" : "Thêm mới"}
          </button>
        </div>
      </form>
    `;

        this.attachEvents();
    }

    attachEvents() {
        const form = this.container.querySelector("#assignment-form");
        const cancelBtn = this.container.querySelector("#cancel-edit-btn");

        cancelBtn?.addEventListener("click", () => {
            this.resetForm();
            this.render();
        });

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const data = {
                user_email: form.querySelector("#assignment-email").value.trim(),
                start_time: form.querySelector("#assignment-start").value,
                end_time: form.querySelector("#assignment-end").value,
                reason: form.querySelector("#assignment-reason").value.trim(),
            };

            if (!data.user_email || !data.start_time || !data.end_time) {
                showToast("Vui lòng nhập đầy đủ thông tin", "error");
                return;
            }

            let result;
            if (this.isEdit) {
                result = await this.store.editAssignment(this.editId, data);
            } else {
                result = await this.store.addAssignment(data);
            }

            if (result.success) {
                showToast(this.isEdit ? "Đã cập nhật" : "Đã thêm mới");
                this.resetForm();
                this.isEdit = false;
                this.editId = null;
                this.render();
            } else {
                showToast(result.message, "error");
            }
        });
    }

    resetForm() {
        this.isEdit = false;
        this.editId = null;
    }
}