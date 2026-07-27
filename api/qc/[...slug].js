import authzHandler from '../../lib/qc/authz.js';
import meHandler from '../../lib/qc/me.js';
import logHandler from '../../lib/qc/log.js';
import dashboardHandler from '../../lib/qc/dashboard.js';

export default async function handler(req, res) {
    // Các handler tự set CORS, nhưng có thể thêm chung ở đây nếu muốn
    const { slug } = req.query; // ['authz'], ['me'], ['log'], ['dashboard']
    if (slug[0] === 'authz') return authzHandler(req, res);
    if (slug[0] === 'me') return meHandler(req, res);
    if (slug[0] === 'log') return logHandler(req, res);
    if (slug[0] === 'dashboard') return dashboardHandler(req, res);
    return res.status(404).json({ error: 'QC endpoint not found' });
}