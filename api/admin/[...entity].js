import usersHandler from '../../lib/admin/users.js';
import rolesHandler from '../../lib/admin/roles.js';

export default async function handler(req, res) {
    // CORS headers (hoặc tin tưởng vercel.json)
    const { entity } = req.query; // ['users'] hoặc ['roles']
    if (entity[0] === 'users') return usersHandler(req, res);
    if (entity[0] === 'roles') return rolesHandler(req, res);
    return res.status(404).json({ error: 'Admin resource not found' });
}