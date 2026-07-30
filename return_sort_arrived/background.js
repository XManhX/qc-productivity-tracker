const APPS_SCRIPT_WEB_APP_URL =
  "https://script.google.com/a/macros/shopee.com/s/AKfycbxvt58g6NXM8gAC4mCMq2j6ZTWKkiF85qWxWYMW2KNLw00gweL4fMjvIE4J3sYeq-75/exec";
const MASTER_DATA_URL = `${APPS_SCRIPT_WEB_APP_URL}?action=getMasterData`;
const LOG_URL = APPS_SCRIPT_WEB_APP_URL;

let masterDataMap = {};

function normalizeRV(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

async function loadMasterData() {
  const res = await fetch(MASTER_DATA_URL, { method: "GET" });
  const json = await res.json();

  if (json.success && Array.isArray(json.data)) {
    const map = {};
    json.data.forEach((item) => {
      const rv = normalizeRV(item.rv);
      const type = String(item.type || "").trim();
      if (rv) map[rv] = type;
    });
    masterDataMap = map;
    console.log("Master data loaded:", masterDataMap);
    return { success: true, data: masterDataMap };
  }

  return { success: false, error: json.error || "Failed to load master data" };
}

chrome.runtime.onInstalled.addListener(() => {
  loadMasterData().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  loadMasterData().catch(console.error);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.action === "getMasterDataMap") {
        if (!masterDataMap || Object.keys(masterDataMap).length === 0) {
          await loadMasterData();
        }
        sendResponse({ success: true, data: masterDataMap });
        return;
      }

      if (msg.action === "refreshMasterData") {
        const result = await loadMasterData();
        sendResponse(result);
        return;
      }

      if (msg.action === "logScan") {
        try {
          const res = await fetch(LOG_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "logScan",
              ...msg.payload,
            }),
          });

          const text = await res.text();
          console.log("LOG RESPONSE RAW:", text);

          let json;
          try {
            json = JSON.parse(text);
          } catch (e) {
            json = { success: false, error: "Response is not JSON", raw: text };
          }

          sendResponse({ success: true, data: json });
          return;
        } catch (err) {
          console.error("LOG ERROR:", err);
          sendResponse({ success: false, error: String(err) });
          return;
        }
      }

      sendResponse({ success: false, error: "Unknown action" });
    } catch (err) {
      sendResponse({ success: false, error: String(err) });
    }
  })();

  return true;
});
