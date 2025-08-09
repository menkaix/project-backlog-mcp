#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  InitializeRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ReadResourceRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

import { HyperManagerAPIClient } from './api-client.js';
import { AuthManager } from './auth.js';
import { ResourceManager } from './resources.js';
import { PromptManager } from './prompts.js';
import { TOOL_PERMISSIONS } from './types.js';
import { setupDiagramTools } from './tools/diagrams.js';
import { setupProjectTools } from './tools/projects.js';
import { setupStoryTools } from './tools/stories.js';
import { setupFeatureTools } from './tools/features.js';
import { setupActorTools } from './tools/actors.js';
import { setupUtilityTools } from './tools/utilities.js';

// Environment variables
const HYPERMANAGER_API_KEY = process.env['HYPERMANAGER_API_KEY'];
const MCP_SERVER_SECRET = process.env['MCP_SERVER_SECRET'] || 'default-secret-change-me';
const ALLOWED_TOKENS = process.env['ALLOWED_TOKENS']?.split(',') || [];
const PORT = parseInt(process.env['PORT'] || '3000');
const NODE_ENV = process.env['NODE_ENV'] || 'development';
const BASE_PATH = process.env['BASE_PATH'] || '';

// Validate required environment variables
if (!HYPERMANAGER_API_KEY) {
  throw new Error('HYPERMANAGER_API_KEY environment variable is required');
}

// Setup logging
const logger = winston.createLogger({
  level: NODE_ENV === 'development' ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Log startup configuration
logger.info('=== Backlog MCP Server Starting ===');
logger.info('Environment Configuration:', {
  NODE_ENV,
  PORT,
  BASE_PATH: BASE_PATH || '(none)',
  HYPERMANAGER_API_KEY: HYPERMANAGER_API_KEY ? `${HYPERMANAGER_API_KEY.substring(0, 10)}...` : 'NOT SET',
  MCP_SERVER_SECRET: MCP_SERVER_SECRET ? `${MCP_SERVER_SECRET.substring(0, 10)}...` : 'NOT SET',
  ALLOWED_TOKENS_COUNT: ALLOWED_TOKENS.length,
  ALLOWED_ORIGINS: process.env['ALLOWED_ORIGINS'] || 'NOT SET'
});

// Initialize clients
const apiClient = new HyperManagerAPIClient(HYPERMANAGER_API_KEY);
const authManager = new AuthManager(MCP_SERVER_SECRET, ALLOWED_TOKENS);
const resourceManager = new ResourceManager(apiClient);
const promptManager = new PromptManager(apiClient);

// Setup tools
const diagramTools = setupDiagramTools(apiClient);
const projectTools = setupProjectTools(apiClient);
const storyTools = setupStoryTools(apiClient);
const featureTools = setupFeatureTools(apiClient);
const actorTools = setupActorTools(apiClient);
const utilityTools = setupUtilityTools(apiClient);

// Combine all tools
const allTools = [
  ...diagramTools.tools,
  ...projectTools.tools,
  ...storyTools.tools,
  ...featureTools.tools,
  ...actorTools.tools,
  ...utilityTools.tools
];

const allHandlers = {
  ...diagramTools.handlers,
  ...projectTools.handlers,
  ...storyTools.handlers,
  ...featureTools.handlers,
  ...actorTools.handlers,
  ...utilityTools.handlers
};

// Log tools setup
logger.info('Tools Setup Complete:', {
  totalTools: allTools.length,
  toolNames: allTools.map(t => t.name),
  handlerCount: Object.keys(allHandlers).length
});

// Global error handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    }
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', {
    reason: reason instanceof Error ? {
      message: reason.message,
      stack: reason.stack,
      name: reason.name
    } : reason,
    promise: promise.toString()
  });
});

class BacklogMCPServer {
  private server: Server;
  private expressApp!: express.Application;

  constructor() {
    this.server = new Server(
      {
        name: 'project-backlog-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupMCPHandlers();
    this.setupExpressApp();
    
    // Error handling
    this.server.onerror = (error) => logger.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      logger.info('Shutting down server...');
      await this.server.close();
      process.exit(0);
    });

    // Cleanup expired tokens every hour
    setInterval(() => {
      authManager.cleanup();
    }, 60 * 60 * 1000);
  }

