const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');

// Phase 1 E2E Isolation: Create a completely separate, clean APPDATA environment
const tmpAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'devlaunch-mcp-test-'));

const testAppDataPath = process.platform === 'win32'
  ? tmpAppData
  : (process.platform === 'darwin'
      ? path.join(tmpAppData, 'Library', 'Application Support')
      : path.join(tmpAppData, '.config'));
const testUserDataPath = path.join(testAppDataPath, 'devlaunch');
const testServicesPath = path.join(testUserDataPath, 'services.json');

// Ensure directory and write default services.json with random port to prevent GUI conflicts
fs.mkdirSync(testUserDataPath, { recursive: true });
const mcpPort = 20288;
fs.writeFileSync(testServicesPath, JSON.stringify({
  services: [],
  mcpPort: mcpPort,
  mcpEnabled: false
}, null, 2));

function cleanupAndExit(code) {
  console.log(`Cleaning up test temp directory: ${tmpAppData}`);
  try {
    fs.rmSync(tmpAppData, { recursive: true, force: true });
  } catch (e) {
    console.error(`Failed to clean up temp directory: ${e.message}`);
  }
  process.exit(code);
}

let phase = 1; // Phase 1: Standalone, Phase 2: Proxy
let step = 0;
let child = null;
let buffer = '';
let createdServiceId = null;
const uniqueServiceName = 'MCP Test Service ' + Date.now();

// Mock HTTP/SSE GUI Server variables
let mockServer = null;
let mockSessions = new Map();

function startMockGuiServer(port) {
  return new Promise((resolve) => {
    mockServer = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = parsedUrl.pathname;
      
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      };

      if (req.method === 'OPTIONS') {
        res.writeHead(200, headers);
        res.end();
        return;
      }

      if (pathname === '/sse' && req.method === 'GET') {
        res.writeHead(200, {
          ...headers,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        const sessionId = 'mock-session-id';
        res.write(': keepalive\n\n');
        res.write(`event: endpoint\ndata: /message?sessionId=${sessionId}\n\n`);
        mockSessions.set(sessionId, res);
        return;
      }

      if (pathname === '/message' && req.method === 'POST') {
        const sessionId = parsedUrl.searchParams.get('sessionId');
        const clientRes = mockSessions.get(sessionId);
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          const payload = JSON.parse(body);
          let resp = null;
          
          if (payload.method === 'initialize') {
            resp = {
              jsonrpc: '2.0',
              id: payload.id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'devlaunch-mcp-mock-gui', version: '1.0.0' }
              }
            };
          } else if (payload.method === 'tools/list') {
            resp = {
              jsonrpc: '2.0',
              id: payload.id,
              result: {
                tools: [
                  { name: 'mock_gui_tool', description: 'Mock GUI Tool', inputSchema: { type: 'object' } }
                ]
              }
            };
          }

          if (resp && clientRes) {
            clientRes.write(`event: message\ndata: ${JSON.stringify(resp)}\n\n`);
          }
          res.writeHead(200, { 'Content-Type': 'text/plain', ...headers });
          res.end('OK');
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    mockServer.listen(port, '127.0.0.1', () => {
      console.log(`[Mock GUI Server] Listening on http://127.0.0.1:${port}`);
      resolve();
    });
  });
}

function stopMockGuiServer() {
  if (mockServer) {
    mockServer.close();
    mockServer = null;
  }
  for (const res of mockSessions.values()) {
    try { res.end(); } catch (e) {}
  }
  mockSessions.clear();
}

function spawnMcpServer() {
  console.log(`\nSpawning DevLaunch Standalone MCP Server (Phase ${phase})...`);
  child = spawn('node', ['mcp-server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      APPDATA: tmpAppData,
      HOME: tmpAppData
    }
  });

  buffer = '';
  step = 0;

  child.stderr.on('data', (data) => {
    console.log(`[STDERR] ${data.toString().trim()}`);
  });

  child.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.trim()) {
        handleMcpResponse(line.trim());
      }
    }
  });

  // Wait 3 seconds for boot and send initialize request
  setTimeout(() => {
    sendRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    });
  }, 3000);
}

function sendRequest(obj) {
  const str = JSON.stringify(obj) + '\n';
  console.log(`[SEND] ${str.trim()}`);
  child.stdin.write(str);
}

