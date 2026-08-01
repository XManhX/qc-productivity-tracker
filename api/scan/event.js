import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { event_type, email, station_id, type_group, rv, to_number, item_count } = req.body;
    const { error } = await supabase.from('scan_events').insert({
        event_type, email, station_id, type_group, rv, to_number, item_count
    });
    if (error) return res.status(500).json({ error: error.message });
    res.status(200).json({ success: true });
}