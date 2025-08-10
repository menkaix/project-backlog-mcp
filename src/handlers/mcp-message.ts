import winston from 'winston';
import { ResourceManager } from '../resources.js';
import { PromptManager } from '../prompts.js';
import { AuthManager } from '../auth.js';
import { TOOL_PERMISSIONS } from '../types.js';

export interface MCPMessageHandlerDependencies {
  resourceManager: ResourceManager;
  promptManager: PromptManager;
  authManager: AuthManager;
  allTools: any[];
  allHandlers: Record<string, (args: any) => Promise<any>>;
  logger: winston.Logger;
}

export async function handleMCPMessage(
  message: any, 
  authToken: any, 
  requestId: string,
  deps: MCPMessageHandlerDependencies
) {
  const { method, params } = message;
  const { resourceManager, promptManager, authManager, allTools, allHandlers, logger } = deps;
  
  logger.info('MCP Message Processing', {
    requestId,
    method,
    params: params ? JSON.stringify(params, null, 2) : 'No params',
    tokenId: authToken.id,
    tokenType: authToken.type
  });

  if (method === 'initialize') {
    const clientVersion = params?.protocolVersion;
    const supportedVersions = ["2025-03-26", "2024-11-05"];
    
    // Use client's version if we support it, otherwise use our latest supported version
    const negotiatedVersion = supportedVersions.includes(clientVersion) ? clientVersion : supportedVersions[0];
    
    logger.info('MCP Initialize Request:', {
      requestId,
      clientProtocolVersion: clientVersion,
      negotiatedProtocolVersion: negotiatedVersion,
      capabilities: params?.capabilities,
      clientInfo: params?.clientInfo,
      tokenId: authToken.id,
      tokenType: authToken.type
    });

    return {
      result: {
        protocolVersion: negotiatedVersion,
        capabilities: {
          tools: {
            listChanged: true
          },
          resources: {
            subscribe: false,
            listChanged: false
          },
          prompts: {
            listChanged: false
          },
          logging: {}
        },
        serverInfo: {
          name: "project-backlog-mcp-server",
          version: "1.0.0"
        }
      }
    };
  }

  if (method === 'initialized') {
    logger.info('MCP Initialized Notification (HTTP):', {
      requestId,
      clientInfo: params?.clientInfo,
      timestamp: new Date().toISOString(),
      tokenId: authToken.id,
      tokenType: authToken.type
    });

    // The initialized notification typically doesn't return a response
    // It's a one-way notification from client to server
    return { result: {} };
  }

  if (method === 'tools/list') {
    logger.debug('Processing tools/list request', { requestId });
    
    const filteredTools = allTools.filter(tool => {
      const requiredPermissions = TOOL_PERMISSIONS[tool.name as keyof typeof TOOL_PERMISSIONS] || [];
      const hasPermission = authManager.hasPermission(authToken, [...requiredPermissions]);
      
      logger.debug('Tool Permission Check', {
        requestId,
        toolName: tool.name,
        requiredPermissions,
        userPermissions: authToken.permissions,
        hasPermission
      });
      
      return hasPermission;
    });
    
    logger.info('Tools List Response', {
      requestId,
      totalTools: allTools.length,
      filteredTools: filteredTools.length,
      toolNames: filteredTools.map(t => t.name)
    });
    
    return { result: { tools: filteredTools } };
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params;
    
    logger.info('Tool Call Request', {
      requestId,
      toolName: name,
      arguments: args ? JSON.stringify(args, null, 2) : 'No arguments'
    });
    
    // Check permissions
    const requiredPermissions = TOOL_PERMISSIONS[name as keyof typeof TOOL_PERMISSIONS] || [];
    const hasPermission = authManager.hasPermission(authToken, [...requiredPermissions]);
    
    logger.debug('Tool Permission Check', {
      requestId,
      toolName: name,
      requiredPermissions,
      userPermissions: authToken.permissions,
      hasPermission
    });
    
    if (!hasPermission) {
      logger.warn('Tool Access Denied - Insufficient Permissions', {
        requestId,
        toolName: name,
        requiredPermissions,
        userPermissions: authToken.permissions,
        tokenId: authToken.id
      });
      throw new Error('Insufficient permissions for this tool');
    }

    if (!allHandlers[name as keyof typeof allHandlers]) {
      logger.error('Tool Not Found', {
        requestId,
        toolName: name,
        availableTools: Object.keys(allHandlers)
      });
      throw new Error(`Unknown tool: ${name}`);
    }

    logger.info('Executing Tool', {
      requestId,
      toolName: name,
      startTime: new Date().toISOString()
    });

    const toolStartTime = Date.now();
    const handler = allHandlers[name as keyof typeof allHandlers];
    if (!handler) {
      throw new Error(`Handler not found for tool: ${name}`);
    }
    const result = await handler(args);
    const toolDuration = Date.now() - toolStartTime;
    
    logger.info('Tool Execution Completed', {
      requestId,
      toolName: name,
      duration: `${toolDuration}ms`,
      resultType: typeof result,
      resultLength: typeof result === 'string' ? result.length : JSON.stringify(result).length
    });
    
    return {
      result: {
        content: [{
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        }]
      }
    };
  }

  if (method === 'resources/list') {
    logger.debug('Processing resources/list request', { requestId });
    
    const resources = resourceManager.getAvailableResources();
    
    logger.info('Resources List Response', {
      requestId,
      totalResources: resources.length,
      resourceUris: resources.map(r => r.uri)
    });
    
    return {
      result: {
        resources: resources.map(resource => ({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType
        }))
      }
    };
  }

  if (method === 'resources/read') {
    const { uri } = params;
    
    logger.info('Resource Read Request', {
      requestId,
      uri
    });
    
    try {
      const content = await resourceManager.readResource(uri);
      
      logger.info('Resource Read Completed', {
        requestId,
        uri,
        contentLength: content.length
      });
      
      return {
        result: {
          contents: [{
            uri,
            mimeType: 'text/plain',
            text: content
          }]
        }
      };
    } catch (error) {
      logger.error('Resource Read Error', {
        requestId,
        uri,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to read resource ${uri}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  if (method === 'prompts/list') {
    logger.debug('Processing prompts/list request', { requestId });
    
    const prompts = promptManager.getAvailablePrompts();
    
    logger.info('Prompts List Response', {
      requestId,
      totalPrompts: prompts.length,
      promptNames: prompts.map(p => p.name)
    });
    
    return {
      result: {
        prompts: prompts.map(prompt => ({
          name: prompt.name,
          description: prompt.description,
          arguments: prompt.arguments || []
        }))
      }
    };
  }

  if (method === 'prompts/get') {
    const { name, arguments: args } = params;
    
    logger.info('Prompt Get Request', {
      requestId,
      promptName: name,
      arguments: args ? JSON.stringify(args, null, 2) : 'No arguments'
    });
    
    try {
      const messages = await promptManager.getPrompt(name, args || {});
      
      logger.info('Prompt Get Completed', {
        requestId,
        promptName: name,
        messageCount: messages.length
      });
      
      return {
        result: {
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        }
      };
    } catch (error) {
      logger.error('Prompt Get Error', {
        requestId,
        promptName: name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to get prompt ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  logger.warn('Unsupported MCP Method', {
    requestId,
    method,
    supportedMethods: ['initialize', 'initialized', 'tools/list', 'tools/call', 'resources/list', 'resources/read', 'prompts/list', 'prompts/get']
  });
  
  throw new Error('Unsupported method');
}
