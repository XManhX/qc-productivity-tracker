// pages/api/qc-productivity/alert.js
import crypto from 'crypto';

const SEATALK_WEBHOOK_URL = process.env.SEATALK_ALERT_WEBHOOK_URL; // Webhook System Account
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ALERT_COOLDOWN_MS = 2 * 60 * 1000;   // gửi tổng hợp mỗi 2 phút
const MAX_USERS_PER_MESSAGE = 50;

// In-memory queue (production nên dùng Redis)
let alertQueue = [];
let lastSentTime = 0;

// Hàm xác thực email qua Supabase (giống authz của bạn)
async function verifyUser(email) {
  if (!email || !email.includes('@')) return false;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/qc_users?email=eq.${encodeURIComponent(email)}&select=id&is_active=eq.true`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    if (!res.ok) return false;
    const users = await res.json();
    return users.length > 0;
  } catch (e) {
    console.error('verifyUser error:', e);
    return false;
  }
}

// Gửi tin nhắn tổng hợp qua webhook
async function sendAggregatedAlert() {
  const now = Date.now();
  if (alertQueue.length === 0) return;
  if (now - lastSentTime < ALERT_COOLDOWN_MS) return;

  // Lấy danh sách user đang idle (chưa có hoạt động mới)
  const users = alertQueue.map(a => ({
    email: a.email,
    idle: Math.floor((now - a.last_activity_ts) / 60000),
    qc: a.current_qc,
    last_activity: new Date(a.last_activity_ts).toLocaleTimeString('vi-VN'),
  }));

  // Sắp xếp theo thời gian idle giảm dần
  users.sort((a, b) => b.idle - a.idle);
  const displayUsers = users.slice(0, MAX_USERS_PER_MESSAGE);

  let message = `⚠️ **Cảnh báo QC không hoạt động** (${new Date().toLocaleString('vi-VN')})\n\n`;
  displayUsers.forEach((u, i) => {
    message += `${i + 1}. **${u.email}** - idle ${u.idle} phút (QC: ${u.qc}, lúc ${u.last_activity})\n`;
  });
  if (users.length > MAX_USERS_PER_MESSAGE) {
    message += `... và ${users.length - MAX_USERS_PER_MESSAGE} người khác.`;
  }
  message += `\nTổng: **${users.length}** người.`;

  // Gửi webhook
  if (SEATALK_WEBHOOK_URL && !SEATALK_WEBHOOK_URL.includes('xxx')) {
    try {
      await fetch(SEATALK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag: 'text',
          text: { format: 2, content: message },
        }),
      });
      lastSentTime = now;
      console.log(`Sent alert for ${users.length} users`);
      // Xóa queue sau khi gửi
      alertQueue = [];
    } catch (e) {
      console.error('Failed to send Seatalk alert:', e);
    }
  } else {
    console.warn('SEATALK_ALERT_WEBHOOK_URL not configured, would send:', message);
    lastSentTime = now; // tránh loop
    alertQueue = [];
  }
}

// Cron job mỗi 2 phút
if (typeof setInterval !== 'undefined') {
  setInterval(sendAggregatedAlert, ALERT_COOLDOWN_MS);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, current_qc, last_activity_ts, idle_minutes, timestamp } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Missing email' });

  // Xác thực email có trong hệ thống và đang active
  const valid = await verifyUser(email);
  if (!valid) return res.status(403).json({ error: 'User not authorized or inactive' });

  // Dedup: cập nhật nếu email đã có trong queue
  const existing = alertQueue.find(a => a.email === email);
  if (existing) {
    existing.current_qc = current_qc;
    existing.last_activity_ts = last_activity_ts;
    existing.idle_minutes = idle_minutes;
    existing.timestamp = timestamp || Date.now();
  } else {
    alertQueue.push({
      email,
      current_qc: current_qc || 0,
      last_activity_ts: last_activity_ts || 0,
      idle_minutes: idle_minutes || 0,
      timestamp: timestamp || Date.now(),
    });
    // Giới hạn queue
    if (alertQueue.length > 200) alertQueue.shift();
  }

  res.status(200).json({ success: true, queue_length: alertQueue.length });
}