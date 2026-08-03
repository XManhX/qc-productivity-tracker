// background.js – realtime thuần, không polling
importScripts('./lib/supabase.min.js');

const { createClient } = supabase;
const SUPABASE_URL = 'https://gjnfyjmrrpxmnufikjgo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqbmZ5am1ycnB4bW51ZmlramdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NDg1MTIsImV4cCI6MjEwMTEyNDUxMn0.TKEFJNI4_r_c1frKroSLAUhbE8YW4ofdLwQPrwSbsT4';
const APPS_SCRIPT_URL = 'https://script.google.com/a/macros/shopee.com/s/AKfycbxvt58g6NXM8gAC4mCMq2j6ZTWKkiF85qWxWYMW2KNLw00gweL4fMjvIE4J3sYeq-75/exec';

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const API_BASE = 'https://return-sort-arrived.vercel.app/api/config';
let masterDataMap = {};
let typeToIdMap = {};

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
      masterDataMap = map;
      console.log('[BG] Master data updated:', Object.keys(map).length);
    }
  } catch (e) {
    console.error('[BG] Master data fetch error:', e);
  }
}

async function fetchTypeMappings() {
  try {
    const res = await fetch(`${API_BASE}/mappings`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    typeToIdMap = json;
    console.log('[BG] Type mappings updated:', Object.keys(typeToIdMap).length);
  } catch (e) {
    console.error('[BG] Fetch type mappings error:', e);
  }
}

// Realtime subscription – chỉ kích hoạt khi có thay đổi
supabaseClient
  .channel('id_sessions_changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'id_sessions' }, (payload) => {
    console.log('[BG] Realtime change:', payload);
    broadcastSessions();
  })
  .subscribe((status) => {
    console.log('[BG] Subscription status:', status);
  });

async function broadcastSessions() {
  const { data, error } = await supabaseClient.rpc('get_active_sessions');
  if (error || !data) return;

  const tabs = await chrome.tabs.query({ url: '*://wms.ssc.shopee.vn/*' });
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'UPDATE_SESSIONS', sessions: data })
        .catch(() => { /* tab không tồn tại hoặc không nhận được */ });
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'GET_SESSIONS') {
    (async () => {
      const { data } = await supabaseClient.rpc('get_active_sessions');
      sendResponse({ sessions: data || [] });
    })();
    return true;
  }

  if (msg.action === 'API_CALL') {
    const { endpoint, body } = msg;
    const url = `https://return-sort-arrived.vercel.app/api/scan/${endpoint}`;
    (async () => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        sendResponse({ success: true, status: res.status, data });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (msg.action === 'GET_MASTER_DATA') {
    sendResponse({ masterData: masterDataMap });
    return true;
  }

  if (msg.action === 'GET_TYPE_MAPPING') {
    sendResponse({ mapping: typeToIdMap });
    return true;
  }

  if (msg.action === 'GET_CLOSED_SESSIONS') {
    (async () => {
      const page = msg.page || 1;
      const limit = msg.limit || 20;
      const { data, error } = await supabaseClient.rpc('get_closed_sessions', {
        p_page: page,
        p_limit: limit
      });
      sendResponse({ sessions: data || [] });
    })();
    return true;
  }

  if (msg.action === 'GET_CLOSED_COUNT') {
    (async () => {
      const { data, error } = await supabaseClient.rpc('count_closed_sessions');
      sendResponse({ count: error ? 0 : data });
    })();
    return true;
  }
});

// Giữ service worker sống
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'as-keepalive') {
    console.log('[BG] Persistent port connected');
    port.onDisconnect.addListener(() => console.log('[BG] Persistent port disconnected'));
  }
});

// Định kỳ cập nhật master data và type mapping
setInterval(fetchMasterData, 5 * 60 * 1000);
fetchTypeMappings();
fetchMasterData();