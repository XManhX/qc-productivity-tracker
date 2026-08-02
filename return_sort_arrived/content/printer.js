// content/printer.js – Tem TO tối giản 100mm x 50mm (in nhiệt)
import { generateQR } from './qrcode.js';

export async function printLabel(toNumber, type, id, dateStr, number, email, itemCount) {
  const qrDataUrl = await generateQR(toNumber);

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: 100mm 50mm; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 100mm; height: 50mm;
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background: white;
      display: flex; align-items: stretch;
    }
    .left {
      width: 67%;
      display: flex; flex-direction: column; justify-content: space-between;
      padding: 3mm 3mm 3mm 5mm;
    }
    .right {
      width: 33%;
      display: flex; flex-direction: column; align-items: center; justify-content: space-between;
      padding: 3mm 5mm 3mm 0;
    }
    .to-main {
      font-size: 24px; font-weight: 800; color: #000;
      letter-spacing: 0.5px; line-height: 1.2;
      text-transform: uppercase;
    }
    .to-small {
      text-transform: uppercase; margin-bottom: 1mm;
    }
    .number-text {
      font-size: 18px; font-weight: 700; color: #000;
      font-family: 'Courier New', Courier, monospace;
      letter-spacing: 0.5px;
    }
    .date-text {
      font-size: 16px; font-weight: 700; color: #000;
      font-family: 'Courier New', Courier, monospace;
    }
    .email-text {
      font-size: 12px; font-weight: 500; color: #000;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .qty-text {
      font-size: 16px; font-weight: 700; color: #000;
      font-family: 'Courier New', Courier, monospace;
    }
    .to-small, .qty-small {
      font-size: 12px; font-weight: 700; color: #000;
      font-family: 'Courier New', Courier, monospace;
    }
    .qr-wrapper img {
      width: 30mm; height: 30mm;
      filter: grayscale(100%) contrast(150%);
    }
  </style>
</head>
<body>
  <div class="left">
    <div class="to-main">TO-${type}-${id}</div>
    <div class="number-text">${number}</div>
    <div class="date-text">${dateStr}</div>
    <div class="qty-text">QTY: ${itemCount}</div>
    <div class="email-text" title="${email}">${email}</div>
  </div>
  <div class="right">
    <div class="to-small">TO-${type}-${id}</div>
    <div class="qr-wrapper">
      <img src="${qrDataUrl}" alt="QR" />
    </div>
    <div class="qty-small">QTY: ${itemCount}</div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=UTF-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'width=400,height=300');
  if (win) {
    win.onload = () => {
      setTimeout(() => win.print(), 600);
    };
  } else {
    alert('Popup bị chặn. Vui lòng cho phép popup hoặc in thủ công.');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${toNumber}.html`;
    a.click();
  }
}