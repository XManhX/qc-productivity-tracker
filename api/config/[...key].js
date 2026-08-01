import { requireAdmin } from '../../lib/auth/auth.js';
import publicHandler from '../../lib/config/public.js';
import alertHandler from '../../lib/config/alert.js';
import targetsHandler from '../../lib/config/targets.js';
import mappingsHandler from '../../lib/config/mappings.js';
import { getPathSegments } from '../../lib/path-utils.js';

export default async function handler(req, res) {
    const key = getPathSegments(req, 'config');
    const resource = key[0];

    // Public config không cần auth
    if (resource === 'public') return publicHandler(req, res);

    // Các resource còn lại yêu cầu quyền admin cho mọi method (kể cả GET)
    if (resource === 'alert' || resource === 'targets') {
        if (req.method === 'GET') {
            // GET vẫn cần admin (dữ liệu nhạy cảm)
            const auth = await requireAdmin(req);
            if (!auth.authorized) {
                if (auth.reason === 'missing_token' || auth.reason === 'invalid_token') {
                    return res.status(401).json({ error: 'Unauthorized - Please login' });
                }
                return res.status(403).json({ error: 'Forbidden - Admin access required' });
            }
            // Cho phép truy cập
            return resource === 'alert' ? alertHandler(req, res) : targetsHandler(req, res);
        }

        // POST, PUT, DELETE cũng yêu cầu admin
        const auth = await requireAdmin(req);
        if (!auth.authorized) {
            if (auth.reason === 'missing_token' || auth.reason === 'invalid_token') {
                return res.status(401).json({ error: 'Unauthorized - Please login' });
            }
            return res.status(403).json({ error: 'Forbidden - Admin access required' });
        }
        return resource === 'alert' ? alertHandler(req, res) : targetsHandler(req, res);
    }

    if (resource === 'mappings') {
        return mappingsHandler(req, res);
    }

    return res.status(404).json({ error: 'Config not found' });
}