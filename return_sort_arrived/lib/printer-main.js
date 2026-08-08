// lib/printer-main.js
// Chạy trong main world: nạp html2canvas & jsPDF, xử lý tạo PDF nhãn in.

(function () {
    'use strict';

    function log(msg) {
        console.log('[printer-main]', msg);
    }

    /* ---------- Hàm nạp script ---------- */
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load script: ' + src));
            document.head.appendChild(script);
        });
    }

    /* ---------- Nạp thư viện từ attribute được content script đặt ---------- */
    const html2canvasUrl = document.documentElement.getAttribute('data-html2canvas-url');
    const jspdfUrl = document.documentElement.getAttribute('data-jspdf-url');

    if (!html2canvasUrl || !jspdfUrl) {
        window.postMessage({ type: 'printer-main-error', error: 'Missing library URLs' }, '*');
        return;
    }

    loadScript(html2canvasUrl)
        .then(() => loadScript(jspdfUrl))
        .then(() => {
            log('Libraries loaded successfully');
            window.postMessage({ type: 'printer-main-ready' }, '*');
            window.addEventListener('message', onPrintRequest);
        })
        .catch((err) => {
            window.postMessage({ type: 'printer-main-error', error: err.message }, '*');
        });

    /* ---------- Xử lý yêu cầu in ---------- */
    async function onPrintRequest(event) {
        if (event.source !== window) return;
        if (event.data.action !== 'printLabel') return;

        const { requestId, payload } = event.data;
        log('Received printLabel request: ' + requestId);

        try {
            await handlePrintLabel(payload, requestId);
        } catch (err) {
            log('Error: ' + err.message);
            window.postMessage(
                { action: 'printLabel-result', requestId, success: false, error: err.message },
                '*'
            );
        }
    }

    /* ---------- Đơn vị mm -> px ---------- */
    function mmToPx(mm) {
        return mm * 3.779527559;
    }

    /**
     * Điều chỉnh font-size của element để nội dung vừa khít 1 dòng,
     * không bị cắt, không xuống dòng.
     * @param {HTMLElement} element - Phần tử cần điều chỉnh
     * @param {number} maxWidth - Chiều rộng tối đa cho phép (px)
     * @param {number} initialFontSize - Font-size khởi tạo (px)
     */
    function fitTextToWidth(element, maxWidth, initialFontSize) {
        element.style.whiteSpace = 'nowrap';
        element.style.display = 'inline-block'; // Để đo chính xác
        element.style.fontSize = initialFontSize + 'px';

        // Giảm font-size nếu nội dung tràn
        if (element.scrollWidth > maxWidth) {
            const ratio = maxWidth / element.scrollWidth;
            const newSize = Math.max(1, initialFontSize * ratio); // tối thiểu 1px
            element.style.fontSize = newSize + 'px';
        }
    }

    /* ---------- Tạo container nhãn ẩn ---------- */
    function createLabelContainer(toNumber, id, dateStr, number, email, itemCount, typeList, qrDataUrl) {
        const typeStr = (typeList || []).join(', ') || '';

        const container = document.createElement('div');
        Object.assign(container.style, {
            position: 'fixed',
            top: '-9999px',
            left: '-9999px',
            width: mmToPx(100) + 'px',
            height: mmToPx(50) + 'px',
            backgroundColor: 'white',
            fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            display: 'flex',
            alignItems: 'stretch'
        });

        container.innerHTML = `
    <div style="width:67%; display:flex; flex-direction:column; justify-content:space-between; padding:${mmToPx(3)}px ${mmToPx(3)}px ${mmToPx(3)}px ${mmToPx(5)}px;">
      <div id="label-title-main" style="font-weight:800; color:#000; letter-spacing:0.5px; line-height:1.2; text-transform:uppercase;">TO-${id}</div>
      <div id="label-types-main" style="font-weight:600; color:#000; letter-spacing:0.3px; line-height:1.2; text-transform:uppercase; font-size:${mmToPx(4)}px;">${typeStr}</div>
      <div style="font-size:${mmToPx(6)}px; font-weight:700; color:#000; font-family:'Courier New', Courier, monospace; letter-spacing:0.5px;">${number}</div>
      <div style="font-size:${mmToPx(5.3)}px; font-weight:700; color:#000; font-family:'Courier New', Courier, monospace;">${dateStr}</div>
      <div style="font-size:${mmToPx(5.3)}px; font-weight:700; color:#000; font-family:'Courier New', Courier, monospace;">QTY: ${itemCount}</div>
      <div style="font-size:${mmToPx(4)}px; font-weight:500; color:#000; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${email}">${email}</div>
    </div>
    <div style="width:33%; display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:${mmToPx(3)}px ${mmToPx(5)}px ${mmToPx(3)}px 0;">
      <div id="label-title-side" style="font-weight:700; color:#000; font-family:'Courier New', Courier, monospace; text-transform:uppercase; font-size:${mmToPx(4)}px;">TO-${id}</div>
      <div id="label-types-side" style="font-weight:600; color:#000; text-transform:uppercase; text-align:center; font-size:${mmToPx(3)}px;">${typeStr}</div>
      <div style="width:${mmToPx(30)}px; height:${mmToPx(30)}px;">
        <img src="${qrDataUrl}" style="width:100%; height:100%; filter: grayscale(100%) contrast(150%);" crossorigin="anonymous" />
      </div>
      <div style="font-size:${mmToPx(4)}px; font-weight:700; color:#000; font-family:'Courier New', Courier, monospace;">QTY: ${itemCount}</div>
    </div>
  `;

        document.body.appendChild(container);

        // Fit text
        const mainTitle = container.querySelector('#label-title-main');
        const mainTypes = container.querySelector('#label-types-main');
        const sideTitle = container.querySelector('#label-title-side');
        const sideTypes = container.querySelector('#label-types-side');

        const mainMaxWidth = mmToPx(67) - mmToPx(5 + 3);
        const sideMaxWidth = mmToPx(33) - mmToPx(5);

        fitTextToWidth(mainTitle, mainMaxWidth, mmToPx(8));
        fitTextToWidth(mainTypes, mainMaxWidth, mmToPx(4));
        fitTextToWidth(sideTitle, sideMaxWidth, mmToPx(4));
        fitTextToWidth(sideTypes, sideMaxWidth, mmToPx(3));

        return container;
    }

    /* ---------- Render PDF từ element ---------- */
    async function generatePDFBase64(element, widthMM, heightMM) {
        log('Capturing canvas...');
        const canvas = await window.html2canvas(element, {
            scale: 2,
            useCORS: true,
            logging: false
        });

        if (canvas.width === 0 || canvas.height === 0) {
            throw new Error('Canvas is empty');
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            unit: 'mm',
            format: [widthMM, heightMM],
            orientation: 'landscape'
        });

        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        doc.addImage(imgData, 'JPEG', 0, 0, widthMM, heightMM);
        const dataUri = doc.output('datauristring');
        return dataUri.substring(dataUri.indexOf(',') + 1);
    }

    /* ---------- Quy trình in một nhãn ---------- */
    async function handlePrintLabel(data, requestId) {
        const container = createLabelContainer(
            data.toNumber,
            data.id,
            data.dateStr,
            data.number,
            data.email,
            data.itemCount,
            data.typeList || [],
            data.qrDataUrl
        );

        // Đợi ảnh QR load
        const img = container.querySelector('img');
        if (img && !img.complete) {
            await new Promise(resolve => {
                img.onload = resolve;
                img.onerror = resolve;
            });
        }

        await new Promise(r => setTimeout(r, 100));

        try {
            const pdfBase64 = await generatePDFBase64(container, 100, 50);
            document.body.removeChild(container);
            window.postMessage(
                { action: 'printLabel-pdf-ready', requestId, pdfBase64 },
                '*'
            );
        } catch (err) {
            if (container.parentNode) document.body.removeChild(container);
            throw err;
        }
    }
})();