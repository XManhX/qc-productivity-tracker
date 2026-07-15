// api/qc-productivity/dashboard.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const { date } = req.query; 
    let targetDateStr = date;
    
    if (!targetDateStr) {
      const nowVN = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
      targetDateStr = nowVN.toISOString().split('T')[0];
    }

    const startOfDay = new Date(`${targetDateStr}T00:00:00+07:00`).toISOString();
    const endOfDay = new Date(`${targetDateStr}T23:59:59+07:00`).toISOString();

    const { data: logs, error } = await supabase
      .from('qc_logs')
      .select('operator, timestamp')
      .gte('timestamp', startOfDay)
      .lte('timestamp', endOfDay);

    if (error) throw error;

    const report = {};

    logs.forEach(log => {
      const email = log.operator || 'Unknown';
      const dateVN = new Date(new Date(log.timestamp).getTime() + 7 * 60 * 60 * 1000);
      const hour = dateVN.getUTCHours(); 

      if (!report[email]) {
        report[email] = {
          email,
          total: 0,
          hourly: Array(24).fill(0)
        };
      }

      report[email].total += 1;
      report[email].hourly[hour] += 1;
    });

    return res.status(200).json({
      success: true,
      date: targetDateStr,
      results: Object.values(report)
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}