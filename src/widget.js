// ==================== WIDGET MANAGER (Self-contained, relies on passed store functions) ====================
const WidgetManager = (function () {
  // Nhận store functions từ bên ngoài (sẽ được truyền khi khởi tạo)
  let _getStore, _setStore;

  // ---------- PRIVATE STATE ----------
  let widgetEl = null;
  let headerEl = null;
  let shouldBeVisible = false;
  let currentStats = { qc: 0, judgement: 0, rimassreceive: 0 };
  let guardObserver = null;
  let isDragging = false;
  let dragStartPos = { top: 0, left: 0 };
  let dragStartMouse = { x: 0, y: 0 };

  // ---------- POSITION & BOUNDS ----------
  const enforceBounds = () => {
    if (!widgetEl || isDragging) return;
    const rect = widgetEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = parseFloat(widgetEl.style.top) || 0;
    let left = parseFloat(widgetEl.style.left) || 0;

    if (widgetEl.style.right && widgetEl.style.right !== "auto") {
      const r = parseFloat(widgetEl.style.right);
      if (!isNaN(r)) {
        left = vw - rect.width - r;
        widgetEl.style.left = left + "px";
        widgetEl.style.right = "auto";
      }
    }
    if (widgetEl.style.bottom && widgetEl.style.bottom !== "auto") {
      const b = parseFloat(widgetEl.style.bottom);
      if (!isNaN(b)) {
        top = vh - rect.height - b;
        widgetEl.style.top = top + "px";
        widgetEl.style.bottom = "auto";
      }
    }

    top = Math.max(0, Math.min(top, vh - rect.height));
    left = Math.max(0, Math.min(left, vw - rect.width));
    widgetEl.style.top = top + "px";
    widgetEl.style.left = left + "px";

    if (_setStore) {
      _setStore("widget_position", { top: top + "px", left: left + "px" });
    }
  };

  // ---------- DRAGGING ----------
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
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      newTop = Math.max(0, Math.min(newTop, vh - rect.height));
      newLeft = Math.max(0, Math.min(newLeft, vw - rect.width));
      widgetEl.style.top = newTop + "px";
      widgetEl.style.left = newLeft + "px";
      widgetEl.style.right = "auto";
      widgetEl.style.bottom = "auto";
    };

    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      if (_setStore) {
        _setStore("widget_position", {
          top: widgetEl.style.top,
          left: widgetEl.style.left,
        });
      }
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onEnd);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };

    headerEl.addEventListener("mousedown", onStart);
    headerEl.addEventListener("touchstart", onStart, { passive: false });
  };

  // ---------- CREATE / REMOVE ----------
  const createWidget = () => {
    if (widgetEl) return;

    const defaultPos = { top: "80px", left: "20px" };
    const pos = _getStore
      ? _getStore("widget_position", defaultPos)
      : defaultPos;
    if (!pos || !pos.top || !pos.left) {
      pos.top = defaultPos.top;
      pos.left = defaultPos.left;
    }

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
    headerEl.innerText = "📊 NĂNG SUẤT HÔM NAY";
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
    currentStats = stats;
    if (!widgetEl) return;
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setVal("qc-tracker-value-qc", Number(stats.qc) || 0);
    setVal("qc-tracker-value-judgement", Number(stats.judgement) || 0);
    setVal("qc-tracker-value-rimassreceive", Number(stats.rimassreceive) || 0);
  };

  // ---------- GUARD (Self-healing) ----------
  const startGuard = () => {
    if (guardObserver) return;
    guardObserver = new MutationObserver(() => {
      if (shouldBeVisible && widgetEl && !document.body.contains(widgetEl)) {
        widgetEl = null;
        headerEl = null;
        createWidget();
        updateDisplay(currentStats);
      } else if (shouldBeVisible && !widgetEl && document.body) {
        createWidget();
        updateDisplay(currentStats);
      }
    });
    guardObserver.observe(document.body, { childList: true, subtree: true });
  };

  const stopGuard = () => {
    if (guardObserver) {
      guardObserver.disconnect();
      guardObserver = null;
    }
  };

  // ---------- PUBLIC API ----------
  return {
    init(storeGetter, storeSetter) {
      _getStore = storeGetter;
      _setStore = storeSetter;
    },
    setVisible(visible) {
      shouldBeVisible = !!visible;
      localStorage.setItem("widget_visible", visible ? "true" : "false");
      if (visible) {
        if (!widgetEl) {
          createWidget();
          updateDisplay(currentStats);
        }
        startGuard();
      } else {
        removeWidget();
        stopGuard();
      }
    },
    updateStats(stats) {
      if (!stats) return;
      currentStats = { ...stats };
      if (widgetEl) updateDisplay(currentStats);
    },
    isVisible() {
      return shouldBeVisible && !!widgetEl && document.body.contains(widgetEl);
    },
  };
})();
