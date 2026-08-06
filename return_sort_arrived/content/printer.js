// content/printer.js

// Hàm tạo QR code (giữ nguyên)
async function generateQRDataUrl(toNumber) {
  try {
    const { generateQR } = await import('./qrcode.js');
    return await generateQR(toNumber);
  } catch (e) {
    console.error('[Printer] QR failed, using fallback:', e);
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0id2hpdGUiLz48L3N2Zz4=';
  }
}

// Biến lưu trạng thái đã inject
let depsReadyPromise = null;
let printerMainReady = false;

// Đảm bảo thư viện html2canvas + jspdf được load vào main world
function ensureDependencies() {
  if (depsReadyPromise) return depsReadyPromise;

  depsReadyPromise = new Promise((resolve, reject) => {
    // Gán URL vào data-attribute trước khi inject loader
    document.documentElement.setAttribute(
      'data-html2canvas-url',
      chrome.runtime.getURL('lib/html2canvas.min.js')
    );
    document.documentElement.setAttribute(
      'data-jspdf-url',
      chrome.runtime.getURL('lib/jspdf.umd.min.js')
    );

    // Inject loader vào main world
    const url = chrome.runtime.getURL('lib/load-dependencies.js');
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => {
      // Lắng nghe message từ main world
      function handler(e) {
        if (e.source !== window) return;
        if (e.data.type === 'dependencies-ready') {
          window.removeEventListener('message', handler);
          resolve();
        } else if (e.data.type === 'dependencies-error') {
          window.removeEventListener('message', handler);
          reject(new Error(e.data.message));
        }
      }
      window.addEventListener('message', handler);
    };
    script.onerror = () => reject(new Error('Cannot inject load-dependencies.js'));
    document.head.appendChild(script);
  });
  return depsReadyPromise;
}

// Đảm bảo printer-main.js được inject
function ensurePrinterMain() {
  if (printerMainReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const url = chrome.runtime.getURL('lib/printer-main.js');
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => {
      printerMainReady = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Cannot inject printer-main.js'));
    document.head.appendChild(script);
  });
}

// Hàm chính export ra ngoài
export async function printLabel(toNumber, type, id, dateStr, number, email, itemCount) {
  // 1. Tạo QR code
  const qrDataUrl = await generateQRDataUrl(toNumber);

  // 2. Đảm bảo môi trường in sẵn sàng
  await ensureDependencies();
  await ensurePrinterMain();

  // 3. Gửi yêu cầu in sang main world và chờ kết quả
  return new Promise((resolve, reject) => {
    function handler(e) {
      if (e.source !== window) return;
      if (e.data.action === 'printLabel-result') {
        window.removeEventListener('message', handler);
        if (e.data.success) {
          resolve();
        } else {
          reject(new Error(e.data.error));
        }
      }
    }
    window.addEventListener('message', handler);
    window.postMessage({
      action: 'printLabel',
      payload: { toNumber, type, id, dateStr, number, email, itemCount, qrDataUrl }
    }, '*');
  });
}