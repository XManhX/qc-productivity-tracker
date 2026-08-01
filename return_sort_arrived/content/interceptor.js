export default function initInterceptor(stateManager) {
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
        const response = await origFetch.apply(this, args);
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        if (url && url.includes('/arrival/scan_sheet_id')) {
            const clone = response.clone();
            clone.json().then(data => {
                if (data.retcode === 0 && data.data?.list?.length) {
                    const rv = data.data.list[0].return_no;
                    if (rv) stateManager.handleScan(rv);
                }
            }).catch(() => { });
        }
        return response;
    };
}