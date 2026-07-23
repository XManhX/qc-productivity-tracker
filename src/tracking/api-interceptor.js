import { CAPTURE_CONFIGS, DEBUG } from "./config.js";

let activeHandlers = [];
let onCaptureCallback = null;
let installed = false;

const log = (...args) =>
  DEBUG && console.log("[QCTracker Interceptor]", ...args);

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
      log("Fetch matched:", url, method, matchedHandlers.length, "handler(s)");
      let requestBody = null;
      if (init?.body) {
        try {
          requestBody = JSON.parse(init.body);
        } catch (e) {}
      }

      responsePromise
        .then((response) => {
          if (!response.ok) {
            log("Response not ok:", response.status);
            return;
          }
          const cloned = response.clone();
          cloned
            .json()
            .then((data) => {
              log("Response data:", data);
              for (const h of matchedHandlers) {
                if (h.config.successCondition(data)) {
                  log("successCondition passed for", h.config.path);
                  if (
                    h.config.captureCondition &&
                    !h.config.captureCondition(data)
                  ) {
                    log("captureCondition failed, skipping");
                    continue;
                  }
                  const extracted = h.config.extractFields(requestBody, data);
                  log("Extracted fields:", extracted);
                  if (onCaptureCallback)
                    onCaptureCallback(h.config.action, extracted);
                } else {
                  log("successCondition failed for", h.config.path);
                }
              }
            })
            .catch((e) => log("JSON parse error:", e));
        })
        .catch((e) => log("Fetch error:", e));
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
          log("XHR matched:", xhr._qcUrl, xhr._qcMethod);
          try {
            const data = JSON.parse(xhr.responseText);
            log("XHR response:", data);
            for (const h of matchedHandlers) {
              if (h.config.successCondition(data)) {
                log("successCondition passed");
                if (
                  h.config.captureCondition &&
                  !h.config.captureCondition(data)
                ) {
                  log("captureCondition failed");
                  continue;
                }
                const extracted = h.config.extractFields(requestBody, data);
                log("Extracted fields:", extracted);
                if (onCaptureCallback)
                  onCaptureCallback(h.config.action, extracted);
              }
            }
          } catch (e) {
            log("XHR parse error:", e);
          }
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
  log(
    "Interceptor initialized for",
    pageType,
    "with",
    activeHandlers.length,
    "handlers",
  );
  installGlobalInterceptors();
}

export function destroyInterceptor() {
  activeHandlers = [];
  onCaptureCallback = null;
  log("Interceptor destroyed");
}
