#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import winston from 'winston';

import { HyperManagerAPIClient } from './api-client.js';
import { AuthManager } from './auth.js';
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

// Initialize clients
const apiClient = new HyperManagerAPIClient(HYPERMANAGER_API_KEY);
const authManager = new AuthManager(MCP_SERVER_SECRET, ALLOWED_TOKENS);

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

    // Security middleware
    this.expressApp.use(helmet());
    this.expressApp.use(cors({
      origin: process.env['ALLOWED_ORIGINS']?.split(',') || '*',
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.expressApp.use(limiter);

    this.expressApp.use(express.json({ limit: '10mb' }));

    // Create router for all API routes
    const apiRouter = express.Router();

    // Auth middleware for API routes
    const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const token = req.headers.authorization?.replace('Bearer ', '') || 
                   req.headers['x-auth-token'] as string ||
                   req.query['token'] as string;

      if (!token) {
        return res.status(401).json({ error: 'Authentication token required' });
      }

      const authToken = authManager.verifyToken(token);
      if (!authToken) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

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

    // MCP endpoint for HTTP transport
    apiRouter.post('/mcp', authMiddleware, async (req, res) => {
      try {
        const { method, params } = req.body;
        const authToken = (req as any).authToken;

        if (method === 'tools/list') {
          return res.json({
            tools: allTools.filter(tool => {
              const requiredPermissions = TOOL_PERMISSIONS[tool.name as keyof typeof TOOL_PERMISSIONS] || [];
              return authManager.hasPermission(authToken, [...requiredPermissions]);
            })
          });
        }

        if (method === 'tools/call') {
          const { name, arguments: args } = params;
          
          // Check permissions
          const requiredPermissions = TOOL_PERMISSIONS[name as keyof typeof TOOL_PERMISSIONS] || [];
          if (!authManager.hasPermission(authToken, [...requiredPermissions])) {
            return res.status(403).json({ error: 'Insufficient permissions for this tool' });
          }

          if (!allHandlers[name as keyof typeof allHandlers]) {
            return res.status(404).json({ error: `Unknown tool: ${name}` });
          }

          const handler = allHandlers[name as keyof typeof allHandlers];
          const result = await handler(args);
          
          return res.json({
            content: [{
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            }]
          });
        }

        res.status(400).json({ error: 'Unsupported method' });
      } catch (error) {
        logger.error('MCP HTTP request error:', error);
        res.status(500).json({ 
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Admin endpoints (master token only)
    apiRouter.post('/admin/generate-token', authMiddleware, (req, res) => {
      const authToken = (req as any).authToken;
      
      if (authToken.type !== 'master') {
        return res.status(403).json({ error: 'Master token required' });
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

    apiRouter.post('/admin/revoke-token', authMiddleware, (req, res) => {
      const authToken = (req as any).authToken;
      
      if (authToken.type !== 'master') {
        return res.status(403).json({ error: 'Master token required' });
      }

      const { token } = req.body;
      const revoked = authManager.revokeToken(token);
      
      res.json({ revoked });
    });

    apiRouter.get('/admin/tokens', authMiddleware, (req, res) => {
      const authToken = (req as any).authToken;
      
      if (authToken.type !== 'master') {
        return res.status(403).json({ error: 'Master token required' });
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
