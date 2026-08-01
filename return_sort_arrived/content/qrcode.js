// Sử dụng thư viện QRCode.js đã tải về lib/qrcode.min.js
// File này được load như một content script? Không, ta có thể dùng dynamic import hoặc load script.
// Cách đơn giản: thêm qrcode.min.js vào content_scripts (để tránh rắc rối, ta có thể copy nội dung vào đây)
// Nhưng để giữ gọn, tôi hướng dẫn: đổi qrcode.js thành:
const qrScript = document.createElement('script');
qrScript.src = chrome.runtime.getURL('lib/qrcode.min.js');
document.head.appendChild(qrScript);
// Sau khi script load, dùng global QRCode
export async function generateQR(text) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        QRCode.toCanvas(canvas, text, { width: 200 }, (error) => {
            if (error) console.error(error);
            resolve(canvas.toDataURL());
        });
    });
}