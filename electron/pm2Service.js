const pm2 = require('pm2');

let isConnected = false;

function connect() {
  return new Promise((resolve, reject) => {
    if (isConnected) return resolve();
    pm2.connect(false, (err) => {
      if (err) {
        console.error('[PM2] Connection error:', err);
        return reject(err);
      }
      isConnected = true;
      console.log('[PM2] Connected');
      resolve();
    });
  });
}

function disconnect() {
  if (isConnected) {
    pm2.disconnect();
    isConnected = false;
    console.log('[PM2] Disconnected');
  }
}

async function listProcesses() {
  await connect();
  return new Promise((resolve, reject) => {
    pm2.list((err, list) => {
      if (err) return reject(err);
      resolve(
        list.map((proc) => ({
          pid: proc.pid,
          name: proc.name,
          pm_id: proc.pm_id,
          status: proc.pm2_env?.status || 'stopped',
          cpu: proc.monit?.cpu ?? 0,
          memory: proc.monit?.memory ?? 0,
          uptime:
            proc.pm2_env?.status === 'online'
              ? Date.now() - (proc.pm2_env?.pm_uptime || Date.now())
              : 0,
          restarts: proc.pm2_env?.restart_time ?? 0,
          pm_uptime: proc.pm2_env?.pm_uptime ?? null,
          created_at: proc.pm2_env?.created_at ?? null,
          version: proc.pm2_env?.version ?? null,
          exec_mode: proc.pm2_env?.exec_mode ?? 'fork',
          pm_cwd: proc.pm2_env?.pm_cwd ?? '',
          pm_exec_path: proc.pm2_env?.pm_exec_path ?? '',
        }))
      );
    });
  });
}

async function startProcess(proc) {
  await connect();
  return new Promise((resolve, reject) => {
    // Check if already exists, restart it
    pm2.describe(proc.name, (err, desc) => {
      if (!err && desc && desc.length > 0) {
        // Process exists, restart it
        pm2.restart(proc.name, (restartErr) => {
          if (restartErr) return reject(restartErr);
          resolve({ action: 'restarted', name: proc.name });
        });
      } else {
        // Start new
        const options = {
          name: proc.name,
          script: proc.script,
          args: proc.args || '',
          cwd: proc.cwd,
          interpreter: 'none',
          autorestart: false,
        };

        // Handle interpreter
        if (proc.script === 'node' || proc.script === 'npm' || proc.script === 'npx' || proc.script === 'bun' || proc.script === 'yarn' || proc.script === 'pnpm') {
          options.interpreter = proc.script;
          // Find the actual entry point from args
          const argsParts = (proc.args || '').split(' ');
          options.script = argsParts[0] || 'index.js';
          options.args = argsParts.slice(1).join(' ');

          if (proc.script === 'npm' || proc.script === 'bun' || proc.script === 'yarn' || proc.script === 'pnpm') {
            options.interpreter = 'none';
            options.script = proc.script;
            options.args = proc.args || '';
          }
        }

        pm2.start(
          {
            name: proc.name,
            script: proc.script,
            args: proc.args || '',
            cwd: proc.cwd,
            interpreter: 'none',
            autorestart: false,
            watch: false,
          },
          (startErr) => {
            if (startErr) return reject(startErr);
            resolve({ action: 'started', name: proc.name });
          }
        );
      }
    });
  });
}

async function stopProcess(name) {
  await connect();
  return new Promise((resolve, reject) => {
    pm2.stop(name, (err) => {
      if (err) return reject(err);
      resolve({ action: 'stopped', name });
    });
  });
}

async function restartProcess(name) {
  await connect();
  return new Promise((resolve, reject) => {
    pm2.restart(name, (err) => {
      if (err) {
        // If not running, try to find in config and start
        return reject(err);
      }
      resolve({ action: 'restarted', name });
    });
  });
}

async function deleteProcess(name) {
  await connect();
  return new Promise((resolve, reject) => {
    pm2.delete(name, (err) => {
      if (err) return reject(err);
      resolve({ action: 'deleted', name });
    });
  });
}

async function describeProcess(name) {
  await connect();
  return new Promise((resolve, reject) => {
    pm2.describe(name, (err, desc) => {
      if (err) return reject(err);
      resolve(desc);
    });
  });
}

async function flushLogs(name) {
  await connect();
  return new Promise((resolve, reject) => {
    pm2.flush(name, (err) => {
      if (err) return reject(err);
      resolve({ action: 'flushed', name });
    });
  });
}

module.exports = {
  connect,
  disconnect,
  listProcesses,
  startProcess,
  stopProcess,
  restartProcess,
  deleteProcess,
  describeProcess,
  flushLogs,
};
