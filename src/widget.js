// ==================== WIDGET MODULE ====================
// Injected into main tracker script. Assumes these are available in scope:
//   getStore(key, fallback)
//   setStore(key, value)
//   todayKey()
//   log, warn (optional)

function initWidget() {
  // Safety checks – if the host script hasn't provided them, create fallbacks.
  if (typeof getStore !== "function") {
    window.getStore = (k, fb) => {
      try {
        const v = GM_getValue(k);
        return v === undefined ? fb : v;
      } catch {
        return fb;
      }
    };
  }
  if (typeof setStore !== "function") {
    window.setStore = (k, v) => {
      try {
        GM_setValue(k, v);
      } catch {}
    };
  }
  if (typeof todayKey !== "function") {
    window.todayKey = () => new Date().toISOString().split("T")[0];
  }
}

// Gọi lần đầu khi script chạy
initWidget();

// ==================== BỔ SUNG: TỰ ĐỘNG PHẢN ỨNG KHI widget_visible THAY ĐỔI ====================
(function setupWidgetVisibilityListener() {
  // Override localStorage.setItem để dispatch custom event khi thay đổi
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = function (key, value) {
    const oldValue = localStorage.getItem(key);
    originalSetItem.call(localStorage, key, value);
    if (key === "widget_visible" && value !== oldValue) {
      // Dispatch một sự kiện đồng bộ cho widget
      window.dispatchEvent(
        new CustomEvent("widgetVisibilityChanged", {
          detail: { visible: value !== "false" },
        }),
      );
    }
  };

  // Lắng nghe sự kiện
  window.addEventListener("widgetVisibilityChanged", function (e) {
    const visible = e.detail.visible;
    const widget = document.getElementById("qc-tracker-floating-widget");
    if (!visible) {
      if (widget) {
        widget.remove();
        // Nếu có các listener như resize, observer cũng nên được dọn
        // Ta có thể lưu lại các handler để remove, nhưng có thể dùng cờ isDestroyed
        // Dưới đây là cách an toàn: observer đã gắn ở widget creation sẽ tự disconnect khi node bị xóa
      }
    } else if (visible && !widget) {
      // Nếu trở lại visible, có thể gọi updateWidget để tạo lại widget
      // Nhưng cần đảm bảo updateWidget được gọi với dữ liệu mới.
      // Gọi updateWidget không tham số để lấy từ localStorage
      if (typeof updateWidget === "function") {
        updateWidget();
      }
    }
  });

  // Kiểm tra ngay trạng thái ban đầu (khi script vừa chạy, có thể widget đã tồn tại từ trước?)
  // Thực tế updateWidget sẽ kiểm tra khi được gọi, nhưng ta vẫn có thể chạy một lần.
})();

// ==================== WIDGET CORE ====================
const widgetState = {
  isDragging: false,
  resizeDebounceTimer: null,
  lastSavedPosition: null,
  dragStartPos: { top: 0, left: 0 },
  dragStartMouse: { x: 0, y: 0 },
  widget: null,
};

/**
 * Ensures the widget stays within the viewport.
 * @param {HTMLElement} el
 */
const enforceBounds = (el) => {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = parseFloat(el.style.top) || 0;
  let left = parseFloat(el.style.left) || 0;

  // Convert right/bottom positioning to left/top if needed, ignoring 'auto' or invalid
  if (el.style.right && el.style.right !== "auto") {
    const rightVal = parseFloat(el.style.right);
    if (!isNaN(rightVal)) {
      left = vw - rect.width - rightVal;
      el.style.left = left + "px";
      el.style.right = "auto";
    }
  }
  if (el.style.bottom && el.style.bottom !== "auto") {
    const bottomVal = parseFloat(el.style.bottom);
    if (!isNaN(bottomVal)) {
      top = vh - rect.height - bottomVal;
      el.style.top = top + "px";
      el.style.bottom = "auto";
    }
  }

  // Clamp values
  top = Math.max(0, Math.min(top, vh - rect.height));
  left = Math.max(0, Math.min(left, vw - rect.width));

  el.style.top = top + "px";
  el.style.left = left + "px";

  // Save only if position actually changed
  const posKey = `${top},${left}`;
  if (widgetState.lastSavedPosition !== posKey && !widgetState.isDragging) {
    widgetState.lastSavedPosition = posKey;
    setStore("widget_position", { top: top + "px", left: left + "px" });
  }
};

/**
 * Makes the widget draggable via mouse or touch.
 * @param {HTMLElement} elm - The entire widget container
 * @param {HTMLElement} header - The drag handle
 */
