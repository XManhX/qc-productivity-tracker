// ==================== QC WATCHDOG (SEATALK ALERT) ====================
(function () {
  if (window.__qcWatchdogInstalled) return;
  window.__qcWatchdogInstalled = true;

  const WD = {
    // API endpoint tổng hợp alert (ưu tiên)
    ALERT_API: "__API_BASE_URL__/api/qc-productivity/alert",
    // Fallback webhook nếu API không dùng được (tùy chọn)
    FALLBACK_WEBHOOK: "", // bỏ trống nếu chỉ dùng API
    CHECK_MIN: 10,               // phút
    POLL_MS: 60000,
    REPEAT_ALERT: false,
    SILENT_HOURS: [
      { start: "12:30", end: "13:30" }
    ],
    DEBUG: false
  };

  const wLog = (...a) => WD.DEBUG && console.log("[QC-WD]", ...a);
  const wWarn = (...a) => console.warn("[QC-WD]", ...a);

  // Helpers
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const statsKey = () => `stats_${todayKey()}`;
  const wGet = (k, fb) => { try { const v = GM_getValue(k); return v === undefined ? fb : v; } catch { return fb; } };
  const getStats = () => {
    const raw = wGet(statsKey(), null);
    if (!raw) return { qc: 0, lastUpdated: 0 };
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return { qc: 0, lastUpdated: 0 }; }
    }
    return raw;
  };
  const getQc = () => getStats().qc || 0;
  const getLastUpdated = () => getStats().lastUpdated || 0;
  const getEmail = () => {
    const e = wGet("user_email", "");
    return e.includes("@") ? e : "unknown";
  };

  // Silent hours
  const isSilent = () => {
    const d = new Date();
    const m = d.getHours() * 60 + d.getMinutes();
    return WD.SILENT_HOURS.some(({ start, end }) => {
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      const s = sh * 60 + sm;
      const e = eh * 60 + em;
      return s <= e ? (m >= s && m < e) : (m >= s || m < e);
    });
  };

  // Trạng thái
  let alertSent = false;
  let silentEnd = 0;
  let wasSilent = isSilent();

  // Gửi alert lên API
  const sendAlert = async (qc, lastAct, email) => {
    const payload = {
      email,
      current_qc: qc,
      last_activity_ts: lastAct,
      idle_minutes: Math.floor((Date.now() - lastAct) / 60000),
      timestamp: Date.now()
    };

    // Gửi API trước
    if (WD.ALERT_API && !WD.ALERT_API.includes("__API_BASE_URL__")) {
      try {
        await new Promise((res, rej) => {
          GM_xmlhttpRequest({
            method: "POST",
            url: WD.ALERT_API,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify(payload),
            timeout: 10000,
            onload: (r) => (r.status >= 200 && r.status < 300) ? res() : rej(r),
            onerror: rej,
            ontimeout: rej
          });
        });
        wLog("Alert sent to API");
        return true;
      } catch (e) {
        wWarn("API failed, trying fallback");
      }
    }

    // Fallback webhook
    if (WD.FALLBACK_WEBHOOK && !WD.FALLBACK_WEBHOOK.includes("xxx")) {
      const msg = `⚠️ **Cảnh báo QC**\nUser: **${email}**\nQC không tăng trong **${payload.idle_minutes}** phút.\n- Hiện tại: **${qc}**\n- Hoạt động cuối: ${new Date(lastAct).toLocaleTimeString("vi-VN")}`;
      return new Promise(res => {
        GM_xmlhttpRequest({
          method: "POST",
          url: WD.FALLBACK_WEBHOOK,
          headers: { "Content-Type": "application/json" },
          data: JSON.stringify({ tag: "text", text: { format: 1, content: msg } }),
          timeout: 10000,
          onload: (r) => res(r.status >= 200 && r.status < 300),
          onerror: () => res(false),
          ontimeout: () => res(false)
        });
      });
    }
    return false;
  };

  // Kiểm tra
  const check = async () => {
    if (isSilent()) {
      wasSilent = true;
      alertSent = false;
      return;
    }
    if (wasSilent) {
      silentEnd = Date.now();
      wasSilent = false;
      alertSent = false;
    }

    const qc = getQc();
    const last = getLastUpdated();
    const effective = Math.max(last, silentEnd);
    if (!effective) return;

    if (Date.now() - effective >= WD.CHECK_MIN * 60 * 1000) {
      if (!alertSent || WD.REPEAT_ALERT) {
        const ok = await sendAlert(qc, effective, getEmail());
        if (ok) alertSent = true;
      }
    }
  };

  // Listener
  if (typeof GM_addValueChangeListener === "function") {
    try {
      GM_addValueChangeListener(statsKey(), (name, old, val) => {
        let oUp = 0, nUp = 0;
        try { oUp = JSON.parse(old || '{}').lastUpdated || 0; } catch {}
        try { nUp = JSON.parse(val || '{}').lastUpdated || 0; } catch {}
        if (nUp > oUp) {
          alertSent = false;
          if (!isSilent()) silentEnd = 0;
        }
      });
    } catch (e) {}
  }

  // Khởi động
  setInterval(check, WD.POLL_MS);
  setTimeout(check, 3000);
  wLog("Watchdog started, email:", getEmail());
})();