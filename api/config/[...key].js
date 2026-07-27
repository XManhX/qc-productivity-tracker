// api/config/[...key].js
import { requireAdmin } from '../../lib/auth/auth.js';
import publicHandler from '../../lib/config/public.js';
import alertHandler from '../../lib/config/alert.js';
import targetsHandler from '../../lib/config/targets.js';
import { getPathSegments } from '../../lib/path-utils.js';

export default async function handler(req, res) {
    const key = getPathSegments(req, 'config');
    const resource = key[0];

    if (resource === 'public') return publicHandler(req, res);

    if (resource === 'alert') {
        if (req.method === 'GET') return alertHandler(req, res);
        // if (await requireAdmin(req)) return alertHandler(req, res);
        return alertHandler(req, res);
        // return res.status(401).json({ error: 'Unauthorized' });
    }

    if (resource === 'targets') {
        if (req.method === 'GET') return targetsHandler(req, res);
        if (await requireAdmin(req)) return targetsHandler(req, res);
        return res.status(401).json({ error: 'Unauthorized' });
    }

    return res.status(404).json({ error: 'Config not found' });
}