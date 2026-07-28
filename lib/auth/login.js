// lib/auth/login.js
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { createToken } from './auth.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email, password } = req.body || {};
    if (!email || !password) {
        return res.status(400).json({ error: 'Email và mật khẩu là bắt buộc' });
    }

    try {
        const { data: user, error } = await supabase
            .from('qc_users')
            .select('email, password_hash')
            .eq('email', email.toLowerCase().trim())
            .eq('is_active', true)
            .single();

        if (error || !user) {
            return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
        }

        if (!user.password_hash) {
            return res.status(401).json({ error: 'Tài khoản chưa có mật khẩu. Vui lòng dùng SeaTalk hoặc liên hệ admin.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
        }

        const token = createToken(email);
        return res.status(200).json({ success: true, token });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Lỗi máy chủ' });
    }
}