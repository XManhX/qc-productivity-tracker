import publicHandler from '../../lib/config/public.js';
import alertHandler from '../../lib/config/alert.js';
import targetsHandler from '../../lib/config/targets.js';

export default async function handler(req, res) {
    const { key } = req.query; // ['public'], ['alert'], ['targets']
    if (key[0] === 'public') return publicHandler(req, res);
    if (key[0] === 'alert') return alertHandler(req, res);
    if (key[0] === 'targets') return targetsHandler(req, res);
    return res.status(404).json({ error: 'Config not found' });
}