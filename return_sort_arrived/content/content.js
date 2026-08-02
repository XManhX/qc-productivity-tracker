// content/content.js
// Giữ service worker sống qua persistent port
chrome.runtime.connect({ name: 'qc-keepalive' });

(async () => {
    // ============================================================
    // 1. Inject interceptor vào main world (bắt API WMS)
    // ============================================================
    const interceptorScript = document.createElement('script');
    interceptorScript.src = chrome.runtime.getURL('content/interceptor.js');
    interceptorScript.onload = () => interceptorScript.remove(); // dọn dẹp sau khi load
    (document.head || document.documentElement).appendChild(interceptorScript);

    // ============================================================
    // 2. Inject QR code generator vào main world (tạo QR offline)
    // ============================================================
    const qrGeneratorScript = document.createElement('script');
    qrGeneratorScript.src = chrome.runtime.getURL('content/qr-generator.js');
    qrGeneratorScript.onload = () => qrGeneratorScript.remove();
    (document.head || document.documentElement).appendChild(qrGeneratorScript);

    // ============================================================
    // 3. Import các module của extension (chạy trong content script)
    // ============================================================
    const { StateManager } = await import(chrome.runtime.getURL('content/stateManager.js'));
    const { UIManager } = await import(chrome.runtime.getURL('content/ui/popup.js'));

    // ============================================================
    // 4. Lấy master data và email
    // ============================================================
    const stored = await chrome.storage.local.get(['masterData']);
    const masterData = stored.masterData || {};

    let email = localStorage.getItem('useremail');
    if (!email) {
        if (document.body) {
            const match = document.body.innerText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
            email = match ? match[0] : 'unknown@shopee.com';
        } else {
            email = 'unknown@shopee.com';
        }
        localStorage.setItem('useremail', email);
    }

    // ============================================================
    // 5. Khởi tạo StateManager và UI
    // ============================================================
    const stateManager = new StateManager(masterData, email);

    // ============================================================
    // 6. Lắng nghe sự kiện từ main world (interceptor)
    // ============================================================
    document.addEventListener('qc-rv-detected', (e) => {
        stateManager.handleDetected(e.detail.rv);
    });

    document.addEventListener('qc-rv-arrived', (e) => {
        stateManager.handleArrived(e.detail.rv);
    });

    // ============================================================
    // 7. Khởi tạo UI khi DOM sẵn sàng
    // ============================================================
    function initUI() {
        new UIManager(stateManager);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }

    // ============================================================
    // 8. Cập nhật master data khi có thay đổi
    // ============================================================
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.masterData) {
            stateManager.updateMasterData(changes.masterData.newValue);
        }
    });
})();