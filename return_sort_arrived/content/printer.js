// content/printer.js
// Content script: tạo QR, khởi tạo main world, gửi yêu cầu in và nhận kết quả.

let mainWorldReadyPromise = null;

/**
 * Tạo data URL cho mã QR.
 */
async function generateQRDataUrl(toNumber) {
  try {
    const { generateQR } = await import(chrome.runtime.getURL('content/qrcode.js'));
    return await generateQR(toNumber);
  } catch (e) {
    console.error('[Printer] QR error:', e);
    // Fallback: ảnh trắng 100x100
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0id2hpdGUiLz48L3N2Zz4=';
  }
}

/**
 * Đảm bảo script printer-main.js đã được nạp vào main world và sẵn sàng.
 */
function ensureMainWorldReady() {
  if (mainWorldReadyPromise) return mainWorldReadyPromise;

  mainWorldReadyPromise = new Promise((resolve, reject) => {
    const TIMEOUT = 20000;
    let timeoutId;

    const cleanup = () => {
      clearTimeout(timeoutId);
      window.removeEventListener('message', messageHandler);
    };

    const messageHandler = (e) => {
      if (e.source !== window) return;
      if (e.data.type === 'printer-main-ready') {
        cleanup();
        resolve();
      } else if (e.data.type === 'printer-main-error') {
        cleanup();
        reject(new Error(e.data.error || 'Unknown error in printer-main'));
      }
    };

    document.documentElement.setAttribute(
      'data-html2canvas-url',
      chrome.runtime.getURL('lib/html2canvas.min.js')
    );
    document.documentElement.setAttribute(
      'data-jspdf-url',
      chrome.runtime.getURL('lib/jspdf.umd.min.js')
    );

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('lib/printer-main.js');
    script.onload = () => console.log('[Printer] printer-main.js injected');
    script.onerror = () => {
      cleanup();
      reject(new Error('Cannot inject printer-main.js'));
    };
    document.head.appendChild(script);

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Timeout waiting for printer-main-ready'));
    }, TIMEOUT);

    window.addEventListener('message', messageHandler);
  });

  return mainWorldReadyPromise;
}

/**
 * In một nhãn.
 * @param {string} toNumber - Mã TO
 * @param {string} id - ID của kiện
 * @param {string} dateStr - Ngày (chuỗi)
 * @param {string} number - Số TO (không có tiền tố)
 * @param {string} email - Email người đóng
 * @param {number} itemCount - Số lượng
 * @param {string[]} typeList - Mảng các type_group thuộc về ID này
 * @returns {Promise<void>}
 */
export async function printLabel(toNumber, id, dateStr, number, email, itemCount, typeList) {
  const typeListSafe = typeList || [];
  // console.log('[Printer] printLabel called for', toNumber);

  showToast('⏳ Đang chuẩn bị in...');

  let qrDataUrl;
  try {
    qrDataUrl = await generateQRDataUrl(toNumber);
    await ensureMainWorldReady();
  } catch (err) {
    showToast('❌ Lỗi khởi tạo: ' + err.message);
    throw err;
  }

  const requestId = crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).substr(2);

  const resultPromise = new Promise((resolve, reject) => {
    const TIMEOUT = 60000;
    let timeoutId;
    let resolved = false;

    const cleanup = () => {
      clearTimeout(timeoutId);
      window.removeEventListener('message', messageHandler);
    };

    const finalize = (success, errorMessage) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      if (success) {
        resolve();
      } else {
        reject(new Error(errorMessage || 'Print failed'));
      }
    };

    const messageHandler = (e) => {
      if (e.source !== window) return;
      const data = e.data;

      if (data.action === 'printLabel-pdf-ready' && data.requestId === requestId) {
        chrome.runtime.sendMessage(
          { action: 'PRINT_LABEL', pdfBase64: data.pdfBase64 },
          (response) => {
            if (chrome.runtime.lastError) {
              finalize(false, chrome.runtime.lastError.message);
            } else if (response && response.success) {
              finalize(true);
            } else {
              finalize(false, response?.error || 'Background script error');
            }
          }
        );
        return;
      }

      if (data.action === 'printLabel-result' && data.requestId === requestId) {
        finalize(data.success, data.error);
      }
    };

    timeoutId = setTimeout(() => {
      finalize(false, 'Timeout waiting for print result');
    }, TIMEOUT);

    window.addEventListener('message', messageHandler);

    window.postMessage(
      {
        action: 'printLabel',
        requestId,
        payload: { toNumber, id, dateStr, number, email, itemCount, typeList: typeListSafe, qrDataUrl }
      },
      '*'
    );
  });

  try {
    await resultPromise;
    const typeStr = typeListSafe.join(', ');
    showToast(`✅ Đã in TO-${id} (${typeStr})`);
  } catch (err) {
    showToast(`❌ In thất bại: ${err.message}`);
    throw err;
  }
}

/**
 * Hiển thị toast thông báo không chặn UI.
 */
function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#1E293B',
    color: 'white',
    padding: '8px 20px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '500',
    zIndex: '9999999',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
  });
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}