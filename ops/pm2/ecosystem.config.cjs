module.exports = {
  apps: [
    {
      name: 'log-backend',
      cwd: './backend',
      script: 'server.js',
      instances: '10',
      exec_mode: 'cluster',
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
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'log-frontend',
      cwd: './frontend',
      script: 'node_modules/.bin/vite',
      args: 'preview --host 0.0.0.0 --port 5173',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
