// ==================== QC WATCHDOG (SEATALK ALERT) ====================
(function () {
  // Chỉ chạy một lần, tránh trùng lặp khi script chính re-init
  if (window.__qcWatchdogInstalled) return;
  window.__qcWatchdogInstalled = true;

  const WD_CONFIG = {
    WEBHOOK_URL: "https://openapi.seatalk.io/webhook/group/cwpkcNpDQPyNkXyIWjUaag", // <= điền webhook thật
    CHECK_INTERVAL_MINUTES: 10,
    POLL_INTERVAL_MS: 60000,
    REPEAT_ALERT: false,
    DEBUG: false
  };

  const wdLog = (...args) => WD_CONFIG.DEBUG && console.log("[QC-WD]", ...args);
  const wdWarn = (...args) => console.warn("[QC-WD]", ...args);

  const todayKey = () => new Date().toISOString().split("T")[0];
  const statsKey = () => `stats_${todayKey()}`;

  // Trạng thái watchdog (lưu persistence)
  let lastIncrementTime = 0;       // timestamp ms
  let alertSent = false;
  let lastQc = 0;

  // Đọc/ghi an toàn qua GM storage (không JSON – đồng bộ với script chính)
  const wdGet = (key, fallback) => {
    try { const v = GM_getValue(key); return v === undefined ? fallback : v; } catch { return fallback; }
  };
  const wdSet = (key, val) => {
    try { GM_setValue(key, val); } catch (e) { wdWarn("wdSet failed", e); }
  };

  // Lấy số qc hiện tại từ stats
  const getCurrentQc = () => {
    const stats = wdGet(statsKey(), { qc: 0, judgement: 0, rimassreceive: 0 });
    return typeof stats.qc === "number" ? stats.qc : 0;
  };

  // Gọi khi qc tăng
  const onQcIncreased = () => {
    lastIncrementTime = Date.now();
    alertSent = false;
    wdSet("qc_wd_last_inc", lastIncrementTime);
    wdSet("qc_wd_alert_sent", false);
    wdLog("QC increased, reset watchdog timer");
  };

  // Gửi cảnh báo qua webhook
  const sendAlert = async (currentQc, lastInc) => {
    if (!WD_CONFIG.WEBHOOK_URL || WD_CONFIG.WEBHOOK_URL.includes("xxxxxxxx")) {
      wdWarn("Webhook URL not configured");
      return false;
    }
    const minutes = Math.floor((Date.now() - lastInc) / 60000);
    const msg = `⚠️ **Cảnh báo QC**\nSản lượng QC không tăng trong **${minutes}** phút.\n- Hiện tại: **${currentQc}**\n- Lần tăng cuối: ${new Date(lastInc).toLocaleTimeString("vi-VN")}\nVui lòng kiểm tra!`;
    const payload = { tag: "text", text: { format: 2, content: msg } };

    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: WD_CONFIG.WEBHOOK_URL,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify(payload),
        timeout: 10000,
        onload: (r) => {
          if (r.status >= 200 && r.status < 300) { wdLog("Alert sent"); resolve(true); }
          else { wdWarn("Alert failed", r.status); resolve(false); }
        },
        onerror: (e) => { wdWarn("Alert network error", e); resolve(false); },
        ontimeout: () => { wdWarn("Alert timeout"); resolve(false); }
      });
    });
  };

  // Kiểm tra định kỳ
  const check = async () => {
    const cur = getCurrentQc();
    wdLog("Check qc=" + cur + " lastInc=" + lastIncrementTime);

    if (cur > lastQc) {
      // Phát hiện tăng qua polling (fallback khi listener không hoạt động)
      onQcIncreased();
    }
    lastQc = cur;

    if (lastIncrementTime === 0) {
      // Chưa từng có lần tăng nào => đặt mốc bây giờ để không báo động giả
      lastIncrementTime = Date.now();
      wdSet("qc_wd_last_inc", lastIncrementTime);
      return;
    }

    const elapsed = Date.now() - lastIncrementTime;
    if (elapsed >= WD_CONFIG.CHECK_INTERVAL_MINUTES * 60 * 1000) {
      if (!alertSent || WD_CONFIG.REPEAT_ALERT) {
        const ok = await sendAlert(cur, lastIncrementTime);
        if (ok) {
          alertSent = true;
          wdSet("qc_wd_alert_sent", true);
        }
      }
    }
  };

  // Đăng ký listener để bắt sự kiện tăng qc ngay lập tức
  const setupListener = () => {
    if (typeof GM_addValueChangeListener !== "function") {
      wdWarn("GM_addValueChangeListener not available, relying on polling");
      return;
    }
    try {
      GM_addValueChangeListener(statsKey(), (name, oldValue, newValue) => {
        let oldQc = 0, newQc = 0;
        try { oldQc = (oldValue && oldValue.qc) || 0; } catch {}
        try { newQc = (newValue && newValue.qc) || 0; } catch {}
        if (newQc > oldQc) {
          wdLog("Listener detected increase", oldQc, "->", newQc);
          onQcIncreased();
          lastQc = newQc;
        }
      });
      wdLog("Storage listener registered for", statsKey());
    } catch (e) {
      wdWarn("Failed to register listener", e);
    }
  };

  // Khởi động
  const start = () => {
    // Khôi phục trạng thái cũ
    lastIncrementTime = wdGet("qc_wd_last_inc", 0);
    alertSent = wdGet("qc_wd_alert_sent", false);
    lastQc = getCurrentQc();

    // Nếu đã có qc > 0 nhưng chưa có mốc, đặt mốc cách đây 1 phút
    if (lastQc > 0 && lastIncrementTime === 0) {
      lastIncrementTime = Date.now() - 60000;
      wdSet("qc_wd_last_inc", lastIncrementTime);
    }

    setupListener();
    setInterval(check, WD_CONFIG.POLL_INTERVAL_MS);
    setTimeout(check, 2000);
    wdLog("Watchdog started");
  };

  // Bắt đầu ngay khi được inject
  start();
})();