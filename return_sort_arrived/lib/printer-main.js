// lib/printer-main.js
(function () {
    function log(msg, data) {
        console.log('[printer-main]', msg, data || '');
    }

    function waitForDeps() {
        return new Promise(function (resolve, reject) {
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
        });
    }

    function mmToPx(mm) { return mm * 3.779527559; }

    function createLabelContainer(toNumber, type, id, dateStr, number, email, itemCount, qrDataUrl) {
        var container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '-9999px';
        container.style.left = '-9999px';
        container.style.width = mmToPx(100) + 'px';
        container.style.height = mmToPx(50) + 'px';
        container.style.backgroundColor = 'white';
        container.style.fontFamily = "'Helvetica Neue', Helvetica, Arial, sans-serif";
        container.style.display = 'flex';
        container.style.alignItems = 'stretch';
        container.innerHTML =
            '<div style="width:67%; display:flex; flex-direction:column; justify-content:space-between; padding:' +
            mmToPx(3) + 'px ' + mmToPx(3) + 'px ' + mmToPx(3) + 'px ' + mmToPx(5) + 'px;">' +
            '<div style="font-size:' + mmToPx(8) + 'px; font-weight:800; color:#000; letter-spacing:0.5px; line-height:1.2; text-transform:uppercase;">TO-' + type + '-' + id + '</div>' +
            '<div style="font-size:' + mmToPx(6) + 'px; font-weight:700; color:#000; font-family:\'Courier New\', Courier, monospace; letter-spacing:0.5px;">' + number + '</div>' +
            '<div style="font-size:' + mmToPx(5.3) + 'px; font-weight:700; color:#000; font-family:\'Courier New\', Courier, monospace;">' + dateStr + '</div>' +
            '<div style="font-size:' + mmToPx(5.3) + 'px; font-weight:700; color:#000; font-family:\'Courier New\', Courier, monospace;">QTY: ' + itemCount + '</div>' +
            '<div style="font-size:' + mmToPx(4) + 'px; font-weight:500; color:#000; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + email + '">' + email + '</div>' +
            '</div>' +
            '<div style="width:33%; display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:' +
            mmToPx(3) + 'px ' + mmToPx(5) + 'px ' + mmToPx(3) + 'px 0;">' +
            '<div style="font-size:' + mmToPx(4) + 'px; font-weight:700; color:#000; font-family:\'Courier New\', Courier, monospace; text-transform:uppercase;">TO-' + type + '-' + id + '</div>' +
            '<div style="width:' + mmToPx(30) + 'px; height:' + mmToPx(30) + 'px;">' +
            '<img src="' + qrDataUrl + '" style="width:100%; height:100%; filter: grayscale(100%) contrast(150%);" crossorigin="anonymous" />' +
            '</div>' +
            '<div style="font-size:' + mmToPx(4) + 'px; font-weight:700; color:#000; font-family:\'Courier New\', Courier, monospace;">QTY: ' + itemCount + '</div>' +
            '</div>';
        document.body.appendChild(container);
        return container;
    }

    async function generatePDFBase64(element, widthMM, heightMM) {
        log('Capturing canvas...');
        var canvas = await window.html2canvas(element, { scale: 2, useCORS: true, logging: false });
        log('Canvas size: ' + canvas.width + 'x' + canvas.height);
        if (canvas.width === 0 || canvas.height === 0) throw new Error('Canvas is empty');
        var { jsPDF } = window.jspdf;
        var doc = new jsPDF({ unit: 'mm', format: [widthMM, heightMM], orientation: 'landscape' });
        var imgData = canvas.toDataURL('image/jpeg', 1.0);
        doc.addImage(imgData, 'JPEG', 0, 0, widthMM, heightMM);
        var dataUri = doc.output('datauristring');
        return dataUri.substring(dataUri.indexOf(',') + 1);
    }

    async function handlePrintLabel(data) {
        log('Creating label container...');
        var container = createLabelContainer(
            data.toNumber, data.type, data.id, data.dateStr,
            data.number, data.email, data.itemCount, data.qrDataUrl
        );
        var img = container.querySelector('img');
        if (img && !img.complete) {
            log('Waiting for QR image...');
            await new Promise(function (resolve) { img.onload = resolve; img.onerror = resolve; });
        }
        await new Promise(function (r) { setTimeout(r, 300); });

        log('Generating PDF...');
        var pdfBase64 = await generatePDFBase64(container, 100, 50);
        document.body.removeChild(container);
        log('PDF ready, sending to content script via message');

        // Gửi base64 về content script để gọi API qua background
        window.postMessage({ action: 'printLabel-pdf-ready', pdfBase64: pdfBase64 }, '*');
    }

    // Bắt đầu
    waitForDeps().then(function () {
        log('Dependencies OK, notifying content script...');
        window.postMessage({ type: 'printer-main-ready' }, '*');

        window.addEventListener('message', async function (event) {
            if (event.source !== window) return;
            if (event.data.action === 'printLabel') {
                log('Received printLabel request');
                try {
                    await handlePrintLabel(event.data.payload);
                    // Không gửi kết quả ở đây, sẽ đợi content script phản hồi
                } catch (err) {
                    log('Error: ' + err.message);
                    window.postMessage({ action: 'printLabel-result', success: false, error: err.message }, '*');
                }
            }
        });
    }).catch(function (err) {
        log('Dependencies failed: ' + err.message);
    });
})();