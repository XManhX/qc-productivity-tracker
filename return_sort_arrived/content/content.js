chrome.runtime.connect({ name: 'qc-keepalive' });

(async () => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('content/interceptor.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);

    const { StateManager } = await import(chrome.runtime.getURL('content/stateManager.js'));
    const { UIManager } = await import(chrome.runtime.getURL('content/ui/popup.js'));

    const stored = await chrome.storage.local.get(['masterData']);
    const masterData = stored.masterData || {};

    let email = localStorage.getItem('useremail');
    if (!email) {
        const bodyText = document.body?.innerText || '';
        const match = bodyText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        email = match?.[0] || 'unknown@shopee.com';
        localStorage.setItem('useremail', email);
    }

    const stateManager = new StateManager(masterData, email);

    // Lắng nghe sự kiện từ main world, dùng queue của StateManager
    document.addEventListener('qc-rv-detected', (e) => {
        stateManager.handleDetected(e.detail.rv);
    });

    document.addEventListener('qc-rv-arrived', (e) => {
        stateManager.handleArrived(e.detail.rv);
    });

    // Khởi tạo UI khi DOM sẵn sàng
    function initUI() {
        new UIManager(stateManager);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.masterData) stateManager.updateMasterData(changes.masterData.newValue);
    });
})();