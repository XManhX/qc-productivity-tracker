// lib/load-dependencies.js
(function () {
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            var s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = () => reject(new Error('Failed to load ' + src));
            document.head.appendChild(s);
        });
    }

    var html2canvasUrl = document.documentElement.getAttribute('data-html2canvas-url');
    var jspdfUrl = document.documentElement.getAttribute('data-jspdf-url');

    if (!html2canvasUrl || !jspdfUrl) {
        window.postMessage({ type: 'dependencies-error', message: 'Missing library URLs' }, '*');
        return;
    }

    loadScript(html2canvasUrl)
        .then(() => loadScript(jspdfUrl))
        .then(() => {
            window.postMessage({ type: 'dependencies-ready' }, '*');
        })
        .catch(function (err) {
            window.postMessage({ type: 'dependencies-error', message: err.message }, '*');
        });
})();