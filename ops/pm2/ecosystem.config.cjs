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
    }
  ]
};
