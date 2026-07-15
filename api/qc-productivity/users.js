const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

module.exports = async function handler(req, res) {
  const { method } = req;

  if (method === 'GET') {
    const { data, error } = await supabase
      .from('qc_users')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (method === 'POST') {
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ message: 'Missing email' });

    const { data, error } = await supabase
      .from('qc_users')
      .insert([{ email: email.toLowerCase().trim(), name, is_active: true }])
      .select();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data[0]);
  }

  if (method === 'DELETE') {
    const { id } = req.query;
    const { error } = await supabase
      .from('qc_users')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ message: 'User deleted successfully' });
  }

  return res.status(405).json({ message: 'Method not allowed' });
};