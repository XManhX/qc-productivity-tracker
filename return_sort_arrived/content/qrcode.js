// content/qrcode.js
export async function generateQR(text) {
  return new Promise((resolve, reject) => {
    const requestId =
      Date.now().toString() + Math.random().toString(36).substr(2, 9);

    function handler(e) {
      if (e.detail.requestId === requestId) {
        document.removeEventListener("as-qr-generated", handler);
        if (e.detail.error) {
          reject(new Error(e.detail.error));
        } else {
          resolve(e.detail.url);
        }
      }
    }

    document.addEventListener("as-qr-generated", handler);
    document.dispatchEvent(
      new CustomEvent("as-generate-qr", {
        detail: { text, requestId },
      }),
    );
  });
}
