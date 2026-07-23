import {
  API_BASE_URL,
  LOG_ENDPOINT,
  STATS_SYNC_INTERVAL_MS,
  STATS_THROTTLE_MS,
  EMAIL_CACHE_MS,
} from "./config.js";

let lastSyncTime = 0;
let statsPromise = null;

const todayKey = () => new Date().toISOString().split("T")[0];

// Hàm lấy email từ localStorage/sessionStorage
export function getEmail() {
  const cached = globalThis.GM_getValue("user_email", "");
  const ts = globalThis.GM_getValue("user_email_timestamp", 0);
  if (cached && Date.now() - ts < EMAIL_CACHE_MS) return cached;

  const keys = [
    "user_email",
    "email",
    "user",
    "userInfo",
    "profile",
    "useremail",
    "userEmail",
  ];
  for (const key of keys) {
    let val = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (!val) continue;
    try {
      const obj = JSON.parse(val);
      if (typeof obj === "object" && obj !== null) {
        val = obj.email || obj.user?.email || obj.userEmail || "";
      }
    } catch (e) {}
    const email = (val || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      globalThis.GM_setValue("user_email", email);
      globalThis.GM_setValue("user_email_timestamp", Date.now());
      return email;
    }
  }
  return cached || "";
}

async function fetchStatsFromServer(operator) {
  return new Promise((resolve) => {
    globalThis.GM_xmlhttpRequest({
      method: "GET",
      url: `${API_BASE_URL}${LOG_ENDPOINT}?operator=${encodeURIComponent(operator)}`,
      timeout: 10000,
      onload: (r) => {
        if (r.status === 200) {
          try {
            const data = JSON.parse(r.responseText);
            const stats = {
              qc: Number(data.qc) || 0,
              judgement: Number(data.judgement) || 0,
              rimassreceive: Number(data.rimassreceive) || 0,
              lastUpdated: Date.now(),
            };
            globalThis.GM_setValue(`stats_${todayKey()}`, stats);
            resolve(stats);
          } catch (e) {
            resolve(null);
          }
        } else resolve(null);
      },
      onerror: () => resolve(null),
      ontimeout: () => resolve(null),
    });
  });
}

export async function syncStats(onUpdate) {
  if (statsPromise) return statsPromise;
  if (Date.now() - lastSyncTime < STATS_THROTTLE_MS) return;

  const operator = getEmail();
  if (!operator) return;

  statsPromise = (async () => {
    try {
      const serverStats = await fetchStatsFromServer(operator);
      if (serverStats && onUpdate) onUpdate(serverStats);
      lastSyncTime = Date.now();
    } finally {
      statsPromise = null;
    }
  })();
  return statsPromise;
}

export function incrementLocalStat(pageType) {
  const today = todayKey();
  const stats = globalThis.GM_getValue(`stats_${today}`, {
    qc: 0,
    judgement: 0,
    rimassreceive: 0,
    lastUpdated: 0,
  });
  if (pageType in stats) stats[pageType]++;
  stats.lastUpdated = Date.now();
  globalThis.GM_setValue(`stats_${today}`, stats);
  return stats;
}
