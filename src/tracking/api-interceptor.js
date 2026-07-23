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
      responsePromise
        .then((response) => {
          if (!response.ok) return;
          const cloned = response.clone();
          cloned
            .json()
            .then((data) => {
              for (const h of matchedHandlers) {
                if (h.config.successCondition(data)) {
                  let bodyObj = {};
                  try {
                    if (init?.body) bodyObj = JSON.parse(init.body);
                  } catch (e) {
                    /* empty */
                  }
                  const extracted = h.config.extractFields(bodyObj, data, {});
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
                let bodyObj = {};
                try {
                  if (body) bodyObj = JSON.parse(body);
                } catch (e) {}
                const extracted = h.config.extractFields(bodyObj, data, {});
                if (onCaptureCallback)
                  onCaptureCallback(h.config.action, extracted);
              }
            }
          } catch (e) {}
        }
      }
      if (origReady) origReady.apply(this, arguments);
    };
    return origSend.call(this, body);
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
