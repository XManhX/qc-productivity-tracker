import { login, checkSession } from './services/auth.js';

class LoginController {
    constructor() {
        this.form = document.getElementById('login-form');
        this.emailInput = document.getElementById('email');
        this.passwordInput = document.getElementById('password');
        this.toggleBtn = document.getElementById('toggle-password');
        this.submitBtn = document.getElementById('submit-btn');
        this.btnText = document.getElementById('btn-text');
        this.btnSpinner = document.getElementById('btn-spinner');
        this.errorEl = document.getElementById('error-message');
        this.rememberCheck = document.getElementById('remember-email');

        // Khởi tạo
        this.init();
    }

    init() {
        // Tự động đăng nhập nếu token còn hạn
        this.autoLogin();

        // Focus vào email
        this.emailInput.focus();

        // Tải email đã ghi nhớ
        this.loadRememberedEmail();

        // Sự kiện
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.toggleBtn.addEventListener('click', () => this.togglePassword());
        // Đồng bộ icon Lucide (vì chúng ta thêm động)
        if (typeof lucide !== 'undefined') lucide.createIcons();
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

    loadRememberedEmail() {
        const saved = localStorage.getItem('remembered_email');
        if (saved) {
            this.emailInput.value = saved;
            this.rememberCheck.checked = true;
        }
    }

    togglePassword() {
        const currentType = this.passwordInput.type;
        const newType = currentType === 'password' ? 'text' : 'password';
        this.passwordInput.type = newType;

        // Đổi icon Lucide
        const icon = this.toggleBtn.querySelector('i');
        if (icon) {
            const newIcon = newType === 'password' ? 'eye-off' : 'eye';
            icon.setAttribute('data-lucide', newIcon);
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    async handleSubmit(e) {
        e.preventDefault();
        const email = this.emailInput.value.trim();
        const password = this.passwordInput.value;

        // Validate cơ bản
        if (!email || !password) {
            this.showError('Vui lòng nhập đầy đủ email và mật khẩu.');
            return;
        }

        this.hideError();
        this.setLoading(true);

        try {
            const data = await login(email, password);
            // Lưu token
            localStorage.setItem('qc_session_token', data.token);

            // Giải mã để lấy email (nếu có)
            try {
                const payload = JSON.parse(atob(data.token.split('.')[0]));
                if (payload.email) localStorage.setItem('user_email', payload.email);
            } catch { }

            // Ghi nhớ email
            if (this.rememberCheck.checked) {
                localStorage.setItem('remembered_email', email);
            } else {
                localStorage.removeItem('remembered_email');
            }

            // Chuyển hướng
            window.location.replace('/index.html');
        } catch (err) {
            this.showError(err.message || 'Đăng nhập thất bại.');
            // Rung input mật khẩu
            this.passwordInput.classList.add('shake');
            setTimeout(() => this.passwordInput.classList.remove('shake'), 350);
        } finally {
            this.setLoading(false);
        }
    }

    setLoading(loading) {
        this.submitBtn.disabled = loading;
        if (loading) {
            this.btnText.classList.add('hidden');
            this.btnSpinner.classList.remove('hidden');
        } else {
            this.btnText.classList.remove('hidden');
            this.btnSpinner.classList.add('hidden');
        }
    }

    showError(msg) {
        this.errorEl.textContent = msg;
        this.errorEl.classList.remove('hidden');
    }

    hideError() {
        this.errorEl.classList.add('hidden');
    }
}

// Khởi động khi DOM ready
document.addEventListener('DOMContentLoaded', () => new LoginController());