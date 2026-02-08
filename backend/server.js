const express = require('express');
const dotenv = require('dotenv');
dotenv.config();

const cors = require('cors');
const { connectClickHouse } = require('./config/clickhouse');
const cron = require('node-cron');
const alertService = require('./services/alertService');

connectClickHouse();


const app = express();

app.use(cors());
const jsonLimit = process.env.JSON_BODY_LIMIT || '10mb';
app.use(express.json({ limit: jsonLimit, inflate: true }));
app.use(express.urlencoded({ limit: jsonLimit, extended: false }));

const ingestRoutes = require('./routes/ingestRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const { startOverviewPrecompute, startApplicationsPrecompute } = require('./controllers/analyticsController');

app.use('/api/ingest', ingestRoutes);
app.use('/api/analytics', analyticsRoutes);

// Routes placeholder
app.get('/', (req, res) => {
    res.send('API is running...');
});

console.log('Loaded PORT from env:', process.env.PORT);
const PORT = process.env.PORT || 5002;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
    startOverviewPrecompute();
    startApplicationsPrecompute();

    // Schedule Security Alert Check (Every 5 minutes)
    // Only run on the first instance to avoid duplicate alerts in cluster mode
    if (process.env.NODE_APP_INSTANCE === '0' || process.env.NODE_APP_INSTANCE === undefined) {
        cron.schedule('*/5 * * * *', () => {
            alertService.checkAndAlert();
        });
    }
});

server.keepAliveTimeout = Number(process.env.HTTP_KEEPALIVE_TIMEOUT_MS) || 60000;
server.headersTimeout = Number(process.env.HTTP_HEADERS_TIMEOUT_MS) || 65000;
server.requestTimeout = Number(process.env.HTTP_REQUEST_TIMEOUT_MS) || 120000;
