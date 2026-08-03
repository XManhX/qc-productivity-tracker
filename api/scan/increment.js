import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { id, return_tn, type, email } = req.body;
    if (!id || !type || !email) return res.status(400).json({ error: 'Missing fields' });

    const { data, error } = await supabase.rpc('increment_item_count', {
        p_id: id, p_return_tn: return_tn || '', p_type_group: type, p_email: email
    });
    if (error) return res.status(500).json({ error: error.message });
    if (!data.success) return res.status(409).json(data);
    return res.status(200).json(data);
}