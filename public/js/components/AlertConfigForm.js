// js/components/AlertConfigForm.js
import { alertConfigStore } from "../store/AlertConfigStore.js";
import { showToast } from "../utils/toast.js";

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
      this.container.innerHTML = `
        <div class="flex items-center gap-2">
          <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
          <p class="text-slate-500 text-sm">Đang tải cấu hình...</p>
        </div>`;
      return;
    }

    if (!config) {
      this.container.innerHTML = `<p class="text-red-500 text-sm">Không có dữ liệu cấu hình.</p>`;
      return;
    }

    const html = `
      <form id="alert-config-form" class="space-y-6">
        <h2 class="text-xl font-semibold text-slate-700 flex items-center gap-2">
          <i data-lucide="settings" class="w-5 h-5 text-indigo-600"></i>
          Cấu hình hệ thống
        </h2>

        <!-- Giờ làm việc -->
        <fieldset class="border border-slate-200 rounded-xl p-4">
          <legend class="text-base font-medium text-slate-600 px-2 flex items-center gap-1">
            <i data-lucide="clock" class="w-4 h-4 text-indigo-500"></i> Ca làm việc
          </legend>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Bắt đầu</label>
              <div class="flex items-center space-x-1">
                <input type="number" name="work_start_hour" value="${config.work_start_hour}" min="0" max="23" 
                       class="w-16 bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-sm text-center focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition" required>
                <span class="text-slate-400 font-medium">:</span>
                <input type="number" name="work_start_min" value="${config.work_start_min}" min="0" max="59" 
                       class="w-16 bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-sm text-center focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition" required>
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Kết thúc</label>
              <div class="flex items-center space-x-1">
                <input type="number" name="work_end_hour" value="${config.work_end_hour}" min="0" max="23" 
                       class="w-16 bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-sm text-center focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition" required>
                <span class="text-slate-400 font-medium">:</span>
                <input type="number" name="work_end_min" value="${config.work_end_min}" min="0" max="59" 
                       class="w-16 bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-sm text-center focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition" required>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Đệm trước giờ vào (phút)</label>
              <input type="number" name="work_start_buffer_minutes" value="${config.work_start_buffer_minutes}" min="0" 
                     class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition" required>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Đệm sau giờ tan (phút)</label>
              <input type="number" name="work_end_buffer_minutes" value="${config.work_end_buffer_minutes}" min="0" 
                     class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition" required>
            </div>
          </div>
        </fieldset>

        <!-- Giờ nghỉ trưa -->
        <fieldset class="border border-slate-200 rounded-xl p-4">
          <legend class="text-base font-medium text-slate-600 px-2 flex items-center gap-1">
            <i data-lucide="sun" class="w-4 h-4 text-amber-500"></i> Giờ nghỉ trưa
          </legend>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Bắt đầu</label>
              <div class="flex items-center space-x-1">
                <input type="number" name="break_start_hour" value="${config.break_start_hour}" min="0" max="23" 
                       class="w-16 bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-sm text-center focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition" required>
                <span class="text-slate-400 font-medium">:</span>
                <input type="number" name="break_start_min" value="${config.break_start_min}" min="0" max="59" 
                       class="w-16 bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-sm text-center focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition" required>
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Kết thúc</label>
              <div class="flex items-center space-x-1">
                <input type="number" name="break_end_hour" value="${config.break_end_hour}" min="0" max="23" 
                       class="w-16 bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-sm text-center focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition" required>
                <span class="text-slate-400 font-medium">:</span>
                <input type="number" name="break_end_min" value="${config.break_end_min}" min="0" max="59" 
                       class="w-16 bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-sm text-center focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition" required>
              </div>
            </div>
          </div>
        </fieldset>

        <!-- Tham số cảnh báo -->
        <fieldset class="border border-slate-200 rounded-xl p-4">
          <legend class="text-base font-medium text-slate-600 px-2 flex items-center gap-1">
            <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-600"></i> Tham số cảnh báo
          </legend>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Ngưỡng idle (phút)</label>
              <input type="number" name="idle_threshold_minutes" value="${config.idle_threshold_minutes}" min="1" 
                     class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition" required>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Cooldown (phút)</label>
              <input type="number" name="cooldown_minutes" value="${config.cooldown_minutes}" min="1" 
                     class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition" required>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Số user tối đa / tin nhắn</label>
              <input type="number" name="max_users_per_message" value="${config.max_users_per_message}" min="1" 
                     class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition" required>
            </div>
          </div>
          <div class="mt-4 space-y-4">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Seatalk Webhook (cảnh báo idle)</label>
              <input type="url" name="seatalk_webhook_url" value="${config.seatalk_webhook_url || ""}" 
                     class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition"
                     placeholder="https://seatalkwebhook...">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Seatalk Webhook (báo cáo tổng hợp)</label>
              <input type="url" name="report_seatalk_webhook_url" value="${config.report_seatalk_webhook_url || ""}" 
                     class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition"
                     placeholder="https://seatalkwebhook...">
            </div>
          </div>
        </fieldset>

        <!-- Cấu hình báo cáo -->
        <fieldset class="border border-slate-200 rounded-xl p-4">
          <legend class="text-base font-medium text-slate-600 px-2 flex items-center gap-1">
            <i data-lucide="bar-chart-2" class="w-4 h-4 text-indigo-500"></i> Báo cáo tổng hợp
          </legend>
          <div class="flex flex-wrap items-center gap-6 mt-2">
            <label class="flex items-center space-x-2">
              <input type="checkbox" name="report_enabled" ${config.report_enabled ? "checked" : ""} 
                     class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
              <span class="text-sm font-medium text-slate-700">Bật báo cáo tự động</span>
            </label>
            <label class="flex items-center space-x-2">
              <input type="checkbox" name="report_only_workdays" ${config.report_only_workdays ? "checked" : ""} 
                     class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
              <span class="text-sm font-medium text-slate-700">Chỉ gửi vào ngày làm việc</span>
            </label>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Giờ bắt đầu gửi</label>
              <input type="number" name="report_hour_start" value="${config.report_hour_start}" min="0" max="23" 
                     class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition" required>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Giờ kết thúc gửi</label>
              <input type="number" name="report_hour_end" value="${config.report_hour_end}" min="0" max="23" 
                     class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition" required>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Phút gửi</label>
              <input type="number" name="report_minute" value="${config.report_minute}" min="0" max="59" 
                     class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition" required>
            </div>
          </div>
        </fieldset>

        <div class="flex justify-end space-x-3">
          <button type="button" id="reset-btn" 
                  class="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold text-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 transition">
            Nhập lại
          </button>
          <button type="submit" id="save-btn" 
                  class="px-4 py-2 bg-indigo-600 text-white font-semibold text-sm rounded-xl hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 transition"
                  ${loading ? "disabled" : ""}>
            ${loading ? "Đang lưu..." : "Lưu cấu hình"}
          </button>
        </div>
      </form>
    `;

    this.container.innerHTML = html;
    lucide.createIcons();
    this.attachEvents();
  }

  attachEvents() {
    const form = document.getElementById("alert-config-form");
    const resetBtn = document.getElementById("reset-btn");

    if (!form) return;

    resetBtn.addEventListener("click", () => {
      this.render(); // Reset to store values
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      // Lấy dữ liệu
      const formData = new FormData(form);
      const data = {};
      const numberFields = [
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
        "report_hour_start",
        "report_hour_end",
        "report_minute",
      ];
      numberFields.forEach((f) => {
        data[f] = parseInt(formData.get(f), 10);
      });

      data["seatalk_webhook_url"] =
        formData.get("seatalk_webhook_url")?.trim() || "";
      data["report_seatalk_webhook_url"] =
        formData.get("report_seatalk_webhook_url")?.trim() || "";
      data["report_enabled"] = formData.get("report_enabled") === "on";
      data["report_only_workdays"] =
        formData.get("report_only_workdays") === "on";

      // Validate
      const toMinutes = (h, m) => h * 60 + m;

      // Work hours
      if (
        toMinutes(data.work_start_hour, data.work_start_min) >=
        toMinutes(data.work_end_hour, data.work_end_min)
      ) {
        showToast("Giờ bắt đầu ca làm việc phải nhỏ hơn giờ kết thúc", "error");
        return;
      }

      // Break hours (nếu có break khác 0? Ở đây có thể validate nếu break_start và break_end khác không)
      if (data.break_start_hour !== undefined) {
        const breakStart = toMinutes(
          data.break_start_hour,
          data.break_start_min,
        );
        const breakEnd = toMinutes(data.break_end_hour, data.break_end_min);
        if (breakStart >= breakEnd) {
          showToast("Giờ bắt đầu nghỉ trưa phải nhỏ hơn giờ kết thúc", "error");
          return;
        }
      }

      // URL validation (optional but gentle)
      const urlFields = ["seatalk_webhook_url", "report_seatalk_webhook_url"];
      for (const field of urlFields) {
        const val = data[field];
        if (val && !val.startsWith("https://") && !val.startsWith("http://")) {
          showToast(
            `URL không hợp lệ ở trường ${field}. Phải bắt đầu bằng http:// hoặc https://`,
            "error",
          );
          return;
        }
      }

      // Buffer, threshold, cooldown phải >= 0 (min đã có trong input, nhưng check lại)
      if (
        data.work_start_buffer_minutes < 0 ||
        data.work_end_buffer_minutes < 0 ||
        data.idle_threshold_minutes < 1 ||
        data.cooldown_minutes < 1 ||
        data.max_users_per_message < 1
      ) {
        showToast(
          "Giá trị không được âm và ngưỡng idle/cooldown tối thiểu 1",
          "error",
        );
        return;
      }

      // Submit
      const result = await this.store.saveConfig(data);
      if (result.success) {
        showToast("Đã lưu cấu hình thành công!");
      } else {
        showToast(`Lỗi: ${result.message}`, "error");
      }
      this.render(); // Re-render để lấy config mới từ store và reset UI
    });
  }
}
