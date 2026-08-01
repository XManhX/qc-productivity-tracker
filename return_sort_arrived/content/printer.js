import { generateQR } from './qrcode.js';

export async function printLabel(toNumber, type, id, dateStr, number, email, itemCount) {
  const qrDataUrl = await generateQR(toNumber);
  const html = `
    <html><head><style>
      @page { size: 100mm 50mm; margin: 0; }
      body { margin: 0; font-family: Arial, sans-serif; display: flex; }
      .left { width: 50%; padding: 4mm; box-sizing: border-box; }
      .right { width: 50%; padding: 4mm; box-sizing: border-box; text-align: center; }
      .to { font-size: 16px; font-weight: bold; }
      .date { font-size: 14px; margin: 2mm 0; }
      .number { font-size: 14px; font-weight: bold; }
      .email { font-size: 10px; color: #555; }
      .qty { font-size: 12px; margin-top: 2mm; }
      img { width: 25mm; height: 25mm; }
    </style></head>
    <body>
      <div class="left">
        <div class="to">TO-${type}-${id}</div>
        <div class="date">${dateStr}</div>
        <div class="number">${number}</div>
      </div>
      <div class="right">
        <div class="email">${email}</div>
        <img src="${qrDataUrl}" />
        <div class="qty">Số lượng: ${itemCount}</div>
      </div>
    </body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'width=400,height=300');
  if (win) win.onload = () => win.print();
  else {
    alert('Popup bị chặn. Vui lòng cho phép popup hoặc in thủ công.');
    const a = document.createElement('a');
    a.href = url; a.download = `${toNumber}.html`; a.click();
  }
}