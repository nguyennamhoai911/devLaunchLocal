const { spawn } = require('child_process');
const path = require('path');

console.log('Spawning DevLaunch Standalone MCP Server...');
const child = spawn('node', ['mcp-server.js'], {
  cwd: path.resolve(__dirname, '..')
});

let buffer = '';
let step = 0;

child.stderr.on('data', (data) => {
  console.log(`[STDERR] ${data.toString().trim()}`);
});

child.stdout.on('data', (data) => {
  buffer += data.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop(); // keep remainder

  for (const line of lines) {
    if (line.trim()) {
      handleMcpResponse(line.trim());
    }
  }
});

function sendRequest(obj) {
  const str = JSON.stringify(obj) + '\n';
  console.log(`[SEND] ${str.trim()}`);
  child.stdin.write(str);
}

function handleMcpResponse(line) {
  console.log(`[RECV] ${line}`);
  try {
    const res = JSON.parse(line);
    if (step === 0) {
      // Expecting initialize response
      if (res.result && res.result.serverInfo && res.result.serverInfo.name === 'devlaunch-mcp') {
        console.log('✓ Step 1 Passed: initialize success');
        step = 1;
        // Send initialized notification (no response expected)
        sendRequest({
          jsonrpc: '2.0',
          method: 'notifications/initialized'
        });
        // Send tools/list request
        setTimeout(() => {
          sendRequest({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list'
          });
        }, 500);
      } else {
        console.error('✗ Step 1 Failed: expected initialize response', res);
        process.exit(1);
      }
    } else if (step === 1) {
      // Expecting tools/list response
      if (res.id === 2 && res.result && res.result.tools) {
        console.log(`✓ Step 2 Passed: tools/list success, found ${res.result.tools.length} tools`);
        const listTool = res.result.tools.find(t => t.name === 'list_services');
        if (listTool && typeof listTool.inputSchema === 'object') {
          console.log('✓ Step 2a Passed: tools schema is valid');
        } else {
          console.error('✗ Step 2a Failed: invalid tool schema', listTool);
          process.exit(1);
        }
        step = 2;
        // Call list_services
        sendRequest({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'list_services',
            arguments: {}
          }
        });
      } else {
        console.error('✗ Step 2 Failed: expected tools/list response', res);
        process.exit(1);
      }
    } else if (step === 2) {
      // Expecting tools/call list_services response
      if (res.id === 3 && res.result && res.result.structuredContent) {
        console.log('✓ Step 3 Passed: list_services tool call success');
        step = 3;
        // Test invalid method error handling
        sendRequest({
          jsonrpc: '2.0',
          id: 4,
          method: 'invalid_method_test'
        });
      } else {
        console.error('✗ Step 3 Failed: expected list_services response', res);
        process.exit(1);
      }
    } else if (step === 3) {
      // Expecting invalid method error
      if (res.id === 4 && res.error && res.error.code === -32601) {
        console.log('✓ Step 4 Passed: invalid method error handled correctly');
        step = 4;
        // Test invalid params
        sendRequest({
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'start_service',
            arguments: { id: 99999999 } // invalid ID
          }
        });
      } else {
        console.error('✗ Step 4 Failed: expected invalid method error', res);
        process.exit(1);
      }
    } else if (step === 4) {
      // Expecting start_service failure/error
      if (res.id === 5 && res.result && res.result.isError) {
        console.log('✓ Step 5 Passed: invalid service start handled correctly (isError: true)');
        console.log('ALL MCP TEST STEPS PASSED SUCCESSFULLY!');
        child.kill();
        process.exit(0);
      } else {
        console.error('✗ Step 5 Failed: expected isError: true on invalid service start', res);
        process.exit(1);
      }
    }
  } catch (err) {
    console.error('Failed to parse line:', err);
    process.exit(1);
  }
}

// Start sequence
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
}, 3000); // wait for boot
