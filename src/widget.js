// This file contains all the logic for creating, updating, and managing the floating widget.
// It is injected into the main tracker script at build time.

const enforceBounds = (el) => {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth,
    vh = window.innerHeight;
  let top = parseFloat(el.style.top) || 0,
    left = parseFloat(el.style.left) || 0;
  if (el.style.right !== "auto") {
    left = vw - rect.width - parseFloat(el.style.right);
    el.style.left = left + "px";
    el.style.right = "auto";
  }
  if (el.style.bottom !== "auto") {
    top = vh - rect.height - parseFloat(el.style.bottom);
    el.style.top = top + "px";
    el.style.bottom = "auto";
  }
  top = Math.max(0, Math.min(top, vh - rect.height));
  left = Math.max(0, Math.min(left, vw - rect.width));
  el.style.top = top + "px";
  el.style.left = left + "px";
  setStore("widget_position", { top: top + "px", left: left + "px" });
};

const makeDraggable = (elm, header) => {
  let p1 = 0,
    p2 = 0,
    p3 = 0,
    p4 = 0;
  const dragStart = (e) => {
    e = e || window.event;
    e.preventDefault();
    p3 = e.clientX;
    p4 = e.clientY;
    document.onmouseup = dragEnd;
    document.onmousemove = dragMove;
  };
  const dragMove = (e) => {
    e = e || window.event;
    e.preventDefault();
    p1 = p3 - e.clientX;
    p2 = p4 - e.clientY;
    p3 = e.clientX;
    p4 = e.clientY;
    let top = elm.offsetTop - p2,
      left = elm.offsetLeft - p1;
    const rect = elm.getBoundingClientRect();
    const vw = window.innerWidth,
      vh = window.innerHeight;
    top = Math.max(0, Math.min(top, vh - rect.height));
    left = Math.max(0, Math.min(left, vw - rect.width));
    elm.style.top = top + "px";
    elm.style.left = left + "px";
    elm.style.right = "auto";
    elm.style.bottom = "auto";
  };
  const dragEnd = () => {
    document.onmouseup = null;
    document.onmousemove = null;
    setStore("widget_position", { top: elm.style.top, left: elm.style.left });
  };
  header.onmousedown = dragStart;
};

// Helper function to create a single statistic line in the widget
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

const updateWidget = () => {
  const stats = getStore(`stats_${todayKey()}`, {
    qc: 0,
    judgement: 0,
    rimassreceive: 0,
  });
  const defaultPos = { top: "80px", left: "20px" };
  let pos = getStore("widget_position", defaultPos);
  if (!pos || !pos.top || !pos.left) pos = { ...defaultPos };

  let widget = document.getElementById("qc-tracker-floating-widget");
  if (!widget) {
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

    // Use the helper to build the widget content safely
    createStatLine(content, "1. Đã QC:", "qc-tracker-value-qc", "#00e676");
    createStatLine(
      content,
      "2. Đã Judge:",
      "qc-tracker-value-judgement",
      "#29b6f6",
    );
    createStatLine(
      content,
      "3. Đã Nhận:",
      "qc-tracker-value-rimassreceive",
      "#ffca28",
    );
    if (content.lastChild) {
      content.lastChild.style.marginBottom = "0";
    }

    widget.appendChild(content);
    document.body.appendChild(widget);
    makeDraggable(widget, header);
    enforceBounds(widget);
  } else {
    enforceBounds(widget);
  }

  // On every update, just change the textContent of the value elements
  const qcValueEl = document.getElementById("qc-tracker-value-qc");
  if (qcValueEl) qcValueEl.textContent = stats.qc;

  const judgementValueEl = document.getElementById(
    "qc-tracker-value-judgement",
  );
  if (judgementValueEl) judgementValueEl.textContent = stats.judgement;

  const receiveValueEl = document.getElementById(
    "qc-tracker-value-rimassreceive",
  );
  if (receiveValueEl) receiveValueEl.textContent = stats.rimassreceive;
};
