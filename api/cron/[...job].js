import alertHandler from '../../../lib/cron/alert.js';
import reportHandler from '../../../lib/cron/report.js';
import hourlyReportHandler from '../../../lib/cron/hourlyReport.js';

export default async function handler(req, res) {
    const secret = req.headers['x-cron-secret'];
    if (secret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { job } = req.query; // ['alert'], ['report'], ['hourly-report']
    const jobName = job?.[0];

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        if (jobName === 'alert') return await alertHandler(req, res);
        if (jobName === 'report') return await reportHandler(req, res);
        if (jobName === 'hourly-report') return await hourlyReportHandler(req, res);
        return res.status(404).json({ error: 'Unknown job' });
    } catch (error) {
        console.error(`Cron job ${jobName} failed:`, error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}