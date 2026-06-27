const net = require('net');
const path = require('path');
const readline = require('readline');
const ServiceManager = require('./service-manager');
const McpHandler = require('./mcp-handler');

const appData = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
const userDataPath = path.join(appData, 'devlaunch');

const serviceManager = new ServiceManager(userDataPath);
const data = serviceManager.loadData();
const port = data.mcpPort || 20263;

function isJsonRpcPayload(chunk) {
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
  try {
    const obj = JSON.parse(text.trim());
    return obj && obj.jsonrpc === '2.0';
  } catch {
    return false;
  }
}

// Attempt to connect to GUI instance first (Proxy Mode)
process.stderr.write(`[MCP Bridge] Attempting proxy connection to DevLaunch GUI on 127.0.0.1:${port}...\n`);

let fallbackTriggered = false;
const triggerFallback = () => {
  if (fallbackTriggered) return;
  fallbackTriggered = true;
  client.destroy();
  process.stderr.write('[MCP Standalone] GUI connection failed. Starting Standalone Headless Master Mode...\n');
  runStandaloneHeadless();
};

const client = net.createConnection({ port, host: '127.0.0.1' });
client.setTimeout(500); // 500ms timeout to detect GUI presence quickly

client.on('connect', () => {
  process.stderr.write('[MCP Bridge] Connected to GUI! Proxying stdio...\n');
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    client.write(line + '\n');
  });

  client.on('data', (chunk) => {
    process.stdout.write(chunk);
  });

  client.on('end', () => {
    process.exit(0);
  });

  client.on('error', () => {
    process.exit(1);
  });
});

client.on('timeout', () => {
  triggerFallback();
});

client.on('error', (err) => {
  process.stderr.write(`[MCP Bridge] GUI not found: ${err.message}\n`);
  triggerFallback();
});

function runStandaloneHeadless() {
  const mcpHandler = new McpHandler();

  // Stdio Purity Wrapper
  const originalStdoutWrite = process.stdout.write;
  process.stdout.write = (chunk, encoding, callback) => {
    if (isJsonRpcPayload(chunk)) {
      return originalStdoutWrite.call(process.stdout, chunk, encoding, callback);
    } else {
      return process.stderr.write(chunk, encoding, callback);
    }
  };

  // Listen to service log and status events
  serviceManager.on('log', ({ id, line }) => {
    process.stderr.write(`[Service log ${id}] [${line.type}] ${line.text}\n`);
  });

  serviceManager.on('status-change', ({ id, status, pid }) => {
    process.stderr.write(`[Service status ${id}] status: ${status} (PID: ${pid || 'N/A'})\n`);
    
    // Auto update status in services.json
    const data = serviceManager.loadData();
    const s = data.services.find(x => x.id === id);
    if (s) {
      s.status = status;
      serviceManager.saveData(data, `MCP Status Update: ${s.name} is ${status}`, true);
    }
  });

  serviceManager.on('url-detected', ({ id, local, network }) => {
    const data = serviceManager.loadData();
    const s = data.services.find(x => x.id === id);
    if (s) {
      if (local && !s.localUrl) s.localUrl = local;
      if (network && !s.networkUrl) s.networkUrl = network;
      if (local && !s.url) s.url = local;
      serviceManager.saveData(data, `URL Detected: ${s.name}`, true);
    }
  });

  // Headless context: requireApproval auto-denies mutating actions
  const context = {
    listServices: async () => {
      const data = serviceManager.loadData();
      return data.services;
    },
    startService: async (id) => {
      const data = serviceManager.loadData();
      const s = data.services.find(x => x.id === id);
      if (!s) return false;
      return serviceManager.startService(s);
    },
    stopService: async (id) => {
      await serviceManager.stopService(id);
    },
    restartService: async (id) => {
      const data = serviceManager.loadData();
      const s = data.services.find(x => x.id === id);
      if (!s) return false;
      return serviceManager.restartService(s);
    },
    getLogs: async (id) => {
      return serviceManager.getLogs(id);
    },
    addService: async (serviceData) => {
      return serviceManager.addService(serviceData);
    },
    deleteService: async (id) => {
      await serviceManager.deleteService(id);
    }
  };

  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    try {
      const req = JSON.parse(line);
      process.stderr.write(`[MCP Audit] Headless client invoked: ${req.method}\n`);
      const resp = await mcpHandler.handleMessage(req, context);
      if (resp) {
        originalStdoutWrite.call(process.stdout, JSON.stringify(resp) + '\n');
      }
    } catch (err) {
      process.stderr.write(`[MCP Error] Failed parsing JSON-RPC line: ${err.message}\n`);
    }
  });

  const handleExit = async () => {
    process.stderr.write('[MCP Server] Shutting down headless services...\n');
    await serviceManager.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);
}
