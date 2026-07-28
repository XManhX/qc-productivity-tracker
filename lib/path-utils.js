// lib/path-utils.js
/**
 * Lấy các segment đường dẫn nằm sau `basePath` trong URL.
 * Hỗ trợ cả URL gốc và URL đã bị rewrite (có query param chứa path gốc).
 *
 * Ví dụ:
 * - basePath = 'qc', URL = /api/qc/dashboard?x=1 → ['dashboard']
 * - basePath = 'auth', URL = /api/auth/[...auth]?auth=login → ['login']
 * Luôn trả về mảng (có thể rỗng).
 */
export function getPathSegments(req, basePath) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // 1. Nếu URL đã bị rewrite, Vercel thường truyền path gốc vào query param cùng tên file.
    //    Ví dụ: /api/auth/[...auth]?auth=seatalk/callback
    if (url.searchParams.has(basePath)) {
        const raw = url.searchParams.get(basePath);
        return raw.split('/').filter(Boolean);
    }

    // 2. Ngược lại, parse trực tiếp từ pathname.
    const parts = url.pathname.split('/').filter(Boolean);   // ['api', 'auth', 'login']
    const idx = parts.indexOf(basePath);
    if (idx === -1) return [];
    return parts.slice(idx + 1);   // bỏ phần basePath, trả về các segment phía sau
}