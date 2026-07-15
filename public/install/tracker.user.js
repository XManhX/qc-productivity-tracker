// ==UserScript==
// @name         QC Productivity Tracker
// @namespace    https://qc-productivity-tracker.vercel.app/
// @version      1.0.0
// @description  Hệ thống theo dõi hiệu suất làm việc dành riêng cho QC
// @author       X Manh
// @match        https://*.shopee.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=shopee.com
// @grant        none
// @updateURL    https://qc-productivity-tracker.vercel.app/install/tracker.meta.js
// @downloadURL  https://qc-productivity-tracker.vercel.app/install/tracker.user.js
// ==/UserScript==

(function() {
    'use strict';

    console.log('%c[QC Tracker] %cTool đã được kích hoạt thành công!', 'color: #ff5722; font-weight: bold;', 'color: #000;');

    // Code logic theo dõi của bạn viết ở đây
    // Ví dụ: Tạo một nút nhỏ trên giao diện Shopee để QC tiện theo dõi
    const initTrackerWidget = () => {
        const btn = document.createElement('div');
        btn.innerText = '⏱️ QC Tracker Running';
        btn.style.position = 'fixed';
        btn.style.bottom = '20px';
        btn.style.right = '20px';
        btn.style.zIndex = '99999';
        btn.style.background = '#ff5722';
        btn.style.color = '#fff';
        btn.style.padding = '10px 15px';
        btn.style.borderRadius = '8px';
        btn.style.fontSize = '12px';
        btn.style.fontWeight = 'bold';
        btn.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        btn.style.cursor = 'pointer';

        btn.onclick = () => {
            alert('Xin chào! Tool của bạn đang chạy phiên bản 1.0.0 ổn định.');
        };

        document.body.appendChild(btn);
    };

    // Đợi trang load hoàn tất rồi mới chèn widget vào
    if (document.readyState === 'complete') {
        initTrackerWidget();
    } else {
        window.addEventListener('load', initTrackerWidget);
    }
})();