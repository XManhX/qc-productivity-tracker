export class ConfirmModal {
    static show({ title = 'Xác nhận', message = 'Bạn có chắc chắn?', confirmText = 'Xác nhận', cancelText = 'Hủy', confirmClass = 'bg-rose-600 hover:bg-rose-500' } = {}) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
            overlay.innerHTML = `
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 mx-4">
          <div class="flex items-center gap-3 mb-4">
            <div class="bg-rose-50 p-2 rounded-full text-rose-600"><i data-lucide="alert-triangle" class="w-5 h-5"></i></div>
            <h3 class="text-lg font-bold text-slate-900">${title}</h3>
          </div>
          <p class="text-slate-600 text-sm mb-6">${message}</p>
          <div class="flex justify-end gap-3">
            <button class="cancel-btn px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium text-sm hover:bg-slate-50 transition">${cancelText}</button>
            <button class="confirm-btn px-4 py-2 rounded-xl text-white font-medium text-sm ${confirmClass} transition">${confirmText}</button>
          </div>
        </div>
      `;
            document.body.appendChild(overlay);
            lucide.createIcons({ attrs: { width: 20, height: 20 } });

            overlay.querySelector('.cancel-btn').onclick = () => {
                overlay.remove();
                resolve(false);
            };
            overlay.querySelector('.confirm-btn').onclick = () => {
                overlay.remove();
                resolve(true);
            };
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) { overlay.remove(); resolve(false); }
            });
        });
    }
}