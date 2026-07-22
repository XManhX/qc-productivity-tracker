import { userStore } from "../store/UserStore.js";
import { showToast } from "../utils/toast.js";
import { escapeHtml } from "../utils/escapeHtml.js";

export class ImportSection {
  constructor(container) {
    this.container = container;
    this.importedRows = [];
    this.isImporting = false; // cờ trạng thái import
    this._render();
    this._bindEvents();
    userStore.on("update", () => this._updateBulkRoleDropdown());
  }

  _render() {
    this.container.innerHTML = `
      <div class="border-t border-slate-100 pt-6">
        <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Import từ Excel / CSV</h3>
        <p class="text-slate-400 text-xs mb-3">
          Tải file Excel hoặc CSV có các cột: <strong>Email</strong>, <strong>Họ tên</strong> và <strong>role_key</strong>. 
          Mỗi dòng bắt buộc phải có <strong>role_key</strong> (ví dụ: qc_rr, qc_cb). 
          Nếu email đã tồn tại, hệ thống sẽ tự động cập nhật tên/role nếu có thay đổi.
        </p>
        <div id="import-dropzone" class="import-dropzone border-2 border-dashed border-slate-200 rounded-xl p-4 text-center bg-slate-50 transition">
          <input type="file" id="excel-file" accept=".xlsx,.xls,.csv" class="hidden" />
          <div class="flex flex-col items-center justify-center gap-2 py-3">
            <i data-lucide="file-spreadsheet" class="w-8 h-8 text-indigo-500"></i>
            <p class="text-sm font-semibold text-slate-700">Kéo thả file vào đây hoặc chọn file</p>
            <p class="text-[11px] text-slate-400">Hỗ trợ .xlsx, .xls, .csv</p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2 mt-3">
          <button id="import-file-btn" class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm py-2.5 rounded-xl transition shadow-sm">Chọn File</button>
          <button id="download-template-btn" class="px-3 py-2.5 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold transition">Tải Mẫu CSV</button>
        </div>
        <div id="import-preview" class="hidden mt-4 border border-slate-200 rounded-xl overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
            <div>
              <p class="text-sm font-semibold text-slate-800">Xem trước dữ liệu</p>
              <p id="import-summary" class="text-xs text-slate-400">0 dòng sẵn sàng</p>
            </div>
            <button id="import-submit-btn" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50" disabled>Import Ngay</button>
          </div>
          <div class="overflow-x-auto max-h-56 overflow-y-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead class="bg-white border-b border-slate-100"><tr><th class="px-4 py-2 text-slate-500">#</th><th class="px-4 py-2 text-slate-500">Họ tên</th><th class="px-4 py-2 text-slate-500">Email</th><th class="px-4 py-2 text-slate-500">Role</th></tr></thead>
              <tbody id="import-preview-body" class="divide-y divide-slate-100"></tbody>
            </table>
          </div>
          <!-- Thanh tiến trình import -->
          <div id="import-progress" class="hidden px-4 py-3 bg-slate-50 border-t border-slate-200">
            <div class="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span id="progress-text">Đang xử lý...</span>
              <span id="progress-count">0/0</span>
            </div>
            <div class="w-full bg-slate-200 rounded-full h-1.5">
              <div id="progress-bar" class="bg-indigo-500 h-1.5 rounded-full transition-all" style="width: 0%"></div>
            </div>
          </div>
        </div>
        <!-- Bulk Add -->
        <div class="mt-6 border-t border-slate-100 pt-6">
          <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Thêm Hàng Loạt (Bulk Add)</h3>
          <p class="text-slate-400 text-xs mb-3">Copy và dán danh sách Email vào bên dưới (các email phân cách nhau bởi dấu phẩy, dấu cách hoặc xuống dòng).</p>
          <textarea id="bulk-emails" rows="5" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition" placeholder="user1@shopee.com, user2@shopee.com&#10;user3@shopee.com"></textarea>
          <div class="mt-3">
            <label class="text-xs font-semibold text-slate-600">Role mặc định:</label>
            <select id="bulk-role" class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"></select>
          </div>
          <button id="bulk-add-btn" class="w-full mt-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm py-2.5 rounded-xl transition shadow-sm flex items-center justify-center gap-2">
            <i data-lucide="users-2" class="w-4 h-4"></i> Kích Hoạt Danh Sách Hàng Loạt
          </button>
        </div>
      </div>
    `;
    lucide.createIcons();
    this._updateBulkRoleDropdown();
  }

