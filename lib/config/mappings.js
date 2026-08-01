import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    // GET: lấy tất cả mapping
    if (req.method === 'GET') {
        const { data, error } = await supabase
            .from('type_mappings')
            .select('*')
            .order('station_id');
        if (error) return res.status(500).json({ error: error.message });
        // Chuyển thành object { type_name: station_id }
        const mapping = {};
        data.forEach(row => {
            mapping[row.type_name] = row.station_id;
        });
        return res.status(200).json(mapping);
    }

    // POST: thêm hoặc cập nhật mapping (admin)
    if (req.method === 'POST') {
        const auth = req.headers.authorization;
        if (auth !== `Bearer ${process.env.ADMIN_API_SECRET}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { type_name, station_id } = req.body;
        if (!type_name || !station_id) {
            return res.status(400).json({ error: 'Missing fields' });
        }
        const { data, error } = await supabase
            .from('type_mappings')
            .upsert({ type_name, station_id, updated_at: new Date() }, { onConflict: 'type_name' })
            .select();
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json(data);
    }

    // DELETE: xóa mapping (admin)
    if (req.method === 'DELETE') {
        const auth = req.headers.authorization;
        if (auth !== `Bearer ${process.env.ADMIN_API_SECRET}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { type_name } = req.query;
        if (!type_name) return res.status(400).json({ error: 'Missing type_name' });
        const { error } = await supabase
            .from('type_mappings')
            .delete()
            .eq('type_name', type_name);
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}