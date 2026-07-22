import { alertConfigStore } from "../store/AlertConfigStore.js";

export class AlertConfigForm {
  constructor(container) {
    this.container = container;
    this.store = alertConfigStore;
    this.store.on("update", () => this.render());
    this.render();
  }

  render() {
    const config = this.store.getConfig();
    const loading = this.store.isLoading();
    const error = this.store.getError();

    if (loading && !config) {
      this.container.innerHTML = `<p class="text-slate-500">Đang tải cấu hình...</p>`;
      return;
    }

    if (error) {
      this.container.innerHTML = `<p class="text-red-500">Lỗi: ${error}</p>`;
      return;
    }

    if (!config) {
      this.container.innerHTML = `<p class="text-red-500">Không có dữ liệu cấu hình.</p>`;
      return;
    }

    // Tạo form HTML
    const html = `
      <form id="alert-config-form" class="space-y-6">
        <h2 class="text-xl font-semibold text-slate-700">Cấu hình cảnh báo idle</h2>

        <!-- Giờ làm việc -->
        <fieldset class="border rounded-lg p-4">
          <legend class="text-lg font-medium text-slate-600 px-2">Ca làm việc</legend>
          <div class="grid grid-cols-2 gap-4 mt-2">
            <div>
              <label class="block text-sm font-medium text-slate-500">Bắt đầu (giờ:phút)</label>
              <div class="flex space-x-2">
                <input type="number" name="work_start_hour" value="${config.work_start_hour}" min="0" max="23" class="w-20 form-input rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                <span class="self-center">:</span>
                <input type="number" name="work_start_min" value="${config.work_start_min}" min="0" max="59" class="w-20 form-input rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-500">Kết thúc (giờ:phút)</label>
              <div class="flex space-x-2">
                <input type="number" name="work_end_hour" value="${config.work_end_hour}" min="0" max="23" class="w-20 form-input rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                <span class="self-center">:</span>
                <input type="number" name="work_end_min" value="${config.work_end_min}" min="0" max="59" class="w-20 form-input rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
              </div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label class="block text-sm font-medium text-slate-500">Đệm trước giờ vào (phút)</label>
              <input type="number" name="work_start_buffer_minutes" value="${config.work_start_buffer_minutes}" min="0" class="w-full form-input rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-500">Đệm sau giờ tan (phút)</label>
              <input type="number" name="work_end_buffer_minutes" value="${config.work_end_buffer_minutes}" min="0" class="w-full form-input rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
            </div>
          </div>
        </fieldset>

        <!-- Giờ nghỉ trưa -->
        <fieldset class="border rounded-lg p-4">
          <legend class="text-lg font-medium text-slate-600 px-2">Giờ nghỉ trưa</legend>
          <div class="grid grid-cols-2 gap-4 mt-2">
            <div>
              <label class="block text-sm font-medium text-slate-500">Bắt đầu (giờ:phút)</label>
              <div class="flex space-x-2">
                <input type="number" name="break_start_hour" value="${config.break_start_hour}" min="0" max="23" class="w-20 form-input rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                <span class="self-center">:</span>
                <input type="number" name="break_start_min" value="${config.break_start_min}" min="0" max="59" class="w-20 form-input rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-500">Kết thúc (giờ:phút)</label>
              <div class="flex space-x-2">
                <input type="number" name="break_end_hour" value="${config.break_end_hour}" min="0" max="23" class="w-20 form-input rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                <span class="self-center">:</span>
                <input type="number" name="break_end_min" value="${config.break_end_min}" min="0" max="59" class="w-20 form-input rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
              </div>
            </div>
          </div>
        </fieldset>

        <!-- Tham số cảnh báo -->
        <fieldset class="border rounded-lg p-4">
          <legend class="text-lg font-medium text-slate-600 px-2">Tham số cảnh báo</legend>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
            <div>
              <label class="block text-sm font-medium text-slate-500">Ngưỡng idle (phút)</label>
              <input type="number" name="idle_threshold_minutes" value="${config.idle_threshold_minutes}" min="1" class="w-full form-input rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-500">Cooldown (phút)</label>
              <input type="number" name="cooldown_minutes" value="${config.cooldown_minutes}" min="1" class="w-full form-input rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-500">Số user tối đa / tin nhắn</label>
              <input type="number" name="max_users_per_message" value="${config.max_users_per_message}" min="1" class="w-full form-input rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-500">Seatalk Webhook URL</label>
            <input type="url" name="seatalk_webhook_url" value="${config.seatalk_webhook_url || ""}" 
                  class="w-full form-input rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="https://seatalkwebhook..."
            >
          </div>
        </fieldset>

        <div class="flex justify-end space-x-3">
          <button type="button" id="reset-btn" class="px-4 py-2 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200">
            Nhập lại
          </button>
          <button type="submit" id="save-btn" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50">
            ${loading ? "Đang lưu..." : "Lưu cấu hình"}
          </button>
        </div>
      </form>
    `;

    this.container.innerHTML = html;
    this.attachEvents();
  }

  attachEvents() {
    const form = document.getElementById("alert-config-form");
    const resetBtn = document.getElementById("reset-btn");

    if (!form) return;

    // Reset về giá trị ban đầu trong store
    resetBtn.addEventListener("click", () => {
      this.render(); // re-render sẽ lấy lại config từ store (chưa thay đổi)
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const data = {};
      // Các trường số nguyên
      const fields = [
        "work_start_hour",
        "work_start_min",
        "work_end_hour",
        "work_end_min",
        "work_start_buffer_minutes",
        "work_end_buffer_minutes",
        "break_start_hour",
        "break_start_min",
        "break_end_hour",
        "break_end_min",
        "idle_threshold_minutes",
        "cooldown_minutes",
        "max_users_per_message",
        "seatalk_webhook_url",
      ];
      fields.forEach((f) => {
        data[f] = parseInt(formData.get(f), 10);
      });

      data["seatalk_webhook_url"] = formData.get("seatalk_webhook_url") || "";

      const result = await this.store.saveConfig(data);
      const toast = document.getElementById("toast");
      if (result.success) {
        toast.textContent = "Đã lưu cấu hình thành công!";
        toast.className = "toast show success";
      } else {
        toast.textContent = `Lỗi: ${result.message}`;
        toast.className = "toast show error";
      }
      setTimeout(() => {
        toast.className = "toast";
      }, 3000);
      this.render(); // Re-render với config mới nhất
    });
  }
}