  _updateBulkRoleDropdown() {
    const select = this.container.querySelector("#bulk-role");
    if (!select) return;
    select.innerHTML = "";
    userStore.state.roles.forEach((role) => {
      const opt = document.createElement("option");
      opt.value = role.role_key;
      opt.textContent = role.display_name || role.role_key;
      select.appendChild(opt);
    });
  }

  _bindEvents() {
    const fileInput = this.container.querySelector("#excel-file");
    const dropzone = this.container.querySelector("#import-dropzone");
    this.container
      .querySelector("#import-file-btn")
      .addEventListener("click", () => fileInput.click());
    this.container
      .querySelector("#download-template-btn")
      .addEventListener("click", () => {
        const csv =
          "Họ và tên,Email,role_key\nNguyễn Văn A,nguyenvana@shopee.com,qc_rr\nTrần Thị B,tranthib@shopee.com,qc_cb";
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "qc-users-template.csv";
        a.click();
        URL.revokeObjectURL(url);
      });
    fileInput.addEventListener("change", (e) => {
      if (e.target.files[0]) this._handleFile(e.target.files[0]);
    });
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () =>
      dropzone.classList.remove("dragover"),
    );
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer.files[0]) this._handleFile(e.dataTransfer.files[0]);
    });
    this.container
      .querySelector("#import-submit-btn")
      .addEventListener("click", () => this._importPreparedRows());
    this.container
      .querySelector("#bulk-add-btn")
      .addEventListener("click", () => this._handleBulkAdd());
  }

  _handleFile(file) {
    const reader = new FileReader();
    this.importedRows = [];
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, {
          type: file.name.endsWith(".csv") ? "string" : "array",
        });
        if (!wb.SheetNames.length) {
          showToast("File không có sheet dữ liệu", "error");
          this._renderImportPreview();
          return;
        }
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        this.importedRows = this._buildImportRows(rows);
      } catch (err) {
        showToast("Không thể đọc file: " + err.message, "error");
      }
      this._renderImportPreview();
      if (this.importedRows.length) {
        showToast(
          `Đọc được ${this.importedRows.length} dòng hợp lệ`,
          "success",
        );
      } else {
        showToast(
          "Không tìm thấy dòng nào có đủ email và role_key. Kiểm tra lại file.",
          "error",
        );
      }
    };
    reader.onerror = () => {
      showToast("Lỗi đọc file", "error");
      this._renderImportPreview();
    };
    if (file.name.endsWith(".csv")) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  }

  _buildImportRows(data) {
    if (!Array.isArray(data) || data.length === 0) return [];
    const firstRow = data[0] || {};
    const headers = Object.keys(firstRow);

    const findColumn = (possibleNames) => {
      const normalized = possibleNames.map((p) =>
        p.toLowerCase().replace(/\s+/g, ""),
      );
      return headers.find((h) => {
        const clean = h.toLowerCase().replace(/\s+/g, "");
        return normalized.includes(clean);
      });
    };

    const emailCol = findColumn(["email", "e-mail", "e_mail", "mail"]);
    const nameCol = findColumn([
      "name",
      "họ và tên",
      "ho va ten",
      "full name",
      "fullname",
      "tên",
    ]);
    const roleCol = findColumn([
      "role_key",
      "role",
      "role key",
      "rolekey",
      "vai trò",
    ]);

    if (!emailCol || !roleCol) return [];

    return data
      .map((row) => {
        const email = (row[emailCol] || "").toString().toLowerCase().trim();
        const name = nameCol ? (row[nameCol] || "").toString().trim() : "";
        const role_key = (row[roleCol] || "").toString().trim();
        return {
          email,
          name: name || email.split("@")[0].toUpperCase(),
          role_key,
        };
      })
      .filter((r) => r.email && r.role_key);
  }

  _renderImportPreview() {
    const preview = this.container.querySelector("#import-preview");
    const body = this.container.querySelector("#import-preview-body");
    const summary = this.container.querySelector("#import-summary");
    const btn = this.container.querySelector("#import-submit-btn");
    const progressDiv = this.container.querySelector("#import-progress");
    if (!this.importedRows.length) {
      preview.classList.add("hidden");
      btn.disabled = true;
      progressDiv.classList.add("hidden");
      return;
    }
    preview.classList.remove("hidden");
    summary.textContent = `${this.importedRows.length} dòng sẵn sàng`;
    btn.disabled = false;
    progressDiv.classList.add("hidden"); // Ẩn progress khi chưa import
    body.innerHTML = this.importedRows
      .slice(0, 10)
      .map(
        (r, i) =>
          `<tr><td>${i + 1}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.email)}</td><td>${escapeHtml(r.role_key)}</td></tr>`,
      )
      .join("");
    if (this.importedRows.length > 10)
      body.innerHTML += `<tr><td colspan="4" class="text-center text-slate-400">... và ${this.importedRows.length - 10} dòng khác</td></tr>`;
  }

  async _importPreparedRows() {
    if (!this.importedRows.length || this.isImporting) return;
    this.isImporting = true;

    const payload = this.importedRows.map((r) => ({
      email: r.email,
      name: r.name,
      role_key: r.role_key,
    }));
    const total = payload.length;

    if (!confirm(`Import ${total} nhân sự?`)) {
      this.isImporting = false;
      return;
    }

    const btn = this.container.querySelector("#import-submit-btn");
    const progressDiv = this.container.querySelector("#import-progress");
    const progressText = this.container.querySelector("#progress-text");
    const progressCount = this.container.querySelector("#progress-count");
    const progressBar = this.container.querySelector("#progress-bar");
    const preview = this.container.querySelector("#import-preview");

    btn.disabled = true;
    btn.textContent = "Đang import...";
    progressDiv.classList.remove("hidden");
    progressText.textContent = "Đang xử lý...";
    progressCount.textContent = `0/${total}`;
    progressBar.style.width = "0%";

    try {
      const result = await userStore.importWithUpsert(
        payload,
        ({ processed, total, created, updated, errors }) => {
          // Cập nhật giao diện tiến trình
          progressCount.textContent = `${processed}/${total}`;
          progressBar.style.width = `${(processed / total) * 100}%`;
          progressText.textContent = `Đã tạo ${created}, cập nhật ${updated}, lỗi ${errors}`;
        },
      );

      const { created, updated, errors } = result;
      let msg = `✅ Import hoàn tất: ${created} mới`;
      if (updated) msg += `, ${updated} cập nhật`;
      if (errors) msg += `, ${errors} lỗi`;
      showToast(msg);

      // Reset sau khi hoàn thành
      this.importedRows = [];
      this._renderImportPreview();
      this.container.querySelector("#excel-file").value = "";
    } catch (err) {
      showToast("❌ " + err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Import Ngay";
      this.isImporting = false;
      // Ẩn thanh tiến trình sau 2 giây (để người dùng thấy kết quả)
      setTimeout(() => {
        progressDiv.classList.add("hidden");
      }, 2000);
    }
  }

  async _handleBulkAdd() {
    const raw = this.container.querySelector("#bulk-emails").value;
    const role_key = this.container.querySelector("#bulk-role").value;
    const emails = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    if (!emails?.length)
      return showToast("Không tìm thấy email hợp lệ", "error");
    if (
      !confirm(
        `Thêm ${emails.length} email với role '${role_key || "mặc định"}'?`,
      )
    )
      return;
    const result = await userStore.bulkAddUsers(emails, role_key);
    showToast(`✅ ${result.success} thành công, ❌ ${result.failed} thất bại`);
    this.container.querySelector("#bulk-emails").value = "";
  }
}
