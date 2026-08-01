const APPS_SCRIPT_URL = 'https://script.google.com/a/macros/shopee.com/s/AKfycbxvt58g6NXM8gAC4mCMq2j6ZTWKkiF85qWxWYMW2KNLw00gweL4fMjvIE4J3sYeq-75/exec';

async function fetchMasterData() {
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=getMasterData`);
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      const map = {};
      json.data.forEach(item => {
        const rv = String(item.rv || '').trim().toUpperCase().replace(/\s+/g, '');
        const type = String(item.type || '').trim();
        if (rv) map[rv] = type;
      });
      await chrome.storage.local.set({ masterData: map, masterDataUpdated: Date.now() });
      console.log('[BG] Master data updated:', Object.keys(map).length);
    }
  } catch (e) {
    console.error('[BG] Master data fetch error:', e);
  }
}

chrome.runtime.onInstalled.addListener(fetchMasterData);
chrome.runtime.onStartup.addListener(fetchMasterData);
setInterval(fetchMasterData, 5 * 60 * 1000);