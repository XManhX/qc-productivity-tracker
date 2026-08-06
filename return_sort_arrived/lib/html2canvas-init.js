// lib/html2canvas-init.js
var s = document.createElement('script');
s.src = chrome.runtime.getURL('lib/html2canvas.min.js');
s.onload = function () {
    document.documentElement.setAttribute('data-html2canvas-loaded', '1');
};
s.onerror = function () {
    document.documentElement.setAttribute('data-html2canvas-loaded', '0');
};
document.head.appendChild(s);