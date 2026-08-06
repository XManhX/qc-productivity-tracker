// background.js – realtime thuần, không polling
importScripts("./lib/supabase.min.js");

const { createClient } = supabase;
const SUPABASE_URL = "https://gjnfyjmrrpxmnufikjgo.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqbmZ5am1ycnB4bW51ZmlramdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NDg1MTIsImV4cCI6MjEwMTEyNDUxMn0.TKEFJNI4_r_c1frKroSLAUhbE8YW4ofdLwQPrwSbsT4";
const APPS_SCRIPT_URL =
  "https://script.google.com/a/macros/shopee.com/s/AKfycbxvt58g6NXM8gAC4mCMq2j6ZTWKkiF85qWxWYMW2KNLw00gweL4fMjvIE4J3sYeq-75/exec";

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const API_BASE = "https://return-sort-arrived.vercel.app/api/config";
let masterDataMap = {};
let typeToIdMap = {};

async function fetchMasterData() {
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=getMasterData`);
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      const map = {};
      json.data.forEach((item) => {
        const return_tn = String(item.rv || "")
          .trim()
          .toUpperCase()
          .replace(/\s+/g, "");
        const type = String(item.type || "").trim();
        if (return_tn) map[return_tn] = type;
      });
      await chrome.storage.local.set({
        masterData: map,
        masterDataUpdated: Date.now(),
      });
      masterDataMap = map;
      console.log("[BG] Master data updated:", Object.keys(map).length);
    }
  } catch (e) {
    console.error("[BG] Master data fetch error:", e);
  }
}

async function fetchTypeMappings() {
  try {
    const res = await fetch(`${API_BASE}/mappings`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    typeToIdMap = json;
    await chrome.storage.local.set({
      typeMapping: json,
      typeMappingUpdated: Date.now(),
    });
    console.log("[BG] Type mappings updated:", Object.keys(typeToIdMap).length);
  } catch (e) {
    console.error("[BG] Fetch type mappings error:", e);
  }
}

// Realtime subscription
supabaseClient
  .channel("id_sessions_changes")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "id_sessions" },
    (payload) => {
      console.log("[BG] Realtime change:", payload);
      broadcastSessions();
    },
  )
  .subscribe((status) => {
    console.log("[BG] Subscription status:", status);
  });

async function broadcastSessions() {
  const { data, error } = await supabaseClient.rpc("get_active_sessions");
  if (error || !data) return;

  chrome.storage.local.set({ activeSessions: data }).catch(() => { });

  const tabs = await chrome.tabs.query({ url: "*://wms.ssc.shopee.vn/*" });
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs
        .sendMessage(tab.id, { action: "UPDATE_SESSIONS", sessions: data })
        .catch(() => { });
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "GET_SESSIONS") {
    (async () => {
      const { data } = await supabaseClient.rpc("get_active_sessions");
      sendResponse({ sessions: data || [] });
    })();
    return true;
  }

  if (msg.action === "API_CALL") {
    const { endpoint, body } = msg;
    const url = `https://return-sort-arrived.vercel.app/api/scan/${endpoint}`;
    (async () => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        sendResponse({ success: true, status: res.status, data });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (msg.action === "GET_MASTER_DATA") {
    sendResponse({ masterData: masterDataMap });
    return true;
  }

  if (msg.action === "GET_TYPE_MAPPING") {
    sendResponse({ mapping: typeToIdMap });
    return true;
  }

  if (msg.action === "GET_CLOSED_SESSIONS") {
    (async () => {
      const page = msg.page || 1;
      const limit = msg.limit || 20;
      const { data, error } = await supabaseClient.rpc("get_closed_sessions", {
        p_page: page,
        p_limit: limit,
      });
      sendResponse({ sessions: data || [] });
    })();
    return true;
  }

  if (msg.action === "GET_CLOSED_COUNT") {
    (async () => {
      const { data, error } = await supabaseClient.rpc("count_closed_sessions");
      sendResponse({ count: error ? 0 : data });
    })();
    return true;
  }

  if (msg.action === "GET_ACTIVE_SCAN_EVENTS") {
    (async () => {
      const page = msg.page || 1;
      const limit = msg.limit || 20;
      const { data, error } = await supabaseClient.rpc(
        "get_active_scan_events",
        {
          p_page: page,
          p_limit: limit,
        },
      );
      sendResponse({ events: data || [] });
    })();
    return true;
  }

  if (msg.action === "GET_ACTIVE_EVENTS_COUNT") {
    (async () => {
      const { data, error } = await supabaseClient.rpc(
        "count_active_scan_events",
      );
      sendResponse({ count: error ? 0 : data });
    })();
    return true;
  }

  if (msg.action === "FETCH_MASTER_DATA") {
    fetchMasterData()
      .then(() => sendResponse({ success: true, masterData: masterDataMap }))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg.action === "FETCH_TYPE_MAPPINGS") {
    fetchTypeMappings()
      .then(() => sendResponse({ success: true, mapping: typeToIdMap }))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg.action === 'PRINT_LABEL') {
    (async () => {
      const payload = {
        pdf_data: msg.pdfBase64,
        begin_page: 1,
        end_page: 1000,
        width: 100,
        height: 50,
        repeat_times: 1,
        orientation: 1,
        printer_mode: "common_mode",
        scale: 100,
        from: 1,
        to: 1,
        left_offset: 0,
        top_offset: 0,
        header_footer_print: false
      };

      try {
        const res = await fetch('https://printproxy.wms.shopeemobile.com:21317/api/v2/print_pdf_file_base64', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const text = await res.text();
          sendResponse({ success: false, error: `Print proxy HTTP ${res.status}: ${text}` });
          return;
        }

        const result = await res.json();
        if (result.retcode !== 0) {
          sendResponse({ success: false, error: `retcode: ${result.retcode}` });
          return;
        }

        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "as-keepalive") {
    console.log("[BG] Persistent port connected");
    port.onDisconnect.addListener(() =>
      console.log("[BG] Persistent port disconnected"),
    );
  }
});

fetchTypeMappings();
fetchMasterData();