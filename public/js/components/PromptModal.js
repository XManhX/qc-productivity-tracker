export class PromptModal {
  /**
   * @param {Object} options
   * @param {string} options.title
   * @param {string} options.label
   * @param {string} options.confirmText
   * @param {string} options.cancelText
   * @param {string} options.confirmClass
   * @returns {Promise<string|null>} - mật khẩu đã nhập hoặc null nếu hủy
   */
  static show({
    title = "Nhập mật khẩu mới",
    label = "Mật khẩu (ít nhất 6 ký tự)",
    confirmText = "Cập nhật",
    cancelText = "Hủy",
    confirmClass = "bg-indigo-600 hover:bg-indigo-500",
  } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className =
        "fixed inset-0 bg-black/50 flex items-center justify-center z-50";
      overlay.innerHTML = `
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 mx-4">
          <div class="flex items-center gap-3 mb-4">
            <div class="bg-indigo-50 p-2 rounded-full text-indigo-600"><i data-lucide="key" class="w-5 h-5"></i></div>
            <h3 class="text-lg font-bold text-slate-900">${title}</h3>
          </div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">${label}</label>
          <div class="relative mb-4">
            <input type="password" id="prompt-input" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm pr-10 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none" placeholder="Ít nhất 6 ký tự">
            <button type="button" id="toggle-prompt-password" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><i data-lucide="eye" class="w-4 h-4"></i></button>
          </div>
          <p id="prompt-error" class="text-rose-500 text-xs mb-3 hidden"></p>
          <div class="flex justify-end gap-3">
            <button class="cancel-btn px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium text-sm hover:bg-slate-50 transition">${cancelText}</button>
            <button class="confirm-btn px-4 py-2 rounded-xl text-white font-medium text-sm ${confirmClass} transition">${confirmText}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      lucide.createIcons({ attrs: { width: 20, height: 20 } });

      const input = overlay.querySelector("#prompt-input");
      const toggleBtn = overlay.querySelector("#toggle-prompt-password");
      const errorEl = overlay.querySelector("#prompt-error");

      toggleBtn.addEventListener("click", () => {
        const isPassword = input.getAttribute("type") === "password";
        input.setAttribute("type", isPassword ? "text" : "password");
        toggleBtn.innerHTML = isPassword
          ? '<i data-lucide="eye-off" class="w-4 h-4"></i>'
          : '<i data-lucide="eye" class="w-4 h-4"></i>';
        lucide.createIcons();
      });

      overlay.querySelector(".cancel-btn").onclick = () => {
        overlay.remove();
        resolve(null);
      };
      overlay.querySelector(".confirm-btn").onclick = () => {
        const val = input.value.trim();
        if (val.length < 6) {
          errorEl.textContent = "Mật khẩu phải có ít nhất 6 ký tự";
          errorEl.classList.remove("hidden");
          return;
        }
        overlay.remove();
        resolve(val);
      };
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          overlay.remove();
          resolve(null);
        }
      });
      // Focus vào input
      input.focus();
    });
  }
}