import alertHandler from '../../lib/cron/alert.js';
import reportHandler from '../../lib/cron/report.js';
import hourlyReportHandler from '../../lib/cron/hourlyReport.js';

export default async function handler(req, res) {
    // Kiểm tra cron secret
    const secret = req.headers['x-cron-secret'];
    if (secret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { job } = req.query; // ['alert'], ['report'], ['hourly-report']
    if (job[0] === 'alert') return alertHandler(req, res);
    if (job[0] === 'report') return reportHandler(req, res);
    if (job[0] === 'hourly-report') return hourlyReportHandler(req, res);
    return res.status(404).json({ error: 'Unknown cron job' });
}