import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const { data, error } = await supabase.rpc('mark_to_printed', { p_id: id });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
}