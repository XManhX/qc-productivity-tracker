import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const AUTH_SECRET = process.env.AUTH_SECRET || 'default-secret';

export function verifyToken(token) {
    try {
        const parts = token.split('.');
        const payloadStr = Buffer.from(parts[0], 'base64url').toString();
        const payload = JSON.parse(payloadStr);
        if (payload.exp < Date.now()) return null;

        const expectedSig = crypto
            .createHmac('sha256', AUTH_SECRET)
            .update(payloadStr)
            .digest('hex');
        if (parts[1] !== expectedSig) return null;
        return payload.email;
    } catch {
        return null;
    }
}

export function createToken(email) {
    const payload = JSON.stringify({ email, exp: Date.now() + 24 * 60 * 60 * 1000 });
    const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
    return Buffer.from(`${payload}.${signature}`).toString('base64url');
}

export async function isAdmin(email) {
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_EMAIL === email) return true;
    const { data, error } = await supabase
        .from('qc_users')
        .select('qc_roles!inner(role_key)')
        .eq('email', email.toLowerCase())
        .eq('is_active', true)
        .single();
    if (error || !data) return false;
    return data.qc_roles.role_key === 'admin';
}

export async function requireAdmin(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
    const token = authHeader.slice(7);
    const email = verifyToken(token);
    if (!email) return false;
    return await isAdmin(email);
}