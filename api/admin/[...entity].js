// api/admin/[...entity].js
import { requireAdmin } from '../../lib/auth/auth.js';
import usersHandler from '../../lib/admin/users.js';
import rolesHandler from '../../lib/admin/roles.js';
import assignmentsHandler from '../../lib/admin/assignments.js';
import { getPathSegments } from '../../lib/path-utils.js';

export default async function handler(req, res) {
    // Xác định resource (users, roles, assignments)
    const entity = getPathSegments(req, 'admin');
    const resource = entity[0];

    // Tất cả request admin đều yêu cầu quyền admin
    const auth = await requireAdmin(req);
    if (!auth.authorized) {
        if (auth.reason === 'missing_token' || auth.reason === 'invalid_token') {
            return res.status(401).json({ error: 'Unauthorized - Please login' });
        }
        return res.status(403).json({ error: 'Forbidden - Admin access required' });
    }

    // Điều hướng đến handler tương ứng
    switch (resource) {
        case 'users':
            return usersHandler(req, res);
        case 'roles':
            return rolesHandler(req, res);
        case 'assignments':
            return assignmentsHandler(req, res);
        default:
            return res.status(404).json({ error: 'Admin resource not found' });
    }
}