(async () => {
    // Dynamic import các module nội bộ
    const { default: initInterceptor } = await import(chrome.runtime.getURL('content/interceptor.js'));
    const { StateManager } = await import(chrome.runtime.getURL('content/stateManager.js'));
    const { UIManager } = await import(chrome.runtime.getURL('content/ui/popup.js'));

    // Lấy master data từ storage.local
    const stored = await chrome.storage.local.get(['masterData']);
    const masterData = stored.masterData || {};

    // Lấy email (từ localStorage hoặc DOM)
    let email = localStorage.getItem('useremail');
    if (!email) {
        const match = document.body.innerText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        email = match ? match[0] : 'unknown@shopee.com';
    }

    // Khởi tạo StateManager (chỉ dùng API server)
    const stateManager = new StateManager(masterData, email);

    // Khởi tạo UI
    new UIManager(stateManager);

    // Kích hoạt interceptor để bắt API WMS
    initInterceptor(stateManager);

    // Lắng nghe cập nhật master data từ background
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.masterData) {
            stateManager.updateMasterData(changes.masterData.newValue);
        }
    });
})();