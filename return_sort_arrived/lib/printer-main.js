// lib/printer-main.js
(function () {
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
            '<div style="width:67%; display:flex; flex-direction:column; justify-content:space-between; padding:' + mmToPx(3) + 'px ' + mmToPx(3) + 'px ' + mmToPx(3) + 'px ' + mmToPx(5) + 'px;">' +
            '<div style="font-size:' + mmToPx(8) + 'px; font-weight:800; color:#000; letter-spacing:0.5px; line-height:1.2; text-transform:uppercase;">TO-' + type + '-' + id + '</div>' +
            '<div style="font-size:' + mmToPx(6) + 'px; font-weight:700; color:#000; font-family:Courier New, monospace; letter-spacing:0.5px;">' + number + '</div>' +
            '<div style="font-size:' + mmToPx(5.3) + 'px; font-weight:700; color:#000; font-family:Courier New, monospace;">' + dateStr + '</div>' +
            '<div style="font-size:' + mmToPx(5.3) + 'px; font-weight:700; color:#000; font-family:Courier New, monospace;">QTY: ' + itemCount + '</div>' +
            '<div style="font-size:' + mmToPx(4) + 'px; font-weight:500; color:#000; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + email + '">' + email + '</div>' +
            '</div>' +
            '<div style="width:33%; display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:' + mmToPx(3) + 'px ' + mmToPx(5) + 'px ' + mmToPx(3) + 'px 0;">' +
            '<div style="font-size:' + mmToPx(4) + 'px; font-weight:700; color:#000; font-family:Courier New, monospace; text-transform:uppercase;">TO-' + type + '-' + id + '</div>' +
            '<div style="width:' + mmToPx(30) + 'px; height:' + mmToPx(30) + 'px;">' +
            '<img src="' + qrDataUrl + '" style="width:100%; height:100%; filter:grayscale(100%) contrast(150%);" crossorigin="anonymous" />' +
            '</div>' +
            '<div style="font-size:' + mmToPx(4) + 'px; font-weight:700; color:#000; font-family:Courier New, monospace;">QTY: ' + itemCount + '</div>' +
            '</div>';
        document.body.appendChild(container);
        return container;
    }

    async function generatePDFBase64(element, widthMM, heightMM) {
        var canvas = await window.html2canvas(element, { scale: 2, useCORS: true, logging: false });
        var { jsPDF } = window.jspdf;
        var doc = new jsPDF({ unit: 'mm', format: [widthMM, heightMM], orientation: 'landscape' });
        var imgData = canvas.toDataURL('image/jpeg', 1.0);
        doc.addImage(imgData, 'JPEG', 0, 0, widthMM, heightMM);
        var dataUri = doc.output('datauristring');
        return dataUri.substring(dataUri.indexOf(',') + 1);
    }

    async function handlePrintLabel(data) {
        var container = createLabelContainer(
            data.toNumber, data.type, data.id, data.dateStr,
            data.number, data.email, data.itemCount, data.qrDataUrl
        );
        // Đợi ảnh QR render (nếu chưa xong)
        var img = container.querySelector('img');
        if (img && !img.complete) {
            await new Promise(function (resolve) {
                img.onload = resolve;
                img.onerror = resolve;
            });
        }
        await new Promise(function (r) { setTimeout(r, 200); }); // đảm bảo render hoàn tất

        var pdfBase64 = await generatePDFBase64(container, 100, 50);
        document.body.removeChild(container);

        var payload = {
            pdf_data: pdfBase64,
            begin_page: 1,
            end_page: 1000,
            width: 100,
            height: 50,
            repeat_times: 1,
            orientation: 1,
            printer_mode: "common_mode",
            scale: 100,
            from: 1,
            to: 1,
            left_offset: 0,
            top_offset: 0,
            header_footer_print: false
        };

        var response = await fetch('https://printproxy.wms.shopeemobile.com:21317/api/v2/print_pdf_file_base64', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            var text = await response.text();
            throw new Error('Print proxy HTTP ' + response.status + ': ' + text);
        }
        var result = await response.json();
        if (result.retcode !== 0) {
            throw new Error('Print API retcode: ' + result.retcode);
        }
    }

    waitForDeps().then(function () {
        window.addEventListener('message', async function (event) {
            if (event.source !== window) return;
            if (event.data.action === 'printLabel') {
                try {
                    await handlePrintLabel(event.data.payload);
                    window.postMessage({ action: 'printLabel-result', success: true }, '*');
                } catch (err) {
                    window.postMessage({ action: 'printLabel-result', success: false, error: err.message }, '*');
                }
            }
        });
    }).catch(function (err) {
        console.error('[printer-main] Dependencies failed:', err);
    });
})();