  private setupMCPHandlers() {
    // Initialize handler - REQUIRED for MCP protocol
    this.server.setRequestHandler(InitializeRequestSchema, async (request) => {
      const clientVersion = request.params.protocolVersion;
      const supportedVersions = ["2025-03-26", "2024-11-05"];
      
      // Use client's version if we support it, otherwise use our latest supported version
      const negotiatedVersion = supportedVersions.includes(clientVersion) ? clientVersion : supportedVersions[0];
      
      logger.info('MCP Initialize Request:', {
        clientProtocolVersion: clientVersion,
        negotiatedProtocolVersion: negotiatedVersion,
        capabilities: request.params.capabilities,
        clientInfo: request.params.clientInfo
      });

      return {
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
      };
    });

    // Resources handlers
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      logger.debug('Listing available resources');
      const resources = resourceManager.getAvailableResources();
      
      return {
        resources: resources.map(resource => ({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType
        }))
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      logger.info('Reading resource:', { uri });
      
      try {
        const content = await resourceManager.readResource(uri);
        
        return {
          contents: [{
            uri,
            mimeType: 'text/plain', // Default, could be enhanced based on resource type
            text: content
          }]
        };
      } catch (error) {
        logger.error('Error reading resource:', { uri, error });
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to read resource ${uri}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });

    // Prompts handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      logger.debug('Listing available prompts');
      const prompts = promptManager.getAvailablePrompts();
      
      return {
        prompts: prompts.map(prompt => ({
          name: prompt.name,
          description: prompt.description,
          arguments: prompt.arguments || []
        }))
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      logger.info('Getting prompt:', { name, args });
      
      try {
        const messages = await promptManager.getPrompt(name, args || {});
        
        return {
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        };
      } catch (error) {
        logger.error('Error getting prompt:', { name, args, error });
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to get prompt ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });

    // Tools handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: allTools,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      // Check if tool exists
      if (!allHandlers[name as keyof typeof allHandlers]) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
      }

      // For HTTP requests, we'll handle auth in Express middleware
      // For stdio, we skip auth for now (local usage)
      
      try {
        const handler = allHandlers[name as keyof typeof allHandlers];
        const result = await handler(args);
        
        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error(`Tool execution error for ${name}:`, error);
        
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private setupExpressApp() {
    this.expressApp = express();

    // Request logging middleware
    this.expressApp.use((req, res, next) => {
      const requestId = uuidv4();
      const startTime = Date.now();
      
      // Add request ID to request object
      (req as any).requestId = requestId;
      
      // Log incoming request
      logger.info('Incoming Request', {
        requestId,
        method: req.method,
        url: req.url,
        path: req.path,
        query: req.query,
        headers: {
          'user-agent': req.headers['user-agent'],
          'content-type': req.headers['content-type'],
          'authorization': req.headers.authorization ? 'Bearer [REDACTED]' : undefined,
          'x-auth-token': req.headers['x-auth-token'] ? '[REDACTED]' : undefined,
          'origin': req.headers.origin,
          'referer': req.headers.referer
        },
        ip: req.ip || req.connection.remoteAddress,
        body: req.method === 'POST' ? (req.body || 'No body yet') : undefined
      });

      // Override res.json to log responses
      const originalJson = res.json;
      res.json = function(body) {
        const duration = Date.now() - startTime;
        logger.info('Response Sent', {
          requestId,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          body: typeof body === 'object' ? JSON.stringify(body, null, 2) : body
        });
        return originalJson.call(this, body);
      };

      // Log response completion
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.info('Request Completed', {
          requestId,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: `${duration}ms`
        });
      });

      next();
    });

    // Security middleware
    this.expressApp.use(helmet());
    this.expressApp.use(cors({
      origin: process.env['ALLOWED_ORIGINS']?.split(',') || '*',
      credentials: true
    }));

