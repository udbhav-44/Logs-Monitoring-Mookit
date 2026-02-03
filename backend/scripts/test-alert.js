
const path = require('path');
const fs = require('fs');

// Mock Environment Variables
process.env.SMTP_USER = 'test@example.com';
process.env.SMTP_PASS = 'password';
process.env.ALERT_TO_EMAIL = 'admin@example.com';
process.env.HOST = 'localhost';

// Mock Nodemailer
const nodemailer = require('nodemailer');
nodemailer.createTransport = () => ({
    sendMail: async (options) => {
        console.log('\n--- [MOCK] Email Sent ---');
        console.log('To:', options.to);
        console.log('Subject:', options.subject);
        console.log('HTML Preview saved to: alert-preview.html');
        fs.writeFileSync('alert-preview.html', options.html);
        return { messageId: 'mock-id-123' };
    }
});

// Mock ClickHouse
const clickhouse = require('../config/clickhouse');
clickhouse.getClient = () => ({
    query: async () => ({
        json: async () => [
            {
                actor: '192.168.1.100',
                count: 50,
                lastSeen: new Date().toISOString(),
                uids: ['admin', 'root', 'user1'],
                vms: ['vm-01', 'vm-02'],
                apps: ['nginx', 'auth-service'],
                sources: ['nginx'],
                urls: ['/api/login', '/admin', '/wp-login.php', '/api/v1/auth', '/secret'],
                lastUserAgent: 'Mozilla/5.0 (Hacker/1.0)'
            }
        ]
    })
});

// Import Service
const { checkAndAlert } = require('../services/alertService');

// Run Test
(async () => {
    console.log('Running Alert Service Test...');
    await checkAndAlert();
    console.log('Done.');
})();
