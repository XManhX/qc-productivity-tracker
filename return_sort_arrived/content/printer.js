// content/printer.js

async function generateQRDataUrl(toNumber) {
  try {
    console.log('[Printer] Importing qrcode.js...');
    const { generateQR } = await import(chrome.runtime.getURL('content/qrcode.js'));
    console.log('[Printer] QR generated');
    return await generateQR(toNumber);
  } catch (e) {
    console.error('[Printer] QR error:', e);
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0id2hpdGUiLz48L3N2Zz4=';
  }
}

let mainWorldReadyPromise = null;

function ensureMainWorldReady() {
  if (mainWorldReadyPromise) return mainWorldReadyPromise;

  console.log('[Printer] Setting up main world...');
  mainWorldReadyPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for printer-main-ready')), 20000);

    // Gán URL thư viện
    document.documentElement.setAttribute('data-html2canvas-url', chrome.runtime.getURL('lib/html2canvas.min.js'));
    document.documentElement.setAttribute('data-jspdf-url', chrome.runtime.getURL('lib/jspdf.umd.min.js'));

    // Inject load-dependencies.js
    const loaderUrl = chrome.runtime.getURL('lib/load-dependencies.js');
    const loaderScript = document.createElement('script');
    loaderScript.src = loaderUrl;
    loaderScript.onload = () => console.log('[Printer] load-dependencies.js injected');
    loaderScript.onerror = () => { clearTimeout(timeout); reject(new Error('Cannot inject load-dependencies.js')); };
    document.head.appendChild(loaderScript);

    // Inject printer-main.js
    const printerUrl = chrome.runtime.getURL('lib/printer-main.js');
    const printerScript = document.createElement('script');
    printerScript.src = printerUrl;
    printerScript.onload = () => console.log('[Printer] printer-main.js injected');
    printerScript.onerror = () => { clearTimeout(timeout); reject(new Error('Cannot inject printer-main.js')); };
    document.head.appendChild(printerScript);

    // Lắng nghe cả printer-main-ready và pdf-ready
    window.addEventListener('message', function handler(e) {
      if (e.source !== window) return;
      console.log('[Printer] Message from main world:', e.data);
      if (e.data.type === 'printer-main-ready') {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        console.log('[Printer] Main world ready');
        resolve();
      } else if (e.data.type === 'dependencies-error') {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        reject(new Error(e.data.message));
      }
    });
  });
  return mainWorldReadyPromise;
}

export async function printLabel(toNumber, type, id, dateStr, number, email, itemCount) {
  console.log('========================================');
  console.log('[Printer] printLabel CALLED for', toNumber);
  showToast('⏳ Đang chuẩn bị in...');

  try {
    const qrDataUrl = await generateQRDataUrl(toNumber);
    await ensureMainWorldReady();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for print result')), 60000);

      function handler(e) {
        if (e.source !== window) return;
        // Xử lý kết quả cuối cùng từ main world (sau khi background đã in)
        if (e.data.action === 'printLabel-result') {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          window.removeEventListener('message', pdfHandler);
          if (e.data.success) {
            showToast(`✅ Đã in TO-${type}-${id}`);
            resolve();
          } else {
            showToast(`❌ In thất bại: ${e.data.error}`);
            reject(new Error(e.data.error));
          }
        }
      }

      function pdfHandler(e) {
        if (e.source !== window) return;
        if (e.data.action === 'printLabel-pdf-ready') {
          console.log('[Printer] Received PDF base64, sending to background...');
          // Gửi sang background script để gọi API
          chrome.runtime.sendMessage(
            { action: 'PRINT_LABEL', pdfBase64: e.data.pdfBase64 },
            (response) => {
              if (chrome.runtime.lastError) {
                console.error('[Printer] Background error:', chrome.runtime.lastError);
                window.postMessage({ action: 'printLabel-result', success: false, error: chrome.runtime.lastError.message }, '*');
                return;
              }
              // Trả kết quả về main world để toast
              window.postMessage({ action: 'printLabel-result', success: response.success, error: response.error }, '*');
            }
          );
        }
      }

      window.addEventListener('message', handler);
      window.addEventListener('message', pdfHandler);

      window.postMessage(
        { action: 'printLabel', payload: { toNumber, type, id, dateStr, number, email, itemCount, qrDataUrl } },
        '*'
      );
    });
  } catch (err) {
    console.error('[Printer] Error:', err);
    showToast('❌ Lỗi: ' + err.message);
    throw err;
  }
}

function showToast(message) {
  console.log('[Toast]', message);
  const toast = document.createElement('div');
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
    backgroundColor: '#1E293B', color: 'white', padding: '8px 20px', borderRadius: '10px',
    fontSize: '14px', fontWeight: '500', zIndex: '9999999', boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
  });
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}