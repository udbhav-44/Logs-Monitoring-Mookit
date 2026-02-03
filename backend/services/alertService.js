const nodemailer = require('nodemailer');
const { getClient } = require('../config/clickhouse');

// Cache to store sent alerts to prevent spamming
// Key: "type:actor", Value: timestamp
const alertCache = new Map();
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

const checkAndAlert = async () => {
    try {
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.ALERT_TO_EMAIL) {
            console.log('Alert Service: SMTP credentials or recipient missing. Skipping check.');
            return;
        }

        console.log('Alert Service: Checking for anomalies...');
        const client = getClient();

        // Look back 15 minutes
        const timeFilter = "timestamp >= now() - INTERVAL 15 MINUTE";

        // 1. Brute Force Query (High Severity)
        const bruteForceQuery = `
            SELECT 
                ip as actor,
                count() as count,
                max(timestamp) as lastSeen,
                groupUniqArray(uid) as uids,
                groupUniqArray(vmId) as vms,
                groupUniqArray(app) as apps,
                groupUniqArray(sourceType) as sources,
                groupUniqArray(url) as urls,
                argMax(userAgent, timestamp) as lastUserAgent
            FROM logs
            WHERE ${timeFilter} AND status IN (401, 403) AND ip != ''
            GROUP BY ip
            HAVING count > 20
        `;

        const result = await client.query({ query: bruteForceQuery, format: 'JSONEachRow' });
        const rows = await result.json();

        const newAlerts = [];

        for (const row of rows) {
            const key = `brute_force:${row.actor}`;
            const lastSent = alertCache.get(key);

            if (!lastSent || (Date.now() - lastSent > ALERT_COOLDOWN_MS)) {
                newAlerts.push({
                    type: 'Brute Force Attack',
                    actor: row.actor,
                    count: row.count,
                    time: row.lastSeen,
                    uids: row.uids,
                    vms: row.vms,
                    apps: row.apps,
                    sources: row.sources,
                    urls: row.urls,
                    userAgent: row.lastUserAgent
                });
                alertCache.set(key, Date.now());
            }
        }

        if (newAlerts.length > 0) {
            await sendAlertEmail(newAlerts);
        } else {
            console.log('Alert Service: No new high-severity alerts.');
        }

    } catch (error) {
        console.error('Alert Service Error:', error);
    }
};

const sendAlertEmail = async (alerts) => {
    const htmlContent = `
        <h2>Security Alert: High Severity Anomalies Detected</h2>
        <p>The following suspicious activities were detected in the last 15 minutes:</p>
        <table style="border-collapse: collapse; width: 100%; font-size: 12px;">
            <thead>
                <tr style="background-color: #f2f2f2;">
                    <th style="border: 1px solid #ddd; padding: 6px;">Type</th>
                    <th style="border: 1px solid #ddd; padding: 6px;">Actor (IP)</th>
                    <th style="border: 1px solid #ddd; padding: 6px;">Count</th>
                    <th style="border: 1px solid #ddd; padding: 6px;">Targets (VM/App)</th>
                    <th style="border: 1px solid #ddd; padding: 6px;">Sources</th>
                    <th style="border: 1px solid #ddd; padding: 6px;">Target URLs</th>
                    <th style="border: 1px solid #ddd; padding: 6px;">Users Involved</th>
                    <th style="border: 1px solid #ddd; padding: 6px;">Time</th>
                </tr>
            </thead>
            <tbody>
                ${alerts.map(a => `
                    <tr>
                        <td style="border: 1px solid #ddd; padding: 6px; color: red; font-weight: bold;">${a.type}</td>
                        <td style="border: 1px solid #ddd; padding: 6px;">
                            ${a.actor}<br>
                            <span style="color: #666; font-size: 10px;">${a.userAgent || 'UA N/A'}</span>
                        </td>
                        <td style="border: 1px solid #ddd; padding: 6px;">${a.count}</td>
                        <td style="border: 1px solid #ddd; padding: 6px;">
                            <strong>VMs:</strong> ${(a.vms || []).join(', ')}<br>
                            <strong>Apps:</strong> ${(a.apps || []).join(', ')}
                        </td>
                        <td style="border: 1px solid #ddd; padding: 6px;">${(a.sources || []).join(', ')}</td>
                        <td style="border: 1px solid #ddd; padding: 6px; max-width: 200px; word-wrap: break-word;">
                            ${(a.urls || []).slice(0, 5).join('<br>')}
                            ${(a.urls || []).length > 5 ? '<br>...more' : ''}
                        </td>
                        <td style="border: 1px solid #ddd; padding: 6px;">${(a.uids || []).slice(0, 10).join(', ')}</td>
                        <td style="border: 1px solid #ddd; padding: 6px;">${new Date(a.time).toLocaleString()}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <p>Please check the <a href="http://${process.env.HOST || 'localhost'}:5173/security">Security Dashboard</a> for more details.</p>
    `;

    const mailOptions = {
        from: `"Log Monitor Security" <${process.env.SMTP_USER}>`,
        to: process.env.ALERT_TO_EMAIL,
        subject: `[URGENT] ${alerts.length} Security Alerts Detected`,
        html: htmlContent
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Alert Email sent:', info.messageId);
    } catch (error) {
        console.error('Error sending alert email:', error);
    }
};

module.exports = { checkAndAlert };
