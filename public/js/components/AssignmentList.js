import { showToast } from "../utils/toast.js";
import { escapeHtml } from "../utils/escapeHtml.js";

export class AssignmentList {
    constructor(container, store) {
        this.container = container;
        this.store = store;
        this.store.on("update", () => this.render());
        this.render();
    }

    render() {
        const { assignments, loading, error } = this.store.getState();
        if (loading) {
            this.container.innerHTML = `<p class="text-slate-500 text-sm">Đang tải...</p>`;
            return;
        }
        if (error) {
            this.container.innerHTML = `<p class="text-red-500 text-sm">Lỗi: ${escapeHtml(error)}</p>`;
            return;
        }

        if (!assignments.length) {
            this.container.innerHTML = `<p class="text-slate-500 text-sm">Không có phân công nào.</p>`;
            return;
        }

        const rows = assignments
            .map(
                (a) => `
      <tr>
        <td class="px-4 py-2 text-sm">${escapeHtml(a.user_email)}</td>
        <td class="px-4 py-2 text-sm">${new Date(a.start_time).toLocaleString("vi-VN")}</td>
        <td class="px-4 py-2 text-sm">${new Date(a.end_time).toLocaleString("vi-VN")}</td>
        <td class="px-4 py-2 text-sm">${escapeHtml(a.reason || "")}</td>
        <td class="px-4 py-2 text-sm">${escapeHtml(a.created_by || "")}</td>
        <td class="px-4 py-2 text-sm">
          <button class="edit-btn text-indigo-600 hover:underline mr-2" data-id="${a.id}">Sửa</button>
          <button class="delete-btn text-red-600 hover:underline" data-id="${a.id}">Xoá</button>
        </td>
      </tr>`
            )
            .join("");

        this.container.innerHTML = `
      <div class="overflow-x-auto bg-white rounded-2xl border border-slate-100 shadow-sm mt-6">
        <table class="w-full text-left">
          <thead class="bg-slate-50 text-slate-700 text-xs uppercase">
            <tr>
              <th class="px-4 py-3 font-semibold">Email</th>
              <th class="px-4 py-3 font-semibold">Bắt đầu</th>
              <th class="px-4 py-3 font-semibold">Kết thúc</th>
              <th class="px-4 py-3 font-semibold">Lý do</th>
              <th class="px-4 py-3 font-semibold">Người tạo</th>
              <th class="px-4 py-3 font-semibold">Hành động</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">${rows}</tbody>
        </table>
      </div>
    `;

        this.attachEvents();
    }

    attachEvents() {
        this.container.querySelectorAll(".edit-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = btn.dataset.id;
                const assignment = this.store.getState().assignments.find((a) => a.id == id);
                if (assignment) {
                    document.dispatchEvent(new CustomEvent("edit-assignment", { detail: assignment }));
                }
            });
        });

        this.container.querySelectorAll(".delete-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                if (confirm("Xoá phân công này?")) {
                    const id = btn.dataset.id;
                    const result = await this.store.removeAssignment(id);
                    if (!result.success) showToast(result.message, "error");
                    else showToast("Đã xoá");
                }
            });
        });
    }
}