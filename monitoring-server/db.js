const { Pool } = require('pg');

// Create PostgreSQL connection pool
const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT || 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || 'postgres',
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Initialize database schema and hypertable
async function initializeDatabase() {
    const client = await pool.connect();
    try {
        console.log('Initializing TimescaleDB schema...');
        
        // Enable TimescaleDB extension
        await client.query('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;');
        console.log('✓ TimescaleDB extension enabled');
        
        // Create metrics table
        await client.query(`
            CREATE TABLE IF NOT EXISTS metrics (
                id SERIAL,
                vm_id TEXT NOT NULL,
                hostname TEXT NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL,
                cpu_usage DOUBLE PRECISION NOT NULL,
                cpu_cores DOUBLE PRECISION[],
                memory_total BIGINT NOT NULL,
                memory_used BIGINT NOT NULL,
                memory_percent DOUBLE PRECISION NOT NULL,
                disk_total BIGINT,
                disk_used BIGINT,
                disk_percent DOUBLE PRECISION,
                processes JSONB,
                services JSONB,
                PRIMARY KEY (id, timestamp)
            );
        `);
        console.log('✓ Metrics table created');
        
        // Convert to hypertable (only if not already a hypertable)
        try {
            await client.query(`
                SELECT create_hypertable('metrics', 'timestamp', 
                    if_not_exists => TRUE,
                    migrate_data => TRUE
                );
            `);
            console.log('✓ Hypertable created for time-series optimization');
        } catch (err) {
            if (err.message.includes('already a hypertable')) {
                console.log('✓ Hypertable already exists');
            } else {
                throw err;
            }
        }
        
        // Create indexes for better query performance
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_metrics_vm_id_timestamp 
            ON metrics (vm_id, timestamp DESC);
        `);
        console.log('✓ Indexes created');
        
        // Create alerts table (simple notification log)
        await client.query(`
            CREATE TABLE IF NOT EXISTS alerts (
                id SERIAL PRIMARY KEY,
                vm_id TEXT NOT NULL,
                hostname TEXT NOT NULL,
                metric_type TEXT NOT NULL,
                severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
                threshold_value TEXT NOT NULL,
                current_value TEXT NOT NULL,
                message TEXT NOT NULL,
                triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
        console.log('✓ Alerts table created');
        
        // Create indexes for alerts
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_alerts_vm_id_triggered 
            ON alerts (vm_id, triggered_at DESC);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_alerts_triggered 
            ON alerts (triggered_at DESC);
        `);
        console.log('✓ Alert indexes created');
        
        // Set up automatic data retention (optional - delete data older than 30 days)
        await client.query(`
            SELECT add_retention_policy('metrics', INTERVAL '30 days', if_not_exists => TRUE);
        `);
        console.log('✓ Retention policy set (30 days)');
        
        console.log('✓ Database initialization complete');
    } catch (error) {
        console.error('✗ Database initialization error:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

// Test database connection
pool.on('connect', () => {
    console.log('✓ Connected to TimescaleDB');
});

pool.on('error', (err) => {
    console.error('✗ Unexpected database error:', err);
});

module.exports = { pool, initializeDatabase };
