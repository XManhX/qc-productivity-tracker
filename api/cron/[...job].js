// api/cron/[...job].js
import alertHandler from '../../lib/cron/alert.js';
import reportHandler from '../../lib/cron/report.js';
import hourlyReportHandler from '../../lib/cron/hourlyReport.js';
import { getPathSegments } from '../../lib/path-utils.js';

export default async function handler(req, res) {
    const secret = req.headers['x-cron-secret'];
    if (secret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized Cron' });
    }

    if (req.method === 'OPTIONS') return res.status(200).end();

    const job = getPathSegments(req, 'cron');
    const jobName = job[0];

    if (!jobName) {
        return res.status(404).json({ error: 'Cron job name required' });
    }

    try {
        switch (jobName) {
            case 'alert': return await alertHandler(req, res);
            case 'report': return await reportHandler(req, res);
            case 'hourly-report': return await hourlyReportHandler(req, res);
            default:
                return res.status(404).json({ error: `Unknown cron job: ${jobName}` });
        }
    } catch (error) {
        console.error(`Cron job ${jobName} failed:`, error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}