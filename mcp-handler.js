const TOOLS = [
  {
    name: 'list_services',
    description: 'List all configured services, their details, and current status.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'start_service',
    description: 'Start a configured service by ID or Name.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'The numeric ID of the service.' },
        name: { type: 'string', description: 'The name of the service (optional if ID is given).' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'stop_service',
    description: 'Stop a running service by ID or Name.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'The numeric ID of the service.' },
        name: { type: 'string', description: 'The name of the service (optional if ID is given).' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'restart_service',
    description: 'Restart a service by ID or Name.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'The numeric ID of the service.' },
        name: { type: 'string', description: 'The name of the service (optional if ID is given).' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'get_service_logs',
    description: 'Get the latest console logs of a service by ID or Name.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'The numeric ID of the service.' },
        name: { type: 'string', description: 'The name of the service (optional if ID is given).' },
        limit: { type: 'number', description: 'Number of log lines to retrieve (default: 100).' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'add_service',
    description: 'Add a new service configuration to DevLaunch.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the service.' },
        project: { type: 'string', description: 'Project category name.' },
        cmd: { type: 'string', description: 'Command line string to run.' },
        dir: { type: 'string', description: 'CWD directory path to execute the command.' },
        localUrl: { type: 'string', description: 'Local URL (optional).' }
      },
      required: ['name', 'project', 'cmd', 'dir'],
      additionalProperties: false
    }
  },
  {
    name: 'delete_service',
    description: 'Delete a service configuration and stop it if running.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'The numeric ID of the service.' },
        name: { type: 'string', description: 'The name of the service (optional if ID is given).' }
      },
      additionalProperties: false
    }
  }
];

class McpHandler {
  constructor() {
    this.state = 'UNINITIALIZED'; // UNINITIALIZED | INITIALIZED
  }

  async handleMessage(request, context) {
    if (!request || typeof request !== 'object' || request.jsonrpc !== '2.0') {
      return {
        jsonrpc: '2.0',
        id: request ? request.id : null,
        error: { code: -32700, message: 'Parse error: invalid JSON-RPC payload' }
      };
    }

    const { id, method, params } = request;

    // Handle notifications (no id)
    if (id === undefined || id === null) {
      if (method === 'notifications/initialized') {
        this.state = 'INITIALIZED';
        return null;
      }
      // Other notifications: ignore
      return null;
    }

    // Handle ping first (valid anytime)
    if (method === 'ping') {
      return { jsonrpc: '2.0', id, result: {} };
    }

    // Enforce lifecycle sequence
    if (this.state === 'UNINITIALIZED') {
      if (method === 'initialize') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: params.protocolVersion || '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'devlaunch-mcp',
              version: '1.2.0'
            }
          }
        };
      } else {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32002, message: 'Server not initialized. Call initialize first.' }
        };
      }
    }

    // Server is INITIALIZED
    try {
      switch (method) {
        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools: TOOLS
            }
          };

        case 'tools/call':
          if (!params || typeof params !== 'object' || !params.name) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32602, message: 'Invalid params: name required' }
            };
          }
          return await this.callTool(id, params.name, params.arguments || {}, context);

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${method}` }
          };
      }
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: `Internal error: ${err.message}` }
      };
    }
  }

  async callTool(id, toolName, args, context) {
    const findService = (services) => {
      if (args.id !== undefined && args.id !== null) {
        return services.find(s => Number(s.id) === Number(args.id));
      }
      if (args.name) {
        return services.find(s => s.name.toLowerCase() === args.name.toLowerCase());
      }
      return null;
    };

    switch (toolName) {
      case 'list_services': {
        const services = await context.listServices();
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: JSON.stringify(services, null, 2)
            }],
            structuredContent: { services },
            isError: false
          }
        };
      }

      case 'start_service': {
        const services = await context.listServices();
        const service = findService(services);
        if (!service) {
          return this.toolError(id, `Service not found with ID: ${args.id || ''} or Name: ${args.name || ''}`);
        }
        const success = await context.startService(service.id);
        if (success) {
          return this.toolSuccess(id, `Service '${service.name}' started successfully.`);
        } else {
          return this.toolError(id, `Failed to start service '${service.name}'. It might already be running.`);
        }
      }

      case 'stop_service': {
        const services = await context.listServices();
        const service = findService(services);
        if (!service) {
          return this.toolError(id, `Service not found with ID: ${args.id || ''} or Name: ${args.name || ''}`);
        }
        await context.stopService(service.id);
        return this.toolSuccess(id, `Service '${service.name}' stopped successfully.`);
      }

      case 'restart_service': {
        const services = await context.listServices();
        const service = findService(services);
        if (!service) {
          return this.toolError(id, `Service not found with ID: ${args.id || ''} or Name: ${args.name || ''}`);
        }
        const success = await context.restartService(service.id);
        if (success) {
          return this.toolSuccess(id, `Service '${service.name}' restarted successfully.`);
        } else {
          return this.toolError(id, `Failed to restart service '${service.name}'.`);
        }
      }

      case 'get_service_logs': {
        const services = await context.listServices();
        const service = findService(services);
        if (!service) {
          return this.toolError(id, `Service not found with ID: ${args.id || ''} or Name: ${args.name || ''}`);
        }
        const logs = await context.getLogs(service.id);
        const limit = Number(args.limit) || 100;
        const slicedLogs = logs.slice(-limit);
        const textLogs = slicedLogs.map(l => `[${l.time}] [${l.type}] ${l.text}`).join('\n');
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: textLogs || 'No logs available.'
            }],
            structuredContent: { logs: slicedLogs },
            isError: false
          }
        };
      }

      case 'add_service': {
        const { name, project, cmd, dir, localUrl } = args;
        const newService = await context.addService({ name, project, cmd, dir, localUrl });
        if (newService) {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{
                type: 'text',
                text: `Service '${name}' added successfully with ID ${newService.id}.`
              }],
              structuredContent: { service: newService },
              isError: false
            }
          };
        } else {
          return this.toolError(id, `Failed to add service. Duplicate name or invalid configurations.`);
        }
      }

      case 'delete_service': {
        const services = await context.listServices();
        const service = findService(services);
        if (!service) {
          return this.toolError(id, `Service not found with ID: ${args.id || ''} or Name: ${args.name || ''}`);
        }
        await context.deleteService(service.id);
        return this.toolSuccess(id, `Service '${service.name}' deleted successfully.`);
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Tool not found: ${toolName}` }
        };
    }
  }

  toolSuccess(id, text) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text }],
        isError: false
      }
    };
  }

  toolError(id, text) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text }],
        isError: true
      }
    };
  }
}

module.exports = McpHandler;
