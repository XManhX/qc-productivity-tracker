// content/content.js – chỉ lắng nghe as-rv-arrived
chrome.runtime.connect({ name: 'as-keepalive' });

(async () => {
    const interceptorScript = document.createElement('script');
    interceptorScript.src = chrome.runtime.getURL('content/interceptor.js');
    interceptorScript.onload = () => interceptorScript.remove();
    (document.head || document.documentElement).appendChild(interceptorScript);

    const qrGenScript = document.createElement('script');
    qrGenScript.src = chrome.runtime.getURL('content/qr-generator.js');
    qrGenScript.onload = () => qrGenScript.remove();
    (document.head || document.documentElement).appendChild(qrGenScript);

    const { StateManager } = await import(chrome.runtime.getURL('content/stateManager.js'));
    const { UIManager } = await import(chrome.runtime.getURL('content/ui/popup.js'));
    const { DashboardUI } = await import(chrome.runtime.getURL('content/ui/dashboard.js'));

    const stored = await chrome.storage.local.get(['masterData']);
    const masterData = stored.masterData || {};

    let email = localStorage.getItem('useremail');
    if (!email) {
        if (document.body) {
            const match = document.body.innerText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
            email = match ? match[0] : 'unknown@shopee.com';
        } else email = 'unknown@shopee.com';
        localStorage.setItem('useremail', email);
    }

    const stateManager = new StateManager(masterData, email);

    // Chỉ lắng nghe sự kiện as-rv-arrived
    document.addEventListener('as-rv-arrived', (e) => stateManager.handleArrived(e.detail.rv));

    function initUI() {
        new UIManager(stateManager);
        new DashboardUI(stateManager);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI);
    else initUI();

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.masterData) stateManager.updateMasterData(changes.masterData.newValue);
    });
})();