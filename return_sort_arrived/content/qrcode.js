// content/qrcode.js
// Sử dụng thư viện qrcode-generator (global: qrcode)
// File: assets/qrcode.min.js (tải từ https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js)

let qrLibReady = false;

async function ensureLib() {
    if (qrLibReady && typeof qrcode !== 'undefined') return;
    // Nếu thư viện đã được load trước đó (qua script tag khác), kiểm tra global
    if (typeof qrcode !== 'undefined') {
        qrLibReady = true;
        return;
    }
    // Load script từ extension assets
    await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('assets/qrcode.min.js');
        script.onload = () => {
            if (typeof qrcode !== 'undefined') {
                qrLibReady = true;
                resolve();
            } else {
                reject(new Error('qrcode global not found'));
            }
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

export async function generateQR(text) {
    await ensureLib();

    const typeNumber = 0;       // auto
    const errorCorrectionLevel = 'L';
    const qr = qrcode(typeNumber, errorCorrectionLevel);
    qr.addData(text);
    qr.make();

    const moduleCount = qr.getModuleCount();
    // Muốn kích thước ảnh QR ~200px
    const cellSize = Math.floor(200 / moduleCount);
    const size = moduleCount * cellSize;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Nền trắng
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    // Vẽ từng module
    ctx.fillStyle = '#000000';
    for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
            if (qr.isDark(row, col)) {
                ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
            }
        }
    }

    return canvas.toDataURL('image/png');
}