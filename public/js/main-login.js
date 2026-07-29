// public/js/main-login.js
import { login, checkSession } from './services/auth.js';

class LoginController {
    constructor() {
        this.form = document.getElementById('login-form');
        this.emailInput = document.getElementById('email');
        this.passwordInput = document.getElementById('password');
        this.toggleBtn = document.getElementById('toggle-password');
        this.submitBtn = document.getElementById('submit-btn');
        this.errorEl = document.getElementById('error-message');
        this.rememberCheck = document.getElementById('remember-email');

        this.init();
    }

    init() {
        // 1. Kiểm tra nếu đã có token hợp lệ → chuyển trang
        this.autoLogin();

        // 2. Focus vào ô email
        this.emailInput.focus();

        // 3. Tải email đã ghi nhớ (nếu có)
        const savedEmail = localStorage.getItem('remembered_email');
        if (savedEmail) {
            this.emailInput.value = savedEmail;
            this.rememberCheck.checked = true;
        }

        // 4. Gán sự kiện
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.toggleBtn.addEventListener('click', () => this.togglePassword());
    }

    async autoLogin() {
        const token = localStorage.getItem('qc_session_token');
        if (!token) return;
        const isValid = await checkSession(token);
        if (isValid) {
            window.location.replace('/index.html');
        } else {
            localStorage.removeItem('qc_session_token');
        }
    }

    togglePassword() {
        const type = this.passwordInput.type === 'password' ? 'text' : 'password';
        this.passwordInput.type = type;
        // Đổi icon mắt (nếu dùng Lucide thì cập nhật sau)
    }

    async handleSubmit(e) {
        e.preventDefault();
        const email = this.emailInput.value.trim();
        const password = this.passwordInput.value;

        // Validate cơ bản
        if (!email || !password) {
            this.showError('Vui lòng nhập email và mật khẩu');
            return;
        }

        // Xóa lỗi cũ, bật loading
        this.hideError();
        this.setLoading(true);

        try {
            const data = await login(email, password);
            // Lưu token
            localStorage.setItem('qc_session_token', data.token);

            // Giải mã email từ token
            try {
                const payload = JSON.parse(atob(data.token.split('.')[0]));
                if (payload.email) {
                    localStorage.setItem('user_email', payload.email);
                }
            } catch { }

            // Ghi nhớ email nếu chọn
            if (this.rememberCheck.checked) {
                localStorage.setItem('remembered_email', email);
            } else {
                localStorage.removeItem('remembered_email');
            }

            // Chuyển hướng
            window.location.replace('/index.html');
        } catch (err) {
            this.showError(err.message);
            // Thêm class shake cho input
            this.passwordInput.classList.add('shake');
            setTimeout(() => this.passwordInput.classList.remove('shake'), 300);
        } finally {
            this.setLoading(false);
        }
    }

    showError(msg) {
        this.errorEl.textContent = msg;
        this.errorEl.classList.remove('hidden');
    }

    hideError() {
        this.errorEl.classList.add('hidden');
    }

    setLoading(state) {
        this.submitBtn.disabled = state;
        // Thay đổi nội dung nút: có spinner hoặc chữ "Đang đăng nhập..."
    }
}

// Khởi chạy khi DOM ready
document.addEventListener('DOMContentLoaded', () => new LoginController());