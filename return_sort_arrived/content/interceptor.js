// content/interceptor.js – luôn dispatch as-rv-arrived, không phân biệt lỗi
(function () {
    if (window.__asInterceptorInjected) return;
    window.__asInterceptorInjected = true;

    console.log('[AS Interceptor] Injecting into main world...');

    let pendingRV = null;

    function notifyArrived(rv) {
        document.dispatchEvent(new CustomEvent('as-rv-arrived', { detail: { rv } }));
    }

    // Tìm nút Complete (không phân biệt hoa thường)
    function findCompleteButton() {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            if ((btn.textContent || '').trim().toLowerCase() === 'complete') return btn;
        }
        return null;
    }

    function clickComplete() {
        const btn = findCompleteButton();
        if (btn) {
            console.log('[AS Interceptor] Clicking Complete button...');
            btn.click();
            return true;
        }
        return false;
    }

    function waitAndClickComplete(retries = 20, interval = 300) {
        return new Promise(resolve => {
            let attempts = 0;
            const timer = setInterval(() => {
                if (clickComplete()) {
                    clearInterval(timer);
                    resolve(true);
                } else if (++attempts >= retries) {
                    clearInterval(timer);
                    console.warn('[AS Interceptor] Complete button not found after retries');
                    resolve(false);
                }
            }, interval);
        });
    }

    // ---- URL change detection (React Router) ----
    function notifyUrlChange(url) {
        document.dispatchEvent(new CustomEvent('url-change', { detail: { url } }));
    }

    const origPushState = history.pushState;
    const origReplaceState = history.replaceState;

    history.pushState = function (...args) {
        origPushState.apply(this, args);
        notifyUrlChange(window.location.href);
    };

    history.replaceState = function (...args) {
        origReplaceState.apply(this, args);
        notifyUrlChange(window.location.href);
    };

    window.addEventListener('popstate', () => {
        notifyUrlChange(window.location.href);
    });

    notifyUrlChange(window.location.href);

    // ---- Intercept fetch ----
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;

        // Lưu sheet_id từ request payload nếu là scan_sheet_id
        if (url && url.includes('scan_sheet_id')) {
            try {
                const body = args[0]?.body;
                if (typeof body === 'string') {
                    const parsed = JSON.parse(body);
                    pendingRV = parsed.sheet_id || null; // luôn lấy sheet_id làm RV
                }
            } catch (e) { }
        }

        const response = await origFetch.apply(this, args);

        if (url && url.includes('scan_sheet_id')) {
            const clone = response.clone();
            clone.json().then(async data => {
                if (data.retcode === 0 && data.data?.list?.length) {
                    // Thành công -> lấy return_no
                    const rv = data.data.list[0].return_no;
                    if (rv) {
                        pendingRV = rv;
                        notifyArrived(rv);
                        await waitAndClickComplete();
                    }
                } else {
                    // Lỗi -> vẫn dispatch với sheet_id
                    if (pendingRV) {
                        notifyArrived(pendingRV);
                    }
                    pendingRV = null;
                }
            }).catch(e => console.error('[AS Interceptor] fetch parse error:', e));
        }

        return response;
    };

    // ---- Intercept XMLHttpRequest ----
    const OrigXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function () {
        const xhr = new OrigXHR();
        const origOpen = xhr.open;
        const origSend = xhr.send;
        let requestURL = '';

        xhr.open = function (method, url, ...rest) {
            requestURL = url;
            return origOpen.apply(this, [method, url, ...rest]);
        };

        xhr.send = function (...args) {
            if (requestURL && requestURL.includes('scan_sheet_id')) {
                try {
                    const body = args[0];
                    if (typeof body === 'string') {
                        const parsed = JSON.parse(body);
                        pendingRV = parsed.sheet_id || null;
                    }
                } catch (e) { }
            }

            this.addEventListener('load', async function () {
                if (requestURL && requestURL.includes('scan_sheet_id')) {
                    try {
                        const data = JSON.parse(this.responseText);
                        if (data.retcode === 0 && data.data?.list?.length) {
                            const rv = data.data.list[0].return_no;
                            if (rv) {
                                pendingRV = rv;
                                notifyArrived(rv);
                                await waitAndClickComplete();
                            }
                        } else {
                            if (pendingRV) {
                                notifyArrived(pendingRV);
                            }
                            pendingRV = null;
                        }
                    } catch (e) {
                        console.error(e);
                    }
                }
            });
            return origSend.apply(this, args);
        };

        return xhr;
    };

    ['UNSENT', 'OPENED', 'HEADERS_RECEIVED', 'LOADING', 'DONE'].forEach(p => {
        window.XMLHttpRequest[p] = OrigXHR[p];
    });

    console.log('[AS Interceptor] Interceptors active.');
})();