(function () {
  if (window.__asInterceptorInjected) return;
  window.__asInterceptorInjected = true;

  console.log("[AS Interceptor] Injecting into main world...");

  let pendingSheetId = null;

  // ==== Dispatch ngay khi request được gửi ====
  function notifyDetected(sheetId) {
    document.dispatchEvent(
      new CustomEvent("as-return-tn-detected", { detail: { sheetId } }),
    );
  }

  // ==== Dispatch khi có response ====
  function notifyArrived(returnNo, sheetId) {
    document.dispatchEvent(
      new CustomEvent("as-return-tn-arrived", {
        detail: { returnTn: returnNo, sheetId: sheetId },
      }),
    );
  }

  function notifyError(sheetId, retcode, message) {
    document.dispatchEvent(
      new CustomEvent("as-return-tn-error", {
        detail: { sheetId, retcode, message },
      }),
    );
  }

  // ==== URL change detection (React Router) ====
  function notifyUrlChange(url) {
    document.dispatchEvent(new CustomEvent("url-change", { detail: { url } }));
  }

  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;

  history.pushState = function (...args) {
    origPushState.apply(this, args);
    notifyUrlChange(window.location.href);
  };

  history.replaceState = function (...args) {
    origReplaceState.apply(this, args);
    notifyUrlChange(window.location.href);
  };

  window.addEventListener("popstate", () => {
    notifyUrlChange(window.location.href);
  });

  notifyUrlChange(window.location.href);

  // ==== Tự động click Complete (giữ nguyên) ====
  function findCompleteButton() {
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      if ((btn.textContent || "").trim().toLowerCase() === "complete")
        return btn;
    }
    return null;
  }

  function clickComplete() {
    const btn = findCompleteButton();
    if (btn) {
      console.log("[AS Interceptor] Clicking Complete button...");
      btn.click();
      return true;
    }
    return false;
  }

  function waitAndClickComplete(retries = 20, interval = 300) {
    return new Promise((resolve) => {
      let attempts = 0;
      const timer = setInterval(() => {
        if (clickComplete()) {
          clearInterval(timer);
          resolve(true);
        } else if (++attempts >= retries) {
          clearInterval(timer);
          console.warn(
            "[AS Interceptor] Complete button not found after retries",
          );
          resolve(false);
        }
      }, interval);
    });
  }

  // ==== Intercept fetch ====
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url;

    // Khi request scan_sheet_id được gửi → lấy sheet_id từ payload
    if (url && url.includes("scan_sheet_id")) {
      try {
        const body = args[0]?.body;
        if (typeof body === "string") {
          const parsed = JSON.parse(body);
          pendingSheetId = parsed.sheet_id || null;
          if (pendingSheetId) {
            notifyDetected(pendingSheetId); // dispatch NGAY LẬP TỨC
          }
        }
      } catch (e) { }
    }

    const response = await origFetch.apply(this, args);

    // Khi có response
    if (url && url.includes("scan_sheet_id")) {
      const clone = response.clone();
      clone
        .json()
        .then(async (data) => {
          if (data.retcode === 0 && data.data?.list?.length) {
            const returnNo = data.data.list[0].return_no;
            if (returnNo) {
              notifyArrived(returnNo, pendingSheetId); // gửi kèm sheetId
              await waitAndClickComplete(); // auto‑click Complete
            }
          } else {
            notifyError(pendingSheetId || "", data.retcode, data.message || "");
          }
          pendingSheetId = null;
        })
        .catch((e) => console.error("[AS Interceptor] fetch parse error:", e));
    }

    return response;
  };

  // ==== Intercept XMLHttpRequest ====
  const OrigXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const xhr = new OrigXHR();
    const origOpen = xhr.open;
    const origSend = xhr.send;
    let requestURL = "";

    xhr.open = function (method, url, ...rest) {
      requestURL = url;
      return origOpen.apply(this, [method, url, ...rest]);
    };

    xhr.send = function (...args) {
      // Khi request scan_sheet_id được gửi → lấy sheet_id
      if (requestURL && requestURL.includes("scan_sheet_id")) {
        try {
          const body = args[0];
          if (typeof body === "string") {
            const parsed = JSON.parse(body);
            pendingSheetId = parsed.sheet_id || null;
            if (pendingSheetId) {
              notifyDetected(pendingSheetId);
            }
          }
        } catch (e) { }
      }

      this.addEventListener("load", async function () {
        if (requestURL && requestURL.includes("scan_sheet_id")) {
          try {
            const data = JSON.parse(this.responseText);
            if (data.retcode === 0 && data.data?.list?.length) {
              const returnNo = data.data.list[0].return_no;
              if (returnNo) {
                notifyArrived(returnNo, pendingSheetId);
                await waitAndClickComplete();
              }
            } else {
              notifyError(
                pendingSheetId || "",
                data.retcode,
                data.message || "",
              );
            }
            pendingSheetId = null;
          } catch (e) {
            console.error(e);
          }
        }
      });
      return origSend.apply(this, args);
    };

    return xhr;
  };

  ["UNSENT", "OPENED", "HEADERS_RECEIVED", "LOADING", "DONE"].forEach((p) => {
    window.XMLHttpRequest[p] = OrigXHR[p];
  });

  console.log("[AS Interceptor] Interceptors active.");
})();