const nodemailer = require('nodemailer');

class EmailNotifier {
    constructor() {
        this.transporter = null;
        this.enabled = false;
        this.config = {
            from: process.env.EMAIL_FROM || 'monitoring@example.com',
            fromName: process.env.EMAIL_FROM_NAME || 'System Monitor',
            adminEmails: process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : []
        };
        
        this.initialize();
    }

    initialize() {
        try {
            // Check if email configuration exists
            if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
                console.log('\n' + '='.repeat(70));
                console.log(' EMAIL NOTIFICATIONS: DISABLED');
                console.log('='.repeat(70));
                console.log('Reason: SMTP configuration not found in .env file');
                console.log('To enable email alerts, configure these variables:');
                console.log('  - SMTP_HOST');
                console.log('  - SMTP_USER');
                console.log('  - SMTP_PASS');
                console.log('  - ADMIN_EMAILS');
                console.log('='.repeat(70) + '\n');
                return;
            }

            // Create transporter
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                },
                tls: {
                    rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false'
                }
            });

            this.enabled = true;
            
            console.log('\n' + '='.repeat(70));
            console.log('EMAIL NOTIFICATIONS: ENABLED');
            console.log('='.repeat(70));
            console.log(`SMTP Host:    ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || '587'}`);
            console.log(`SMTP User:    ${process.env.SMTP_USER}`);
            console.log(`From:         ${this.config.fromName} <${this.config.from}>`);
            console.log(`Recipients:   ${this.config.adminEmails.join(', ')}`);
            console.log(`Dashboard:    ${this.getDashboardUrl()}`);
            console.log('-'.repeat(70));
            console.log('Verifying SMTP connection...');
            
            // Verify connection
            this.verifyConnection();
        } catch (error) {
            console.log('\n' + '='.repeat(70));
            console.log('❌ EMAIL NOTIFICATIONS: INITIALIZATION FAILED');
            console.log('='.repeat(70));
            console.error(`Error: ${error.message}`);
            console.log('='.repeat(70) + '\n');
            this.enabled = false;
        }
    }

    async verifyConnection() {
        if (!this.enabled) return;

        try {
            await this.transporter.verify();
            console.log('SMTP connection verified successfully');
            console.log('='.repeat(70) + '\n');
        } catch (error) {
            console.log('SMTP connection verification failed');
            console.error(`Error: ${error.message}`);
            console.log('='.repeat(70) + '\n');
            this.enabled = false;
        }
    }

    /**
     * Send grouped service alerts notification email
     */
    async sendGroupedServiceAlerts(alerts, vmInfo = {}) {
        if (!this.enabled) {
            console.log('Email notifications disabled, skipping...');
            return { success: false, reason: 'disabled' };
        }

        if (this.config.adminEmails.length === 0) {
            console.log('No admin emails configured, skipping...');
            return { success: false, reason: 'no_recipients' };
        }

        try {
            const vmId = vmInfo.vmId || 'unknown';
            const hostname = vmInfo.hostname || 'unknown';
            const serviceCount = alerts.length;
            
            // Get highest severity
            const hasCritical = alerts.some(a => a.severity === 'critical');
            const severity = hasCritical ? 'critical' : 'warning';
            const severityColor = severity === 'critical' ? '#f7768e' : '#ffc107';
            
            const subject = `[${severity.toUpperCase()}] ${serviceCount} Service${serviceCount > 1 ? 's' : ''} Down - ${hostname}`;
            const html = this.buildGroupedServiceEmail(alerts, vmInfo, severityColor);
            const text = this.buildGroupedServiceEmailText(alerts, vmInfo);

            const mailOptions = {
                from: `"${this.config.fromName}" <${this.config.from}>`,
                to: this.config.adminEmails.join(', '),
                subject: subject,
                text: text,
                html: html
            };

            console.log('\n' + '='.repeat(70));
            console.log('SENDING GROUPED SERVICE ALERT EMAIL');
            console.log('='.repeat(70));
            console.log(`From:     ${this.config.fromName} <${this.config.from}>`);
            console.log(`To:       ${this.config.adminEmails.join(', ')}`);
            console.log(`Subject:  ${subject}`);
            console.log(`Services: ${alerts.map(a => {
                const metricType = a.metricType || a.metric_type;
                return metricType ? metricType.replace('service_', '') : 'unknown';
            }).join(', ')}`);
            console.log(`VM:       ${hostname} (${vmId})`);
            console.log('-'.repeat(70));

            const info = await this.transporter.sendMail(mailOptions);
            
            console.log(`GROUPED EMAIL SENT SUCCESSFULLY`);
            console.log(`Message ID: ${info.messageId}`);
            console.log(`Response:   ${info.response || 'OK'}`);
            console.log('='.repeat(70) + '\n');
            
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.log('GROUPED EMAIL SEND FAILED');
            console.error(`Error: ${error.message}`);
            console.error(`Stack: ${error.stack}`);
            console.log('='.repeat(70) + '\n');
            return { success: false, error: error.message };
        }
    }

    /**
     * Build HTML email for grouped service alerts
     */
    buildGroupedServiceEmail(alerts, vmInfo, severityColor) {
        const vmId = vmInfo.vmId || 'unknown';
        const hostname = vmInfo.hostname || 'unknown';
        const serviceCount = alerts.length;
        
        const serviceRows = alerts.map(alert => {
            const metricType = alert.metricType || alert.metric_type;
            const serviceName = metricType ? metricType.replace('service_', '') : 'unknown';
            const downTime = this.formatDowntime(alert.triggered_at);
            
            return `
                <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #eee;">
                        <strong style="color: ${severityColor};">${serviceName}</strong>
                    </td>
                    <td style="padding: 12px; border-bottom: 1px solid #eee; color: #666;">
                        ${downTime}
                    </td>
                    <td style="padding: 12px; border-bottom: 1px solid #eee; font-size: 13px; color: #888;">
                        ${alert.message}
                    </td>
                </tr>
            `;
        }).join('');
        
        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 700px; margin: 0 auto; padding: 20px; }
        .header { background: ${severityColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { background: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px; }
        .alert-box { background: white; padding: 15px; border-left: 4px solid ${severityColor}; margin: 15px 0; border-radius: 4px; }
        table { width: 100%; background: white; border-radius: 4px; overflow: hidden; }
        .footer { text-align: center; padding: 20px; color: #999; font-size: 12px; }
        .button { display: inline-block; padding: 12px 24px; background: #7aa2f7; color: white; text-decoration: none; border-radius: 6px; margin: 10px 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚠️ ${serviceCount} Service${serviceCount > 1 ? 's' : ''} Down</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">${hostname}</p>
        </div>
        <div class="content">
            <div class="alert-box">
                <p style="font-size: 16px; margin: 0;">
                    The following services are currently down and require attention:
                </p>
            </div>
            
            <table cellspacing="0" cellpadding="0">
                <thead>
                    <tr style="background: #f8f8f8;">
                        <th style="padding: 12px; text-align: left; font-weight: 600;">Service</th>
                        <th style="padding: 12px; text-align: left; font-weight: 600;">Status</th>
                        <th style="padding: 12px; text-align: left; font-weight: 600;">Details</th>
                    </tr>
                </thead>
                <tbody>
                    ${serviceRows}
                </tbody>
            </table>
        </div>
        <div class="footer">
            <p>This is an automated grouped alert from your System Monitor</p>
        </div>
    </div>
</body>
</html>
        `;
    }

    /**
     * Build plain text email for grouped service alerts
     */
    buildGroupedServiceEmailText(alerts, vmInfo) {
        const vmId = vmInfo.vmId || 'unknown';
        const hostname = vmInfo.hostname || 'unknown';
        const serviceCount = alerts.length;
        
        const serviceList = alerts.map(alert => {
            const metricType = alert.metricType || alert.metric_type;
            const serviceName = metricType ? metricType.replace('service_', '') : 'unknown';
            const downTime = this.formatDowntime(alert.triggered_at);
            return `  - ${serviceName} (${downTime})\n    ${alert.message}`;
        }).join('\n\n');
        
        return `
⚠️ ${serviceCount} SERVICE${serviceCount > 1 ? 'S' : ''} DOWN

VM / Hostname: ${hostname}
VM ID: ${vmId}

The following services are currently down:

${serviceList}

---
This is an automated grouped alert from your System Monitor
        `;
    }

    /**
     * Format downtime duration
     */
    formatDowntime(triggeredAt) {
        const now = new Date();
        const triggered = new Date(triggeredAt);
        const diffMs = now - triggered;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `Down for ${diffMins} min`;
        
        const diffHours = Math.floor(diffMins / 60);
        const remainingMins = diffMins % 60;
        
        if (diffHours < 24) {
            return remainingMins > 0 
                ? `Down for ${diffHours}h ${remainingMins}m`
                : `Down for ${diffHours}h`;
        }
        
        const diffDays = Math.floor(diffHours / 24);
        return `Down for ${diffDays}d ${diffHours % 24}h`;
    }

    /**
     * Send alert notification email
     */
    async sendAlertNotification(alert, vmInfo = {}) {
        if (!this.enabled) {
            console.log('Email notifications disabled, skipping...');
            return { success: false, reason: 'disabled' };
        }

        if (this.config.adminEmails.length === 0) {
            console.log('No admin emails configured, skipping...');
            return { success: false, reason: 'no_recipients' };
        }

        try {
            // Normalize alert object (handle both snake_case and camelCase)
            const normalizedAlert = {
                severity: alert.severity || 'warning',
                hostname: alert.hostname || 'unknown',
                vm_id: alert.vm_id || alert.vmId || 'unknown',
                metric_type: alert.metric_type || alert.metricType || 'unknown',
                message: alert.message || 'No message',
                threshold_value: alert.threshold_value || alert.thresholdValue || 'N/A',
                current_value: alert.current_value || alert.currentValue || 'N/A',
                triggered_at: alert.triggered_at || alert.triggeredAt || new Date()
            };

            const subject = this.buildSubject(normalizedAlert);
            const html = this.buildAlertEmail(normalizedAlert, vmInfo);
            const text = this.buildAlertEmailText(normalizedAlert, vmInfo);

            const mailOptions = {
                from: `"${this.config.fromName}" <${this.config.from}>`,
                to: this.config.adminEmails.join(', '),
                subject: subject,
                text: text,
                html: html
            };

            const info = await this.transporter.sendMail(mailOptions);
            
            console.log(`EMAIL SENT SUCCESSFULLY`);
            console.log(`Message ID: ${info.messageId}`);
            console.log(`Response:   ${info.response || 'OK'}`);
            console.log('='.repeat(70) + '\n');
            
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.log('EMAIL SEND FAILED');
            console.error(`Error: ${error.message}`);
            console.error(`Stack: ${error.stack}`);
            console.log('='.repeat(70) + '\n');
            return { success: false, error: error.message };
        }
    }

    /**
     * Build email subject
     */
    buildSubject(alert) {
        const level = alert.severity.toUpperCase();
        const metric = this.getMetricLabel(alert.metric_type);
        
        return `[${level}] ${metric} - ${alert.hostname}`;
    }

    /**
     * Build HTML email for alert
     */
    buildAlertEmail(alert, vmInfo) {
        const severityColor = alert.severity === 'critical' ? '#f7768e' : '#ffc107';
        
        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${severityColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { background: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px; }
        .alert-box { background: white; padding: 15px; border-left: 4px solid ${severityColor}; margin: 15px 0; border-radius: 4px; }
        .metric { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        .metric:last-child { border-bottom: none; }
        .label { font-weight: 600; color: #666; }
        .value { color: #333; }
        .footer { text-align: center; padding: 20px; color: #999; font-size: 12px; }
        .button { display: inline-block; padding: 12px 24px; background: #7aa2f7; color: white; text-decoration: none; border-radius: 6px; margin: 10px 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${alert.severity.toUpperCase()} Alert</h1>
        </div>
        <div class="content">
            <div class="alert-box">
                <h2 style="margin-top: 0; color: ${severityColor};">${this.getMetricLabel(alert.metric_type)}</h2>
                <p style="font-size: 16px; margin: 10px 0;">${alert.message}</p>
            </div>
            
            <div style="background: white; padding: 15px; border-radius: 4px; margin: 15px 0;">
                <h3 style="margin-top: 0;">Alert Details</h3>
                <div class="metric">
                    <span class="label">VM / Hostname:</span>
                    <span class="value">${alert.hostname}</span>
                </div>
                <div class="metric">
                    <span class="label">VM ID:</span>
                    <span class="value">${alert.vm_id}</span>
                </div>
                <div class="metric">
                    <span class="label">Metric:</span>
                    <span class="value">${this.getMetricLabel(alert.metric_type)}</span>
                </div>
                <div class="metric">
                    <span class="label">Severity:</span>
                    <span class="value" style="color: ${severityColor}; font-weight: bold;">${alert.severity.toUpperCase()}</span>
                </div>
                <div class="metric">
                    <span class="label">Threshold:</span>
                    <span class="value">${alert.threshold_value}</span>
                </div>
                <div class="metric">
                    <span class="label">Current Value:</span>
                    <span class="value" style="color: ${severityColor}; font-weight: bold;">${alert.current_value}</span>
                </div>
                <div class="metric">
                    <span class="label">Triggered At:</span>
                    <span class="value">${new Date(alert.triggered_at).toLocaleString()}</span>
                </div>
            </div>
        </div>
        <div class="footer">
            <p>This is an automated alert from your System Monitor</p>
        </div>
    </div>
</body>
</html>
        `;
    }

    /**
     * Build plain text email for alert
     */
    buildAlertEmailText(alert, vmInfo) {
        const level = alert.severity.toUpperCase();
        
        return `
[${level}] ALERT

${this.getMetricLabel(alert.metric_type)}

${alert.message}

ALERT DETAILS:
--------------
VM / Hostname: ${alert.hostname}
VM ID: ${alert.vm_id}
Metric: ${this.getMetricLabel(alert.metric_type)}
Severity: ${alert.severity.toUpperCase()}
Threshold: ${alert.threshold_value}
Current Value: ${alert.current_value}
Triggered At: ${new Date(alert.triggered_at).toLocaleString()}

---
This is an automated alert from your System Monitor
        `;
    }

    /**
     * Get metric label
     */
    getMetricLabel(metricType) {
        const labels = {
            'cpu_usage': 'CPU Usage',
            'load_average': 'Load Average',
            'memory_usage': 'Memory Usage',
            'swap_usage': 'Swap Usage',
            'disk_usage': 'Disk Usage',
            'disk_inodes': 'Disk Inodes',
            'disk_io_wait': 'Disk I/O Wait'
        };
        
        if (metricType.startsWith('service_')) {
            const serviceName = metricType.replace('service_', '');
            return `Service: ${serviceName}`;
        }
        
        return labels[metricType] || metricType;
    }

    /**
     * Get dashboard URL
     */
    getDashboardUrl() {
        return process.env.DASHBOARD_URL || 'http://localhost:5173';
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('Email notifier configuration updated');
    }

    /**
     * Get current configuration (without sensitive data)
     */
    getConfig() {
        return {
            enabled: this.enabled,
            from: this.config.from,
            fromName: this.config.fromName,
            adminEmails: this.config.adminEmails,
            smtpConfigured: !!process.env.SMTP_HOST
        };
    }
}

module.exports = new EmailNotifier();
