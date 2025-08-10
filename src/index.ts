#!/usr/bin/env node
import 'dotenv/config';
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

import { HyperManagerAPIClient } from './api-client.js';
import { AuthManager } from './auth.js';
import { ResourceManager } from './resources.js';
import { PromptManager } from './prompts.js';
import { SSEManager } from './sse-manager.js';
import { createLoggingMiddleware, createProxyMiddleware } from './middleware/logging.js';
import { setupAllTransports, setupAdminEndpoints } from './transports/index.js';
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

// Proxy configuration
const TRUST_PROXY = process.env['TRUST_PROXY'] === 'true';
const TRUSTED_PROXIES = process.env['TRUSTED_PROXIES']?.split(',').filter(ip => ip.trim()) || [];
const PROXY_HOPS = parseInt(process.env['PROXY_HOPS'] || '1');

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
  ALLOWED_ORIGINS: process.env['ALLOWED_ORIGINS'] || 'NOT SET',
  TRUST_PROXY: TRUST_PROXY,
  TRUSTED_PROXIES: TRUSTED_PROXIES.length > 0 ? TRUSTED_PROXIES : 'ALL (not recommended for production)',
  PROXY_HOPS: PROXY_HOPS
});

// Initialize clients and managers
const apiClient = new HyperManagerAPIClient(HYPERMANAGER_API_KEY);
const authManager = new AuthManager(MCP_SERVER_SECRET, ALLOWED_TOKENS);
const resourceManager = new ResourceManager(apiClient);
const promptManager = new PromptManager(apiClient);
const sseManager = new SSEManager(logger);

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
      sseManager.shutdown();
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

    // Configure proxy trust settings
    if (TRUST_PROXY) {
      if (TRUSTED_PROXIES.length > 0) {
        // Trust specific proxy IPs
        this.expressApp.set('trust proxy', TRUSTED_PROXIES);
        logger.info('Proxy Trust Configuration:', {
          mode: 'specific_ips',
          trustedProxies: TRUSTED_PROXIES,
          hops: PROXY_HOPS
        });
      } else {
        // Trust all proxies (not recommended for production)
        this.expressApp.set('trust proxy', PROXY_HOPS);
        logger.warn('Proxy Trust Configuration:', {
          mode: 'trust_all',
          message: 'Trusting all proxies - not recommended for production',
          hops: PROXY_HOPS
        });
      }
    } else {
      logger.info('Proxy Trust Configuration:', {
        mode: 'disabled',
        message: 'Not behind a proxy - direct connections only'
      });
    }

    // Proxy headers middleware - extract real client information
    this.expressApp.use(createProxyMiddleware(logger, TRUST_PROXY, TRUSTED_PROXIES, PROXY_HOPS));

    // Request logging middleware
    this.expressApp.use(createLoggingMiddleware(logger, TRUST_PROXY));

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

    // JSON middleware - but skip for streaming endpoint
    this.expressApp.use((req, res, next) => {
      if (req.path.endsWith('/mcp/stream')) {
        // Skip JSON parsing for streaming endpoint
        next();
      } else {
        express.json({ limit: '10mb' })(req, res, next);
      }
    });

    // JSON parsing error handler (only for non-streaming endpoints)
    this.expressApp.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (error instanceof SyntaxError && 'body' in error && !req.path.endsWith('/mcp/stream')) {
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

    // Health check
    apiRouter.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // Setup all transport protocols
    const transportDeps = {
      resourceManager,
      promptManager,
      authManager,
      allTools,
      allHandlers,
      logger
    };

    setupAllTransports(apiRouter, {
      authManager,
      sseManager,
      logger,
      deps: transportDeps
    });

    // Setup admin endpoints
    setupAdminEndpoints(apiRouter, authManager, logger);

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
