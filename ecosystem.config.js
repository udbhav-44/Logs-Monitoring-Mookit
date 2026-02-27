module.exports = {
    apps: [
        {
            name: 'log-backend',
            script: 'server.js',
            cwd: './backend',
            instances: 'max',
            exec_mode: 'cluster',
            env: {
                PORT: 5002,
            }
        },
        {
            name: 'log-frontend',
            script: 'npm',
            args: 'run dev -- --host 0.0.0.0 --port 5173',
            cwd: './frontend',
            env: {
                VITE_MONITORING_API_URL: 'http://localhost:5000'
            }
        },
        {
            name: 'monitoring-backend',
            script: 'index.js',
            cwd: './monitoring-server',
            env: {
                PORT: 5000,
                DATABASE_TYPE: 'influxdb',
                INFLUXDB_HOST: 'http://localhost:8086',
                INFLUXDB_TOKEN: 'my-super-secret-auth-token',
                INFLUXDB_ORG: 'monitoring-org',
                INFLUXDB_BUCKET: 'monitoring'
            }
        },
        {
            name: 'monitoring-agent',
            script: 'node',
            args: 'agent.js',
            cwd: './monitoring-agent'
        }
    ]
};
