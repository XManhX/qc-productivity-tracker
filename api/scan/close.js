import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { id, email } = req.body;
    if (!id || !email) return res.status(400).json({ error: 'Missing id/email' });

    const { data, error } = await supabase.rpc('close_session', { p_id: id, p_email: email });
    if (error) return res.status(500).json({ error: error.message });
    if (!data.success) return res.status(400).json(data);
    return res.status(200).json(data);
}