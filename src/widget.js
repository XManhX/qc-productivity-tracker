const WidgetManager = (function () {
  let _getStore = null;
  let _setStore = null;

  let widgetEl = null;
  let headerEl = null;
  let shouldBeVisible = false;
  let currentStats = { qc: 0, judgement: 0, rimassreceive: 0 };
  let guardObserver = null;
  let guardInterval = null;
  let isDragging = false;
  let dragStartPos = { top: 0, left: 0 };
  let dragStartMouse = { x: 0, y: 0 };

  const getPos = () => {
    try {
      if (_getStore)
        return _getStore("widget_position", { top: "80px", left: "20px" });
    } catch (e) {}
    return { top: "80px", left: "20px" };
  };

  const savePos = (pos) => {
    try {
      if (_setStore) _setStore("widget_position", pos);
    } catch (e) {}
  };

  const enforceBounds = () => {
    if (!widgetEl || isDragging) return;
    const rect = widgetEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = parseFloat(widgetEl.style.top) || 0;
    let left = parseFloat(widgetEl.style.left) || 0;

    top = Math.max(0, Math.min(top, vh - rect.height));
    left = Math.max(0, Math.min(left, vw - rect.width));
    widgetEl.style.top = top + "px";
    widgetEl.style.left = left + "px";
    savePos({ top: top + "px", left: left + "px" });
  };

  const makeDraggable = () => {
    if (!widgetEl || !headerEl) return;
    headerEl.style.cursor = "move";

    const onStart = (e) => {
      if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT") return;
      e.preventDefault();
      isDragging = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      dragStartPos = {
        top: parseFloat(widgetEl.style.top) || 0,
        left: parseFloat(widgetEl.style.left) || 0,
      };
      dragStartMouse = { x: clientX, y: clientY };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onEnd);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onEnd);
      document.addEventListener("touchcancel", onEnd);
    };

    const onMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      let newTop = dragStartPos.top + (clientY - dragStartMouse.y);
      let newLeft = dragStartPos.left + (clientX - dragStartMouse.x);
      const rect = widgetEl.getBoundingClientRect();
      newTop = Math.max(0, Math.min(newTop, window.innerHeight - rect.height));
      newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - rect.width));
      widgetEl.style.top = newTop + "px";
      widgetEl.style.left = newLeft + "px";
    };

    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      savePos({ top: widgetEl.style.top, left: widgetEl.style.left });
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onEnd);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };

    headerEl.addEventListener("mousedown", onStart);
    headerEl.addEventListener("touchstart", onStart, { passive: false });
  };

  const createWidget = () => {
    if (widgetEl && document.body.contains(widgetEl)) return;

    if (widgetEl && !document.body.contains(widgetEl)) {
      widgetEl = null;
      headerEl = null;
    }

    const pos = getPos();
    widgetEl = document.createElement("div");
    widgetEl.id = "qc-tracker-floating-widget";
    widgetEl.style.cssText = `
      position: fixed;
      top: ${pos.top}; left: ${pos.left}; right: auto; bottom: auto;
      width: 200px;
      background: rgba(33,33,33,0.9); color: #fff;
      padding: 12px; border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 999999;
      font-family: Arial, sans-serif; font-size: 13px;
      user-select: none; border: 1px solid #ff5722;
    `;

    headerEl = document.createElement("div");
    headerEl.textContent = "📊 NĂNG SUẤT HÔM NAY";
    headerEl.style.cssText =
      "font-weight:bold; border-bottom:1px solid #555; padding-bottom:6px; margin-bottom:8px; cursor:move; color:#ff5722; text-align:center;";
    widgetEl.appendChild(headerEl);

    const content = document.createElement("div");
    const addLine = (label, id, color) => {
      const line = document.createElement("div");
      line.style.cssText =
        "display:flex; justify-content:space-between; margin-bottom:4px;";
      const labelEl = document.createElement("span");
      labelEl.textContent = label;
      const valueEl = document.createElement("strong");
      valueEl.id = id;
      valueEl.style.color = color;
      line.appendChild(labelEl);
      line.appendChild(valueEl);
      content.appendChild(line);
    };
    addLine("1. Đã QC:", "qc-tracker-value-qc", "#00e676");
    addLine("2. Đã Judge:", "qc-tracker-value-judgement", "#29b6f6");
    addLine("3. Đã Receive:", "qc-tracker-value-rimassreceive", "#ffca28");
    if (content.lastChild) content.lastChild.style.marginBottom = "0";
    widgetEl.appendChild(content);

    document.body.appendChild(widgetEl);
    makeDraggable();
    enforceBounds();
    window.addEventListener("resize", enforceBounds);
    widgetEl._resizeHandler = enforceBounds;

    updateDisplay(currentStats);
  };

  const removeWidget = () => {
    if (widgetEl) {
      window.removeEventListener("resize", widgetEl._resizeHandler);
      widgetEl.remove();
      widgetEl = null;
      headerEl = null;
    }
  };

  const updateDisplay = (stats) => {
    currentStats = stats || currentStats;
    if (!widgetEl) return;
    const qcEl = document.getElementById("qc-tracker-value-qc");
    const jdEl = document.getElementById("qc-tracker-value-judgement");
    const rcEl = document.getElementById("qc-tracker-value-rimassreceive");
    if (qcEl) qcEl.textContent = Number(currentStats.qc) || 0;
    if (jdEl) jdEl.textContent = Number(currentStats.judgement) || 0;
    if (rcEl) rcEl.textContent = Number(currentStats.rimassreceive) || 0;
  };

  const startGuard = () => {
    stopGuard(); // dọn guard cũ trước
    guardObserver = new MutationObserver(() => {
      if (shouldBeVisible) {
        if (!widgetEl || !document.body.contains(widgetEl)) {
          createWidget();
        }
      }
    });
    guardObserver.observe(document.body, { childList: true, subtree: true });

    guardInterval = setInterval(() => {
      if (shouldBeVisible) {
        if (!widgetEl || !document.body.contains(widgetEl)) {
          createWidget();
        }
      }
    }, 2000);
  };

  const stopGuard = () => {
    if (guardObserver) {
      guardObserver.disconnect();
      guardObserver = null;
    }
    if (guardInterval) {
      clearInterval(guardInterval);
      guardInterval = null;
    }
  };

  return {
    init(getter, setter) {
      _getStore = getter;
      _setStore = setter;
    },
    setVisible(visible) {
      shouldBeVisible = !!visible;
      localStorage.setItem("widget_visible", visible ? "true" : "false");
      if (visible) {
        createWidget();
        startGuard();
      } else {
        stopGuard();
        removeWidget();
      }
    },
    updateStats(stats) {
      if (stats) {
        currentStats = { ...stats };
        if (widgetEl) updateDisplay(currentStats);
      }
    },
    isVisible() {
      return shouldBeVisible && !!widgetEl && document.body.contains(widgetEl);
    },
  };
})();
