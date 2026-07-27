// lib/auth.js
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const AUTH_SECRET = process.env.AUTH_SECRET || 'default-secret';

/**
 * Giải mã token và trả về email nếu hợp lệ, ngược lại null
 */
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

/**
 * Kiểm tra email có quyền admin hay không.
 * - Nếu ADMIN_EMAIL được set trong biến môi trường → so sánh trực tiếp.
 * - Nếu không → kiểm tra trong DB qc_users: role_key phải là 'admin'.
 */
export async function isAdmin(email) {
    // 1. Kiểm tra biến môi trường (cách nhanh nhất)
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_EMAIL === email) {
        return true;
    }

    // 2. Kiểm tra role trong DB
    const { data, error } = await supabase
        .from('qc_users')
        .select('qc_roles!inner(role_key)')
        .eq('email', email.toLowerCase())
        .eq('is_active', true)
        .single();

    if (error || !data) return false;
    return data.qc_roles.role_key === 'admin';
}

/**
 * Middleware: kiểm tra request có token hợp lệ và user có quyền admin không.
 * Trả về true nếu hợp lệ, ngược lại false.
 */
export async function requireAdmin(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return false;

    const token = authHeader.slice(7);
    const email = verifyToken(token);
    if (!email) return false;

    return await isAdmin(email);
}