const makeDraggable = (elm, header) => {
  if (!elm || !header) return;

  // Remove previous listeners if any (to avoid duplicates)
  if (header._dragHandlers) {
    header.removeEventListener("mousedown", header._dragHandlers.mouse);
    header.removeEventListener("touchstart", header._dragHandlers.touch);
  }

  let start = (e) => {
    // Prevent dragging when interacting with buttons/inputs inside header
    if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT") return;

    e.preventDefault();
    widgetState.isDragging = true;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // Save current widget position and mouse/touch position
    widgetState.dragStartPos = {
      top: parseFloat(elm.style.top) || 0,
      left: parseFloat(elm.style.left) || 0,
    };
    widgetState.dragStartMouse = { x: clientX, y: clientY };

    // Attach move/end listeners to document
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", end);
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", end);
  };

  let move = (e) => {
    if (!widgetState.isDragging) return;
    e.preventDefault();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const dx = clientX - widgetState.dragStartMouse.x;
    const dy = clientY - widgetState.dragStartMouse.y;

    let newTop = widgetState.dragStartPos.top + dy;
    let newLeft = widgetState.dragStartPos.left + dx;

    // Get current dimensions for clamping
    const rect = elm.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    newTop = Math.max(0, Math.min(newTop, vh - rect.height));
    newLeft = Math.max(0, Math.min(newLeft, vw - rect.width));

    elm.style.top = newTop + "px";
    elm.style.left = newLeft + "px";
    elm.style.right = "auto";
    elm.style.bottom = "auto";
  };

  let end = () => {
    if (!widgetState.isDragging) return;
    widgetState.isDragging = false;

    // Save final position
    const top = elm.style.top;
    const left = elm.style.left;
    setStore("widget_position", { top, left });
    widgetState.lastSavedPosition = `${parseFloat(top) || 0},${parseFloat(left) || 0}`;

    // Remove document listeners
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", end);
    document.removeEventListener("touchmove", move);
    document.removeEventListener("touchend", end);
    document.removeEventListener("touchcancel", end);
  };

  // Store handlers for potential cleanup
  header._dragHandlers = { mouse: start, touch: start };

  header.addEventListener("mousedown", start);
  header.addEventListener("touchstart", start, { passive: false });
};

/**
 * Creates a single statistic line.
 */
const createStatLine = (content, label, id, color) => {
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

/**
 * Main update function – called by the host script.
 * Now accepts an optional stats object from the server.
 */
const updateWidget = (stats) => {
  // Nếu không có stats truyền vào (các lần gọi cũ), dùng local store làm fallback
  if (!stats) {
    stats = getStore(`stats_${todayKey()}`, {
      qc: 0,
      judgement: 0,
      rimassreceive: 0,
    });
  }

  const widgetVisible = localStorage.getItem("widget_visible");
  if (widgetVisible === "false") {
    // Xóa widget nếu đang tồn tại
    const existing = document.getElementById("qc-tracker-floating-widget");
    if (existing) existing.remove();
    return;
  }

  // Sanitise values to numbers
  const qc = Number(stats.qc) || 0;
  const judgement = Number(stats.judgement) || 0;
  const rimassreceive = Number(stats.rimassreceive) || 0;

  const defaultPos = { top: "80px", left: "20px" };
  let pos = getStore("widget_position", defaultPos);
  if (!pos || !pos.top || !pos.left) pos = { ...defaultPos };

  let widget = document.getElementById("qc-tracker-floating-widget");

  if (!widget) {
    // Create widget
    widget = document.createElement("div");
    widget.id = "qc-tracker-floating-widget";
    widget.style.cssText = `
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

    const header = document.createElement("div");
    header.id = "qc-tracker-widget-header";
    header.innerText = "📊 NĂNG SUẤT HÔM NAY";
    header.style.cssText =
      "font-weight:bold; border-bottom:1px solid #555; padding-bottom:6px; margin-bottom:8px; cursor:move; color:#ff5722; text-align:center;";
    widget.appendChild(header);

    const content = document.createElement("div");
    content.id = "qc-tracker-widget-content";

    createStatLine(content, "1. Đã QC:", "qc-tracker-value-qc", "#00e676");
    createStatLine(
      content,
      "2. Đã Judge:",
      "qc-tracker-value-judgement",
      "#29b6f6",
    );
    createStatLine(
      content,
      "3. Đã Receive:",
      "qc-tracker-value-rimassreceive",
      "#ffca28",
    );
    // Remove bottom margin of last line
    if (content.lastChild) content.lastChild.style.marginBottom = "0";

    widget.appendChild(content);
    document.body.appendChild(widget);

    makeDraggable(widget, header);
    enforceBounds(widget);

    // Attach resize listener
    const handleResize = () => {
      if (widgetState.isDragging) return; // don't interfere
      enforceBounds(widget);
    };
    window.addEventListener("resize", handleResize);

    // Clean up when widget is removed (e.g., SPA navigation)
    const observer = new MutationObserver(() => {
      if (!document.body.contains(widget)) {
        window.removeEventListener("resize", handleResize);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true });

    // Store reference to widget for later updates
    widgetState.widget = widget;
  } else {
    // Widget already exists, just enforce bounds (non-dragging)
    if (!widgetState.isDragging) enforceBounds(widget);
  }

  // Update displayed values
  const qcEl = document.getElementById("qc-tracker-value-qc");
  if (qcEl) qcEl.textContent = qc;

  const judgeEl = document.getElementById("qc-tracker-value-judgement");
  if (judgeEl) judgeEl.textContent = judgement;

  const receiveEl = document.getElementById("qc-tracker-value-rimassreceive");
  if (receiveEl) receiveEl.textContent = rimassreceive;
};

// Expose updateWidget to the global scope (already in the same IIFE if injected,
// but ensure it's accessible if needed outside)
if (typeof window !== "undefined") {
  window.updateWidget = updateWidget;
}
