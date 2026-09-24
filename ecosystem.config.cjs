module.exports = {
  apps: [
    {
      name: 'gvms-backend',
      cwd: './backend',
      script: 'venv/Scripts/python.exe', // On Linux change to: 'venv/bin/uvicorn'
      args: '-m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PYTHONPATH: '.'
      }
    },
    {
      name: 'gvms-frontend',
      cwd: './frontend',
      script: 'npm',
      args: 'run preview',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
