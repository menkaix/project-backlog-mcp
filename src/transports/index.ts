import express from 'express';
import winston from 'winston';
import { SSEManager } from '../sse-manager.js';
import { AuthManager } from '../auth.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { MCPMessageHandlerDependencies } from '../handlers/mcp-message.js';
import { setupHttpPostTransport } from './http-post.js';
import { setupSSETransport } from './sse.js';
import { setupHttpStreamTransport } from './http-stream.js';

export interface TransportConfig {
  authManager: AuthManager;
  sseManager: SSEManager;
  logger: winston.Logger;
  deps: MCPMessageHandlerDependencies;
}

export function setupAllTransports(
  router: express.Router,
  config: TransportConfig
) {
  const { authManager, sseManager, logger, deps } = config;
  
  // Create auth middleware
  const authMiddleware = createAuthMiddleware(authManager, logger);

  // Setup all transport protocols
  setupHttpPostTransport(router, authMiddleware, deps);
  setupSSETransport(router, authMiddleware, sseManager, deps);
  setupHttpStreamTransport(router, authMiddleware, deps);

  logger.info('All MCP transports configured', {
    transports: ['HTTP POST', 'Server-Sent Events', 'HTTP Streaming'],
    endpoints: [
      '/mcp (GET/POST)',
      '/mcp/sse (GET)',
      '/mcp/sse/send (POST)',
      '/mcp/sse/broadcast (POST)',
      '/mcp/sse/stats (GET)',
      '/mcp/stream (POST)'
    ]
  });
}

// Admin endpoints setup
export function setupAdminEndpoints(
  router: express.Router,
  authManager: AuthManager,
  logger: winston.Logger
) {
  const authMiddleware = createAuthMiddleware(authManager, logger);

  // Admin endpoints (master token only)
  router.post('/admin/generate-token', authMiddleware, (req, res): void => {
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

  router.post('/admin/revoke-token', authMiddleware, (req, res): void => {
    const authToken = (req as any).authToken;
    
    if (authToken.type !== 'master') {
      res.status(403).json({ error: 'Master token required' });
      return;
    }

    const { token } = req.body;
    const revoked = authManager.revokeToken(token);
    
    res.json({ revoked });
  });

  router.get('/admin/tokens', authMiddleware, (req, res): void => {
    const authToken = (req as any).authToken;
    
    if (authToken.type !== 'master') {
      res.status(403).json({ error: 'Master token required' });
      return;
    }

    const tokens = authManager.listTokens();
    res.json({ tokens });
  });

  logger.info('Admin endpoints configured', {
    endpoints: [
      '/admin/generate-token (POST)',
      '/admin/revoke-token (POST)',
      '/admin/tokens (GET)'
    ]
  });
}
