// lib/html2canvas-bridge.js (chạy trong main world)
(function () {
    var script = document.createElement('script');
    script.src = chrome.runtime.getURL('lib/html2canvas.min.js');
    script.onload = function () {
        document.documentElement.setAttribute('__html2canvas_ready', 'true');
    };
    script.onerror = function () {
        document.documentElement.setAttribute('__html2canvas_ready', 'false');
    };
    document.head.appendChild(script);
})();