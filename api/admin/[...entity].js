// api/admin/[...entity].js
import { requireAdmin } from '../../lib/auth/auth.js';
import usersHandler from '../../lib/admin/users.js';
import rolesHandler from '../../lib/admin/roles.js';
import assignmentsHandler from '../../lib/admin/assignments.js'; // thêm
import { getPathSegments } from '../../lib/path-utils.js';

export default async function handler(req, res) {
    const entity = getPathSegments(req, 'admin');
    const resource = entity[0];

    if (resource === 'users') {
        if (req.method === 'GET') return usersHandler(req, res);
        if (await requireAdmin(req)) return usersHandler(req, res);
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (resource === 'roles') {
        if (req.method === 'GET') return rolesHandler(req, res);
        if (await requireAdmin(req)) return rolesHandler(req, res);
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (resource === 'assignments') {
        if (req.method === 'GET') return assignmentsHandler(req, res);
        if (await requireAdmin(req)) return assignmentsHandler(req, res);
        return res.status(401).json({ error: 'Unauthorized' });
    }

    return res.status(404).json({ error: 'Admin resource not found' });
}