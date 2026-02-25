module.exports = {
  apps: [
    {
      name: 'log-backend',
      cwd: './backend',
      script: 'server.js',
      instances: '10',
      exec_mode: 'cluster',
      watch: true,
      ignore_watch: ['node_modules', 'logs'],
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'log-agent',
      cwd: './agent',
      script: 'collector.js',
      instances: 1,
      exec_mode: 'fork',
      watch: true,
      ignore_watch: ['node_modules', 'logs'],
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'log-frontend',
      cwd: './frontend',
      script: 'npm',
      args: 'run prod',
      instances: 1,
      exec_mode: 'fork',
      watch: true,
      ignore_watch: ['node_modules', 'dist'],
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'monitoring-backend',
      cwd: '../monitoringsys/server',
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: true,
      ignore_watch: ['node_modules', 'logs'],
      env: {
        NODE_ENV: 'production',
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
      cwd: '../monitoringsys/agent',
      script: 'venv/bin/python',
      args: 'agent.py',
      instances: 1,
      exec_mode: 'fork',
      watch: true,
      ignore_watch: ['__pycache__', 'logs', 'venv'],
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
