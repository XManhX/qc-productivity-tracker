// content/content.js
function isExtensionContextValid() {
    try { return !!(chrome.runtime && chrome.runtime.id); }
    catch (e) { return false; }
}

function safeStorageGet(keys, callback) {
    if (!isExtensionContextValid()) { callback({}); return; }
    chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) { callback({}); }
        else { callback(result); }
    });
}

function safeGetURL(path) {
    if (!isExtensionContextValid()) return '';
    return chrome.runtime.getURL(path);
}

function safeRuntimeConnect(name) {
    if (!isExtensionContextValid()) return null;
    try { return chrome.runtime.connect({ name }); }
    catch (e) { return null; }
}

let keepAlivePort = null;
let keepAliveTimer = null;
let keepAliveAttempts = 0;
const MAX_KEEP_ALIVE_ATTEMPTS = 5;

function connectKeepAlive() {
    if (!isExtensionContextValid()) {
        keepAliveTimer = setTimeout(connectKeepAlive, 1000);
        return;
    }
    keepAlivePort = safeRuntimeConnect('as-keepalive');
    if (!keepAlivePort) {
        if (keepAliveAttempts < MAX_KEEP_ALIVE_ATTEMPTS) {
            const delay = Math.min(1000 * Math.pow(2, keepAliveAttempts), 30000);
            keepAliveAttempts++;
            keepAliveTimer = setTimeout(connectKeepAlive, delay);
        }
        return;
    }
    console.log('[Content] Keep-alive connected');
    keepAlivePort.onDisconnect.addListener(() => {
        keepAlivePort = null;
        if (keepAliveAttempts < MAX_KEEP_ALIVE_ATTEMPTS) {
            const delay = Math.min(1000 * Math.pow(2, keepAliveAttempts), 30000);
            keepAliveAttempts++;
            keepAliveTimer = setTimeout(connectKeepAlive, delay);
        }
    });
    keepAliveAttempts = 0;
}

if (document.readyState === 'complete') connectKeepAlive();
else window.addEventListener('load', connectKeepAlive);

(async () => {
    try {
        const interceptorUrl = safeGetURL('content/interceptor.js');
        if (interceptorUrl) {
            const script = document.createElement('script');
            script.src = interceptorUrl;
            script.onload = () => script.remove();
            (document.head || document.documentElement).appendChild(script);
        }

        const qrGenUrl = safeGetURL('content/qr-generator.js');
        if (qrGenUrl) {
            const script = document.createElement('script');
            script.src = qrGenUrl;
            script.onload = () => script.remove();
            (document.head || document.documentElement).appendChild(script);
        }

        const { StateManager } = await import(chrome.runtime.getURL('content/stateManager.js'));
        const { UIManager } = await import(chrome.runtime.getURL('content/ui/popup.js'));
        const { DashboardUI } = await import(chrome.runtime.getURL('content/ui/dashboard.js'));

        safeStorageGet(['masterData'], (stored) => {
            const masterData = stored?.masterData || {};
            let email = 'unknown@shopee.com';
            try {
                email = localStorage.getItem('useremail');
                if (!email && document.body) {
                    const match = document.body.innerText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
                    if (match) email = match[0];
                    localStorage.setItem('useremail', email);
                }
            } catch (e) { }

            const stateManager = new StateManager(masterData, email);

            document.addEventListener('as-return-tn-arrived', (e) => {
                stateManager.handleArrived(e.detail.return_tn);
            });

            function initUI() {
                new UIManager(stateManager);
                new DashboardUI(stateManager);
            }
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initUI);
            } else {
                initUI();
            }

            if (isExtensionContextValid()) {
                chrome.storage.onChanged.addListener((changes) => {
                    if (changes.masterData) stateManager.updateMasterData(changes.masterData.newValue);
                });
            }
        });
    } catch (e) {
        console.error('[Content] Initialization error:', e);
    }
})();