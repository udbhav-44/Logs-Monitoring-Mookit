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
        const newAlerts = [];

        // Look back 15 minutes
        const timeFilter = "timestamp >= now() - INTERVAL 15 MINUTE";

        // --- Threat Definitions ---
        const threats = [
            {
                type: 'Brute Force Attack',
                query: `
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
                `
            },
            {
                type: 'SQL Injection Attempt',
                query: `
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
                    WHERE ${timeFilter} AND (
                        url ILIKE '%UNION%SELECT%' OR 
                        url ILIKE '%OR%1=1%' OR 
                        url ILIKE '%--%' OR
                        url ILIKE '%DROP%TABLE%'
                    )
                    GROUP BY ip
                `
            },
            {
                type: 'XSS Attempt',
                query: `
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
                    WHERE ${timeFilter} AND (
                        url ILIKE '%<script>%' OR 
                        url ILIKE '%javascript:%' OR 
                        url ILIKE '%onerror=%'
                    )
                    GROUP BY ip
                `
            },
            {
                type: 'Path Traversal',
                query: `
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
                    WHERE ${timeFilter} AND (
                        url ILIKE '%../%' OR 
                        url ILIKE '%..%2F%' OR
                        url ILIKE '%/etc/passwd%'
                    )
                    GROUP BY ip
                `
            },
            {
                type: 'Sensitive File Access',
                query: `
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
                    WHERE ${timeFilter} AND (
                        url ILIKE '%.env%' OR 
                        url ILIKE '%.git%' OR
                        url ILIKE '%.aws%'
                    )
                    GROUP BY ip
                `
            }
        ];

        for (const threat of threats) {
            try {
                const result = await client.query({ query: threat.query, format: 'JSONEachRow' });
                const rows = await result.json();

                for (const row of rows) {
                    const key = `${threat.type}:${row.actor}`;
                    const lastSent = alertCache.get(key);

                    // 1 Hour Cooldown per threat type per actor
                    if (!lastSent || (Date.now() - lastSent > ALERT_COOLDOWN_MS)) {
                        newAlerts.push({
                            type: threat.type,
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
            } catch (queryError) {
                console.error(`Error executing query for ${threat.type}:`, queryError);
            }
        }

        if (newAlerts.length > 0) {
            await sendAlertEmail(newAlerts);
        } else {
            console.log('Alert Service: No new security alerts.');
        }

    } catch (error) {
        console.error('Alert Service Error:', error);
    }
};

const sendAlertEmail = async (alerts) => {
    // Group alerts by type for better readability
    const alertsByType = alerts.reduce((acc, alert) => {
        if (!acc[alert.type]) acc[alert.type] = [];
        acc[alert.type].push(alert);
        return acc;
    }, {});

    let emailBody = '';

    for (const [type, typeAlerts] of Object.entries(alertsByType)) {
        emailBody += `
            <h3 style="color: #d9534f; border-bottom: 2px solid #d9534f; padding-bottom: 5px;">${type} (${typeAlerts.length})</h3>
            <table style="border-collapse: collapse; width: 100%; font-size: 12px; margin-bottom: 20px;">
                <thead>
                    <tr style="background-color: #f2f2f2;">
                        <th style="border: 1px solid #ddd; padding: 6px;">Actor (IP)</th>
                        <th style="border: 1px solid #ddd; padding: 6px;">Count</th>
                        <th style="border: 1px solid #ddd; padding: 6px;">Details (URLs/Targets)</th>
                        <th style="border: 1px solid #ddd; padding: 6px;">Sources</th>
                        <th style="border: 1px solid #ddd; padding: 6px;">Time</th>
                    </tr>
                </thead>
                <tbody>
                    ${typeAlerts.map(a => `
                        <tr>
                            <td style="border: 1px solid #ddd; padding: 6px;">
                                <strong>${a.actor}</strong><br>
                                <span style="color: #666; font-size: 10px;">${a.userAgent || 'UA N/A'}</span>
                            </td>
                            <td style="border: 1px solid #ddd; padding: 6px; text-align: center;">${a.count}</td>
                            <td style="border: 1px solid #ddd; padding: 6px;">
                                <strong>Target URLs:</strong><br>
                                <div style="max-height: 100px; overflow-y: auto; word-break: break-all;">
                                    ${(a.urls || []).slice(0, 5).map(u => `<code>${u}</code>`).join('<br>')}
                                    ${(a.urls || []).length > 5 ? '<br>...more' : ''}
                                </div>
                                <br>
                                <strong>Apps:</strong> ${(a.apps || []).join(', ')}<br>
                                <strong>VMs:</strong> ${(a.vms || []).join(', ')}
                            </td>
                            <td style="border: 1px solid #ddd; padding: 6px;">${(a.sources || []).join(', ')}</td>
                            <td style="border: 1px solid #ddd; padding: 6px;">${new Date(a.time).toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    const htmlContent = `
        <div style="font-family: Arial, sans-serif;">
            <h2>Security Threat Report</h2>
            <p>The following suspicious activities were detected in the last 15 minutes:</p>
            ${emailBody}
            <p>Please check the <a href="http://${process.env.HOST || 'localhost'}:5173/security">Security Dashboard</a> for full logs.</p>
        </div>
    `;

    const mailOptions = {
        from: `"Log Monitor Security" <${process.env.SMTP_USER}>`,
        to: process.env.ALERT_TO_EMAIL,
        subject: `[SECURITY] ${alerts.length} Threats Detected - ${Object.keys(alertsByType).join(', ')}`,
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
