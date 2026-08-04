// content/audio.js
export class AudioManager {
  constructor() {
    this.ctx = null;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn("[AudioManager] Web Audio API not supported");
    }
    this._unlocked = false;
    this._setupAutoUnlock();
  }

  /**
   * Đảm bảo AudioContext ở trạng thái 'running'.
   * Trả về true nếu context sẵn sàng phát âm thanh.
   */
  async _ensureContext() {
    if (!this.ctx) return false;
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }
    return this.ctx.state === "running";
  }

  /**
   * Tạo và phát một tone tại thời điểm startTime (tính bằng giây của AudioContext).
   * Nếu không truyền startTime, dùng thời điểm hiện tại.
   */
  _playTone(frequency, duration, type = "sine", volume = 0.3, startTime) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startTime ?? this.ctx.currentTime);

    // An toàn: dùng linearRamp để tránh lỗi exponential khi volume = 0
    gain.gain.setValueAtTime(volume, startTime ?? this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(
      0.001,
      (startTime ?? this.ctx.currentTime) + duration,
    );

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(startTime ?? this.ctx.currentTime);
    osc.stop((startTime ?? this.ctx.currentTime) + duration);
  }

  /**
   * Phát một chuỗi các nốt nhạc nối tiếp nhau.
   */
  _playSequence(notes, noteDurationMs = 100, gapMs = 50) {
    if (!this.ctx) return;
    let time = this.ctx.currentTime;
    notes.forEach(({ freq, dur, type, vol }) => {
      const durationSec = (dur || noteDurationMs) / 1000;
      const gapSec = gapMs / 1000;
      this._playTone(freq, durationSec, type || "sine", vol || 0.3, time);
      time += durationSec + gapSec;
    });
  }

  /** Tự động unlock AudioContext khi có tương tác người dùng */
  _setupAutoUnlock() {
    if (!this.ctx) return;
    const events = ["click", "keydown", "touchstart"];
    const unlock = () => {
      if (this._unlocked) return;
      this.unlock();
      if (this._unlocked) {
        events.forEach((evt) => document.removeEventListener(evt, unlock));
      }
    };
    events.forEach((evt) =>
      document.addEventListener(evt, unlock, { once: false }),
    );
  }

  /** Kích hoạt thủ công (có thể gọi từ UI nếu cần) */
  unlock() {
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") {
      this.ctx.resume().then(() => {
        this._unlocked = true;
      });
    } else {
      this._unlocked = true;
    }
  }

  // ========== Hiệu ứng âm thanh ==========

  async playScanSuccess() {
    if (!(await this._ensureContext())) return;
    this._playSequence([
      { freq: 880, dur: 100 },
      { freq: 1100, dur: 150 },
    ]);
  }

  async playNotFound() {
    if (!(await this._ensureContext())) return;
    this._playSequence(
      [
        { freq: 440, dur: 120 },
        { freq: 370, dur: 200 },
      ],
      120,
      60,
    );
  }

  async playMappingError() {
    if (!(await this._ensureContext())) return;
    this._playSequence(
      [
        { freq: 600, dur: 80 },
        { freq: 450, dur: 80 },
        { freq: 350, dur: 150 },
      ],
      100,
      40,
    );
  }

  async playError() {
    if (!(await this._ensureContext())) return;
    this._playSequence(
      [
        { freq: 250, dur: 150 },
        { freq: 200, dur: 200 },
        { freq: 150, dur: 300 },
      ],
      150,
      30,
    );
  }

  async playCloseSuccess() {
    if (!(await this._ensureContext())) return;
    this._playSequence(
      [
        { freq: 660, dur: 120 },
        { freq: 880, dur: 120 },
        { freq: 1100, dur: 180 },
      ],
      120,
      50,
    );
  }

  async playFullAlert() {
    if (!(await this._ensureContext())) return;
    this._playTone(1200, 0.4, "square", 0.2);
  }

  async playPrintSuccess() {
    if (!(await this._ensureContext())) return;
    this._playSequence([
      { freq: 1000, dur: 100 },
      { freq: 1200, dur: 100 },
    ]);
  }

  async playPrintError() {
    if (!(await this._ensureContext())) return;
    this._playSequence([
      { freq: 300, dur: 150 },
      { freq: 250, dur: 200 },
    ]);
  }

  async playUndo() {
    if (!(await this._ensureContext())) return;
    this._playSequence([
      { freq: 500, dur: 100 },
      { freq: 400, dur: 100 },
    ]);
  }
}
