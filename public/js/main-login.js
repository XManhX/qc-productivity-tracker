// public/js/main-login.js
import { login, checkSession } from './services/auth.js';

const QUOTES = [
    "“Chất lượng là danh tiếng, năng suất là sức mạnh.”",
    "“Đo lường được mới cải tiến được.” — Peter Drucker",
    "“Không có kiểm soát chất lượng, chỉ có niềm tin mù quáng.”",
    "“Mỗi con số là một câu chuyện. Hãy đọc nó.”",
    "“Năng suất không đến từ sự bận rộn, mà từ sự tập trung.”",
    "“QC là nghệ thuật biến dữ liệu thành quyết định.”",
    "“Hôm nay bạn giám sát, ngày mai bạn dẫn đầu.”",
    "“Sự xuất sắc nằm trong từng chi tiết.”",
];

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
        this.init();
    }

    init() {
        this.showRandomQuote()
        this.autoLogin();
        this.emailInput.focus();
        this.loadRememberedEmail();
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.toggleBtn.addEventListener('click', () => this.togglePassword());
    }

    showRandomQuote() {
        const quoteEl = document.getElementById('login-quote');
        if (quoteEl) {
            const randomQuote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
            quoteEl.textContent = randomQuote;
            quoteEl.classList.add('fade-in');
        }
    }

    async autoLogin() {
        const token = localStorage.getItem('qc_session_token');
        if (!token) return;
        const isValid = await checkSession(token);
        if (isValid) window.location.replace('/index.html');
        else localStorage.removeItem('qc_session_token');
    }

    loadRememberedEmail() {
        const saved = localStorage.getItem('remembered_email');
        if (saved) {
            this.emailInput.value = saved;
            this.rememberCheck.checked = true;
        }
    }

    togglePassword() {
        const isPassword = this.passwordInput.type === 'password';
        this.passwordInput.type = isPassword ? 'text' : 'password';

        const eyeOffIcon = document.getElementById('eye-off-icon');
        const eyeIcon = document.getElementById('eye-icon');
        const btn = this.toggleBtn;

        if (eyeOffIcon && eyeIcon) {
            if (isPassword) {
                // Chuyển sang text (hiện mật khẩu)
                eyeOffIcon.classList.add('hidden');
                eyeIcon.classList.remove('hidden');
                btn.setAttribute('title', 'Ẩn mật khẩu');
            } else {
                eyeOffIcon.classList.remove('hidden');
                eyeIcon.classList.add('hidden');
                btn.setAttribute('title', 'Hiển thị mật khẩu');
            }
        }
        btn.classList.add('bg-slate-700/30');
        setTimeout(() => btn.classList.remove('bg-slate-700/30'), 150);
    }

    async handleSubmit(e) {
        e.preventDefault();
        const email = this.emailInput.value.trim();
        const password = this.passwordInput.value;
        if (!email || !password) {
            this.showError('Vui lòng nhập email và mật khẩu.');
            return;
        }
        this.hideError();
        this.setLoading(true);
        try {
            const data = await login(email, password);
            localStorage.setItem('qc_session_token', data.token);
            try {
                const payload = JSON.parse(atob(data.token.split('.')[0]));
                if (payload.email) localStorage.setItem('user_email', payload.email);
            } catch { }
            if (this.rememberCheck.checked) {
                localStorage.setItem('remembered_email', email);
            } else {
                localStorage.removeItem('remembered_email');
            }
            window.location.replace('/index.html');
        } catch (err) {
            this.showError(err.message || 'Đăng nhập thất bại.');
            this.passwordInput.classList.add('shake');
            setTimeout(() => this.passwordInput.classList.remove('shake'), 400);
        } finally {
            this.setLoading(false);
        }
    }

    setLoading(loading) {
        this.submitBtn.disabled = loading;
        this.btnText.classList.toggle('hidden', loading);
        this.btnSpinner.classList.toggle('hidden', !loading);
    }

    showError(msg) {
        this.errorEl.textContent = msg;
        this.errorEl.classList.remove('hidden');
    }
    hideError() {
        this.errorEl.classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', () => new LoginController());