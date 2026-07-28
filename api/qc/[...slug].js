// api/qc/[...slug].js
import { getPathSegments } from '../../lib/path-utils.js';
import authzHandler from '../../lib/qc/authz.js';
import meHandler from '../../lib/qc/me.js';
import logHandler from '../../lib/qc/log.js';
import dashboardHandler from '../../lib/qc/dashboard.js';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-QC-Session-Token, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const slug = getPathSegments(req, 'qc');
    const endpoint = slug[0];

    if (!endpoint) {
        return res.status(404).json({ error: 'QC endpoint is required' });
    }

    switch (endpoint) {
        case 'authz':
            return authzHandler(req, res);
        case 'me':
            return meHandler(req, res);
        case 'log':
            return logHandler(req, res);
        case 'dashboard':
            return dashboardHandler(req, res);
        default:
            return res.status(404).json({ error: `Unknown QC endpoint: ${endpoint}` });
    }
}