function handleMcpResponse(line) {
  console.log(`[RECV] ${line}`);
  try {
    const res = JSON.parse(line);
    
    if (phase === 1) {
      // PHASE 1: STANDALONE MODE
      if (step === 0) {
        if (res.result && res.result.serverInfo && res.result.serverInfo.name === 'devlaunch-mcp') {
          console.log('✓ Step 1 Passed: initialize success');
          step = 1;
          sendRequest({ jsonrpc: '2.0', method: 'notifications/initialized' });
          setTimeout(() => {
            sendRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
          }, 500);
        } else {
          console.error('✗ Step 1 Failed', res);
          cleanupAndExit(1);
        }
      } else if (step === 1) {
        if (res.id === 2 && res.result && res.result.tools) {
          console.log(`✓ Step 2 Passed: tools/list success, found ${res.result.tools.length} tools`);
          step = 2;
          sendRequest({ jsonrpc: '2.0', id: 3, method: 'invalid_method_test' });
        } else {
          console.error('✗ Step 2 Failed', res);
          cleanupAndExit(1);
        }
      } else if (step === 2) {
        if (res.id === 3 && res.error && res.error.code === -32601) {
          console.log('✓ Step 3 Passed: invalid method error handled correctly');
          step = 3;
          sendRequest({
            jsonrpc: '2.0',
            id: 4,
            method: 'tools/call',
            params: {
              name: 'add_service',
              arguments: {
                name: uniqueServiceName,
                project: 'Integration Test',
                cmd: 'echo "hello"',
                dir: 'C:\\'
              }
            }
          });
        } else {
          console.error('✗ Step 3 Failed', res);
          cleanupAndExit(1);
        }
      } else if (step === 3) {
        if (res.id === 4 && res.result && res.result.structuredContent) {
          const contentObj = res.result.structuredContent;
          createdServiceId = contentObj.service ? contentObj.service.id : null;
          console.log(`✓ Step 4 Passed: add_service success, service ID ${createdServiceId}`);
          step = 4;
          sendRequest({
            jsonrpc: '2.0',
            id: 5,
            method: 'tools/call',
            params: { name: 'list_services', arguments: {} }
          });
        } else {
          console.error('✗ Step 4 Failed', res);
          cleanupAndExit(1);
        }
      } else if (step === 4) {
        if (res.id === 5 && res.result && res.result.structuredContent) {
          const services = res.result.structuredContent.services || [];
          const found = services.some(s => s.id === createdServiceId && s.name === uniqueServiceName);
          if (found) {
            console.log('✓ Step 5 Passed: list_services verified new service exists');
            step = 5;
            sendRequest({
              jsonrpc: '2.0',
              id: 6,
              method: 'tools/call',
              params: { name: 'delete_service', arguments: { id: createdServiceId } }
            });
          } else {
            console.error('✗ Step 5 Failed: service not found', services);
            cleanupAndExit(1);
          }
        } else {
          console.error('✗ Step 5 Failed', res);
          cleanupAndExit(1);
        }
      } else if (step === 5) {
        if (res.id === 6 && res.result && !res.result.isError) {
          console.log('✓ Step 6 Passed: delete_service success');
          step = 6;
          sendRequest({
            jsonrpc: '2.0',
            id: 7,
            method: 'tools/call',
            params: { name: 'list_services', arguments: {} }
          });
        } else {
          console.error('✗ Step 6 Failed', res);
          cleanupAndExit(1);
        }
      } else if (step === 6) {
        if (res.id === 7 && res.result && res.result.structuredContent) {
          const services = res.result.structuredContent.services || [];
          const found = services.some(s => s.id === createdServiceId);
          if (!found) {
            console.log('✓ Step 7 Passed: list_services verified service is deleted');
            step = 7;
            sendRequest({
              jsonrpc: '2.0',
              id: 8,
              method: 'tools/call',
              params: { name: 'start_service', arguments: { id: 99999999 } }
            });
          } else {
            console.error('✗ Step 7 Failed: service was not deleted', services);
            cleanupAndExit(1);
          }
        } else {
          console.error('✗ Step 7 Failed', res);
          cleanupAndExit(1);
        }
      } else if (step === 7) {
        if (res.id === 8 && res.result && res.result.isError) {
          console.log('✓ Step 8 Passed: invalid service start handled correctly (isError: true)');
          console.log('PHASE 1 STANDALONE TEST PASSED SUCCESSFULLY!');
          
          // Clean up Phase 1
          child.kill();
          
          // Switch to Phase 2
          phase = 2;
          startMockGuiServer(mcpPort).then(() => {
            spawnMcpServer();
          });
        } else {
          console.error('✗ Step 8 Failed', res);
          cleanupAndExit(1);
        }
      }
    } else if (phase === 2) {
      // PHASE 2: PROXY MODE (VIA HTTP + SSE BRIDGE TO MOCK GUI)
      if (step === 0) {
        if (res.result && res.result.serverInfo && res.result.serverInfo.name === 'devlaunch-mcp-mock-gui') {
          console.log('✓ Phase 2 Step 1 Passed: proxy initialize successfully forwarded');
          step = 1;
          sendRequest({ jsonrpc: '2.0', method: 'notifications/initialized' });
          setTimeout(() => {
            sendRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
          }, 500);
        } else {
          console.error('✗ Phase 2 Step 1 Failed', res);
          cleanupAndExit(1);
        }
      } else if (step === 1) {
        if (res.id === 2 && res.result && res.result.tools) {
          const foundMockTool = res.result.tools.some(t => t.name === 'mock_gui_tool');
          if (foundMockTool) {
            console.log('✓ Phase 2 Step 2 Passed: proxy tools/list successfully forwarded and returned mock tools');
            console.log('ALL MCP TEST PHASES (STANDALONE & PROXY) PASSED SUCCESSFULLY!');
            
            // Clean up and exit
            child.kill();
            stopMockGuiServer();
            cleanupAndExit(0);
          } else {
            console.error('✗ Phase 2 Step 2 Failed: mock tool not found', res.result.tools);
            cleanupAndExit(1);
          }
        } else {
          console.error('✗ Phase 2 Step 2 Failed', res);
          cleanupAndExit(1);
        }
      }
    }
  } catch (err) {
    console.error('Failed to parse line:', err);
    cleanupAndExit(1);
  }
}

// Start first phase
spawnMcpServer();
