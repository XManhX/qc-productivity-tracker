// content/content.js – xử lý triệt để lỗi context invalidated
let keepAlivePort = null;
let keepAliveTimer = null;
let keepAliveAttempts = 0;
const MAX_ATTEMPTS = 5;

// Wrapper an toàn cho các Chrome API
function safeCall(fn, fallback = () => { }) {
    try {
        return fn();
    } catch (e) {
        if (e.message?.includes('Extension context invalidated')) {
            console.warn('[Content] Extension context không còn hợp lệ, dừng thao tác');
            // Không làm gì thêm, tránh crash
        } else {
            console.error('[Content] Chrome API error:', e);
            fallback();
        }
    }
}

function connectKeepAlive() {
    // Kiểm tra context
    if (!chrome?.runtime?.connect) {
        console.warn('[Content] Không thể kết nối keep-alive: context không hợp lệ');
        return;
    }

    safeCall(() => {
        keepAlivePort = chrome.runtime.connect({ name: 'as-keepalive' });
        console.log('[Content] Keep-alive port connected (attempt ' + (keepAliveAttempts + 1) + ')');

        keepAlivePort.onDisconnect.addListener(() => {
            console.log('[Content] Keep-alive port disconnected');
            keepAlivePort = null;

            // Chiến lược thử lại với thời gian tăng dần
            if (keepAliveAttempts < MAX_ATTEMPTS) {
                const delay = Math.min(1000 * Math.pow(2, keepAliveAttempts), 30000); // tối đa 30s
                keepAliveAttempts++;
                console.log(`[Content] Thử kết nối lại sau ${delay / 1000}s...`);
                keepAliveTimer = setTimeout(connectKeepAlive, delay);
            } else {
                console.warn('[Content] Đã thử kết nối lại tối đa, dừng keep-alive');
            }
        });

        // Reset số lần thử nếu kết nối thành công
        keepAliveAttempts = 0;
    });
}

// Bắt đầu kết nối
connectKeepAlive();

// Bọc toàn bộ logic chính trong try-catch an toàn
(async () => {
    try {
        // Inject interceptor
        safeCall(() => {
            const interceptorScript = document.createElement('script');
            interceptorScript.src = chrome.runtime.getURL('content/interceptor.js');
            interceptorScript.onload = () => interceptorScript.remove();
            (document.head || document.documentElement).appendChild(interceptorScript);
        });

        // Inject QR generator
        safeCall(() => {
            const qrGenScript = document.createElement('script');
            qrGenScript.src = chrome.runtime.getURL('content/qr-generator.js');
            qrGenScript.onload = () => qrGenScript.remove();
            (document.head || document.documentElement).appendChild(qrGenScript);
        });

        // Import modules
        const { StateManager } = await import(chrome.runtime.getURL('content/stateManager.js'));
        const { UIManager } = await import(chrome.runtime.getURL('content/ui/popup.js'));
        const { DashboardUI } = await import(chrome.runtime.getURL('content/ui/dashboard.js'));

        // Lấy master data
        const stored = await new Promise((resolve) => {
            safeCall(() => {
                chrome.storage.local.get(['masterData'], (result) => {
                    resolve(result);
                });
            }, () => resolve({})); // fallback nếu lỗi
        });
        const masterData = stored?.masterData || {};

        // Lấy email
        let email = 'unknown@shopee.com';
        try {
            email = localStorage.getItem('useremail');
            if (!email && document.body) {
                const match = document.body.innerText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
                if (match) email = match[0];
                localStorage.setItem('useremail', email);
            }
        } catch (e) {
            console.warn('[Content] Không thể lấy email:', e);
        }

        const stateManager = new StateManager(masterData, email);

        // Lắng nghe sự kiện
        document.addEventListener('as-rv-arrived', (e) => {
            safeCall(() => stateManager.handleArrived(e.detail.rv));
        });

        // Khởi tạo UI
        function initUI() {
            safeCall(() => {
                new UIManager(stateManager);
                new DashboardUI(stateManager);
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initUI);
        } else {
            initUI();
        }

        // Lắng nghe thay đổi master data
        safeCall(() => {
            chrome.storage.onChanged.addListener((changes) => {
                if (changes.masterData) {
                    stateManager.updateMasterData(changes.masterData.newValue);
                }
            });
        });

    } catch (e) {
        console.error('[Content] Lỗi nghiêm trọng khi khởi tạo:', e);
    }
})();