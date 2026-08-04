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

  /** Đảm bảo context hoạt động (cần user gesture) */
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

  /** Phát một tone đơn giản */
  _playTone(frequency, duration, type = "sine", volume = 0.3) {
    if (!this.ctx) return;
    const oscillator = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, this.ctx.currentTime);
    gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      this.ctx.currentTime + duration,
    );
    oscillator.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    oscillator.start(this.ctx.currentTime);
    oscillator.stop(this.ctx.currentTime + duration);
  }

  /** Phát chuỗi các nốt */
  _playSequence(notes, noteDuration = 100, gap = 50) {
    if (!this.ctx) return;
    let time = this.ctx.currentTime;
    notes.forEach(({ freq, dur, type, vol }) => {
      this._playToneAtTime(
        freq,
        dur || noteDuration / 1000,
        type || "sine",
        vol || 0.3,
        time,
      );
      time += (dur || noteDuration) / 1000 + gap / 1000;
    });
  }

  _playToneAtTime(freq, duration, type, volume, startTime) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

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
    // Dùng `once: false` và tự xóa để đảm bảo tương thích, tránh trường hợp sự kiện không được bắt nếu dùng `once: true` không đồng nhất.
  }

  // ========== Các hiệu ứng âm thanh ==========

  /** Scan sheet thành công */
  playScanSuccess() {
    this._ensureContext().then(() => {
      this._playSequence([
        { freq: 880, dur: 100 },
        { freq: 1100, dur: 150 },
      ]);
    });
  }

  /** Cảnh báo chung (không có trong master data) */
  playNotFound() {
    this._ensureContext().then(() => {
      this._playSequence(
        [
          { freq: 440, dur: 120 },
          { freq: 370, dur: 200 },
        ],
        120,
        60,
      );
    });
  }

  /** Lỗi ánh xạ type -> ID */
  playMappingError() {
    this._ensureContext().then(() => {
      this._playSequence(
        [
          { freq: 600, dur: 80 },
          { freq: 450, dur: 80 },
          { freq: 350, dur: 150 },
        ],
        100,
        40,
      );
    });
  }

  /** Lỗi chung (server, mạng) */
  playError() {
    this._ensureContext().then(() => {
      this._playSequence(
        [
          { freq: 250, dur: 150 },
          { freq: 200, dur: 200 },
          { freq: 150, dur: 300 },
        ],
        150,
        30,
      );
    });
  }

  /** Đóng kiện thành công */
  playCloseSuccess() {
    this._ensureContext().then(() => {
      this._playSequence(
        [
          { freq: 660, dur: 120 },
          { freq: 880, dur: 120 },
          { freq: 1100, dur: 180 },
        ],
        120,
        50,
      );
    });
  }

  /** Khi session đạt ngưỡng (full) */
  playFullAlert() {
    this._ensureContext().then(() => {
      this._playTone(1200, 0.4, "square", 0.2);
    });
  }

  /** In thành công */
  playPrintSuccess() {
    this._ensureContext().then(() => {
      this._playSequence([
        { freq: 1000, dur: 100 },
        { freq: 1200, dur: 100 },
      ]);
    });
  }

  /** In thất bại */
  playPrintError() {
    this._ensureContext().then(() => {
      this._playSequence([
        { freq: 300, dur: 150 },
        { freq: 250, dur: 200 },
      ]);
    });
  }

  /** Hủy scan (undo) thành công */
  playUndo() {
    this._ensureContext().then(() => {
      this._playSequence([
        { freq: 500, dur: 100 },
        { freq: 400, dur: 100 },
      ]);
    });
  }

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
}