    // Rate limiting with logging
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        logger.warn('Rate Limit Exceeded', {
          requestId: (req as any).requestId,
          ip: req.ip || req.connection.remoteAddress,
          method: req.method,
          url: req.url
        });
        res.status(429).json({ error: 'Too many requests from this IP, please try again later.' });
      }
    });
    this.expressApp.use(limiter);

    this.expressApp.use(express.json({ limit: '10mb' }));

    // JSON parsing error handler
    this.expressApp.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (error instanceof SyntaxError && 'body' in error) {
        logger.error('JSON Parse Error', {
          requestId: (req as any).requestId,
          error: error.message,
          body: req.body
        });
        res.status(400).json({ error: 'Invalid JSON in request body' });
        return;
      }
      next(error);
    });

    // Create router for all API routes
    const apiRouter = express.Router();

    // Auth middleware for API routes
    const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
      const requestId = (req as any).requestId;
      
      logger.debug('Authentication Check Started', {
        requestId,
        method: req.method,
        url: req.url,
        hasAuthHeader: !!req.headers.authorization,
        hasXAuthToken: !!req.headers['x-auth-token'],
        hasQueryToken: !!req.query['token']
      });

      const token = req.headers.authorization?.replace('Bearer ', '') || 
                   req.headers['x-auth-token'] as string ||
                   req.query['token'] as string;

      if (!token) {
        logger.warn('Authentication Failed - No Token', {
          requestId,
          method: req.method,
          url: req.url,
          ip: req.ip || req.connection.remoteAddress
        });
        res.status(401).json({ error: 'Authentication token required' });
        return;
      }

      const authToken = authManager.verifyToken(token);
      if (!authToken) {
        logger.warn('Authentication Failed - Invalid Token', {
          requestId,
          method: req.method,
          url: req.url,
          ip: req.ip || req.connection.remoteAddress,
          tokenPrefix: token.substring(0, 10) + '...'
        });
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }

      logger.info('Authentication Successful', {
        requestId,
        tokenId: authToken.id,
        tokenType: authToken.type,
        permissions: authToken.permissions,
        lastUsed: authToken.lastUsed,
        expiresAt: authToken.expiresAt
      });

      (req as any).authToken = authToken;
      next();
    };

    // Health check
    apiRouter.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // MCP endpoint info for GET requests
    apiRouter.get('/mcp', (req, res) => {
      res.json({
        message: 'MCP Server Endpoint',
        description: 'This endpoint accepts POST requests for MCP protocol communication',
        usage: {
          method: 'POST',
          contentType: 'application/json',
          authentication: 'Bearer token required in Authorization header',
          endpoints: {
            'tools/list': 'List available tools',
            'tools/call': 'Call a specific tool'
          }
        },
        healthCheck: `${BASE_PATH}/health`,
        version: '1.0.0'
      });
    });

    // Shared MCP message handler
    const handleMCPMessage = async (message: any, authToken: any, requestId: string) => {
      const { method, params } = message;
      
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
        supportedMethods: ['initialize', 'tools/list', 'tools/call', 'resources/list', 'resources/read', 'prompts/list', 'prompts/get']
      });
      
      throw new Error('Unsupported method');
    };

    // MCP endpoint for HTTP transport (existing - for Postman, etc.)
    apiRouter.post('/mcp', authMiddleware, async (req, res): Promise<void> => {
      const requestId = (req as any).requestId;
      const authToken = (req as any).authToken;
      
      try {
        const response = await handleMCPMessage(req.body, authToken, requestId);
        
        // Convert result format for HTTP response
        if (response.result) {
          res.json(response.result);
        } else {
          res.json(response);
        }
      } catch (error) {
        logger.error('MCP HTTP Request Error', {
          requestId,
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
          } : error,
          method: req.body?.method,
          params: req.body?.params
        });
        
        if (error instanceof Error && error.message === 'Insufficient permissions for this tool') {
          res.status(403).json({ error: error.message });
        } else if (error instanceof Error && error.message.startsWith('Unknown tool:')) {
          res.status(404).json({ error: error.message });
        } else {
          res.status(500).json({ 
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
          });
        }
      }
    });

    // MCP endpoint for HTTP streaming transport (new - for n8n)
    apiRouter.post('/mcp/stream', authMiddleware, async (req, res): Promise<void> => {
      const requestId = (req as any).requestId;
      const authToken = (req as any).authToken;
      
      logger.info('MCP Streaming Connection Started', {
        requestId,
        tokenId: authToken.id,
        tokenType: authToken.type,
        clientIP: req.ip || req.connection.remoteAddress
      });

      // Set up streaming response headers
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      });

      let buffer = '';
      let messageCount = 0;

      // Handle incoming streaming data
      req.on('data', async (chunk) => {
        try {
          buffer += chunk.toString();
          
          // Process complete JSON messages (separated by newlines)
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer
          
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine) {
              messageCount++;
              
              logger.debug('Processing Streaming Message', {
                requestId,
                messageCount,
                messageLength: trimmedLine.length,
                messagePreview: trimmedLine.substring(0, 100)
              });

              try {
                const message = JSON.parse(trimmedLine);
                
                try {
                  const response = await handleMCPMessage(message, authToken, `${requestId}-${messageCount}`);
                  
                  // Send response as JSON line
                  const responseJson = JSON.stringify(response) + '\n';
                  res.write(responseJson);
                  
                  logger.debug('Streaming Response Sent', {
                    requestId,
                    messageCount,
                    method: message.method,
                    responseLength: responseJson.length
                  });
                } catch (handlerError) {
                  logger.error('Message Handler Error in Streaming', {
                    requestId,
                    messageCount,
                    error: handlerError instanceof Error ? handlerError.message : 'Unknown handler error'
                  });
                  
                  const errorResponse = JSON.stringify({
                    error: {
                      code: -32603,
                      message: 'Internal error',
                      data: handlerError instanceof Error ? handlerError.message : 'Unknown error'
                    }
                  }) + '\n';
                  
                  res.write(errorResponse);
                }
                
              } catch (parseError) {
                logger.error('JSON Parse Error in Streaming', {
                  requestId,
                  messageCount,
                  error: parseError instanceof Error ? parseError.message : 'Unknown parse error',
                  rawMessage: trimmedLine.substring(0, 200)
                });
                
                const errorResponse = JSON.stringify({
                  error: {
                    code: -32700,
                    message: 'Parse error',
                    data: parseError instanceof Error ? parseError.message : 'Invalid JSON'
                  }
                }) + '\n';
                
                res.write(errorResponse);
              }
            }
          }
        } catch (error) {
          logger.error('Streaming Data Processing Error', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // Handle end of request
      req.on('end', () => {
        logger.info('MCP Streaming Connection Ended', {
          requestId,
          totalMessages: messageCount,
          tokenId: authToken.id
        });
        res.end();
      });

      // Handle request errors
      req.on('error', (error) => {
        logger.error('MCP Streaming Request Error', {
          requestId,
          error: error.message,
          tokenId: authToken.id
        });
        
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
        }
        
        const errorResponse = JSON.stringify({
          error: {
            code: -32603,
            message: 'Internal error',
            data: error.message
          }
        }) + '\n';
        
        res.write(errorResponse);
        res.end();
      });

      // Handle client disconnect
      req.on('close', () => {
        logger.info('MCP Streaming Client Disconnected', {
          requestId,
          totalMessages: messageCount,
          tokenId: authToken.id
        });
      });
    });

    // Admin endpoints (master token only)
    apiRouter.post('/admin/generate-token', authMiddleware, (req, res): void => {
      const authToken = (req as any).authToken;
      
      if (authToken.type !== 'master') {
        res.status(403).json({ error: 'Master token required' });
        return;
      }

      const { type, expiresIn, description } = req.body;
      
      try {
        const newToken = authManager.generateToken(type, expiresIn, description);
        res.json({ token: newToken });
      } catch (error) {
        res.status(400).json({ 
          error: error instanceof Error ? error.message : 'Token generation failed' 
        });
      }
    });

    apiRouter.post('/admin/revoke-token', authMiddleware, (req, res): void => {
      const authToken = (req as any).authToken;
      
      if (authToken.type !== 'master') {
        res.status(403).json({ error: 'Master token required' });
        return;
      }

      const { token } = req.body;
      const revoked = authManager.revokeToken(token);
      
      res.json({ revoked });
    });

    apiRouter.get('/admin/tokens', authMiddleware, (req, res): void => {
      const authToken = (req as any).authToken;
      
      if (authToken.type !== 'master') {
        res.status(403).json({ error: 'Master token required' });
        return;
      }

      const tokens = authManager.listTokens();
      res.json({ tokens });
    });

    // Mount the router with BASE_PATH
    this.expressApp.use(BASE_PATH, apiRouter);
  }

  async runStdio() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Backlog MCP server running on stdio');
  }

  async runHttp() {
    this.expressApp.listen(PORT, () => {
      logger.info(`Backlog MCP server running on HTTP port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}${BASE_PATH}/health`);
      logger.info(`MCP endpoint: http://localhost:${PORT}${BASE_PATH}/mcp`);
    });
  }

  async run() {
    // Check if we're running in Railway or similar cloud environment
    if (process.env['PORT'] || process.env['RAILWAY_ENVIRONMENT']) {
      await this.runHttp();
    } else {
      await this.runStdio();
    }
  }
}

const server = new BacklogMCPServer();
server.run().catch((error) => {
  logger.error('Server startup error:', error);
  process.exit(1);
});
