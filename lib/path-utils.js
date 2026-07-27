// lib/path-utils.js
/**
 * Lấy các segment đường dẫn nằm sau `basePath` trong URL.
 * Ví dụ: basePath = 'qc', URL = /api/qc/dashboard?x=1
 *        -> ['dashboard']
 * Luôn trả về mảng (có thể rỗng).
 */
export function getPathSegments(req, basePath) {
    // req.url là relative path (ví dụ: /api/qc/dashboard?x=1&...slug=dashboard)
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const parts = url.pathname.split('/').filter(Boolean); // ['api', 'qc', 'dashboard']
    const idx = parts.indexOf(basePath);
    if (idx === -1) return [];
    return parts.slice(idx + 1); // ['dashboard']
}