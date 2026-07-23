import { CAPTURE_CONFIGS } from "./config.js";

let activeHandlers = [];
let onCaptureCallback = null;
let installed = false;

function installGlobalInterceptors() {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input?.url;
    if (!url) return originalFetch.apply(this, arguments);
    const method = (
      init?.method || (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const responsePromise = originalFetch.apply(this, arguments);

    const matchedHandlers = activeHandlers.filter(
      (h) =>
        h.path === new URL(url, location.origin).pathname &&
        h.method === method,
    );

    if (matchedHandlers.length > 0) {
      let requestBody = null;
      if (init?.body) {
        try {
          requestBody = JSON.parse(init.body);
        } catch (e) {}
      }

      responsePromise
        .then((response) => {
          if (!response.ok) return;
          const cloned = response.clone();
          cloned
            .json()
            .then((data) => {
              for (const h of matchedHandlers) {
                if (h.config.successCondition(data)) {
                  // Kiểm tra điều kiện bổ sung (nếu có)
                  if (
                    h.config.captureCondition &&
                    !h.config.captureCondition(data)
                  ) {
                    continue;
                  }
                  const extracted = h.config.extractFields(requestBody, data);
                  if (onCaptureCallback)
                    onCaptureCallback(h.config.action, extracted);
                }
              }
            })
            .catch(() => {});
        })
        .catch(() => {});
    }

    return responsePromise;
  };

  const XHRProto = XMLHttpRequest.prototype;
  const origOpen = XHRProto.open;
  const origSend = XHRProto.send;

  XHRProto.open = function (method, url, ...rest) {
    this._qcMethod = method.toUpperCase();
    this._qcUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };

  XHRProto.send = function (body) {
    const xhr = this;
    let requestBody = null;
    try {
      if (body) requestBody = JSON.parse(body);
    } catch (e) {}

    const origReady = xhr.onreadystatechange;
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        const matchedHandlers = activeHandlers.filter(
          (h) =>
            h.path === new URL(xhr._qcUrl, location.origin).pathname &&
            h.method === xhr._qcMethod,
        );
        if (matchedHandlers.length) {
          try {
            const data = JSON.parse(xhr.responseText);
            for (const h of matchedHandlers) {
              if (h.config.successCondition(data)) {
                // Kiểm tra điều kiện bổ sung
                if (
                  h.config.captureCondition &&
                  !h.config.captureCondition(data)
                ) {
                  continue;
                }
                const extracted = h.config.extractFields(requestBody, data);
                if (onCaptureCallback)
                  onCaptureCallback(h.config.action, extracted);
              }
            }
          } catch (e) {}
        }
      }
      if (origReady) origReady.apply(this, arguments);
    };
    return origXHRSend.call(this, body);
  };
}

export function initInterceptor(pageType, onCapture) {
  activeHandlers = [];
  const configs = CAPTURE_CONFIGS[pageType] || [];
  for (const cfg of configs) {
    activeHandlers.push({
      path: cfg.path,
      method: cfg.method,
      config: cfg,
    });
  }
  onCaptureCallback = onCapture;
  installGlobalInterceptors();
}

export function destroyInterceptor() {
  activeHandlers = [];
  onCaptureCallback = null;
}
