const { createClient } = require('@clickhouse/client');

let client;

const connectClickHouse = async () => {
    const host = process.env.CLICKHOUSE_HOST || 'http://localhost:8123';
    const database = process.env.CLICKHOUSE_DATABASE || 'logs';
    const username = process.env.CLICKHOUSE_USER || 'default';
    const password = process.env.CLICKHOUSE_PASSWORD || '';

    try {
        client = createClient({
            url: host,
            database,
            username,
            password,
            request_timeout: 60000,
            compression: {
                request: true,
                response: true
            }
        });

        // Test connection by creating database if it doesn't exist
        await client.command({
            query: `CREATE DATABASE IF NOT EXISTS ${database}`,
        });

        // Create the logs table with optimized schema
        await client.command({
            query: `
                CREATE TABLE IF NOT EXISTS ${database}.logs (
                    timestamp DateTime,
                    sourceType LowCardinality(String),
                    app LowCardinality(String),
                    vmId LowCardinality(String),
                    method LowCardinality(String),
                    status UInt16,
                    level LowCardinality(String),
                    course LowCardinality(String),
                    rawMessage String,
                    url String,
                    ip String,
                    uid String,
                    userAgent String,
                    parsedMessage String,
                    responseSize Nullable(UInt32)
                ) ENGINE = MergeTree()
                ORDER BY (timestamp, app, sourceType)
                PARTITION BY toYYYYMM(timestamp)
                SETTINGS index_granularity = 8192
            `,
        });

        console.log(`ClickHouse client initialized for ${host} (Database: ${database})`);
    } catch (error) {
        console.error('Failed to initialize ClickHouse client:', error.message);
        throw error;
    }
};

const getClient = () => {
    if (!client) {
        throw new Error('ClickHouse client not initialized');
    }
    return client;
};

// Graceful shutdown
const closeClickHouse = async () => {
    if (client) {
        try {
            await client.close();
            console.log('ClickHouse client closed.');
        } catch (e) {
            console.error('Error closing ClickHouse client:', e);
        }
    }
};

module.exports = {
    connectClickHouse,
    getClient,
    closeClickHouse,
};
