import express from 'express';
import winston from 'winston';
import { SSEManager } from '../sse-manager.js';
import { handleMCPMessage, MCPMessageHandlerDependencies } from '../handlers/mcp-message.js';
import { MCPSSEMessage } from '../types.js';

export function setupSSETransport(
  router: express.Router,
  authMiddleware: express.RequestHandler,
  sseManager: SSEManager,
  deps: MCPMessageHandlerDependencies
) {
  const { logger } = deps;

  // MCP endpoint for Server-Sent Events (SSE) - GET request to establish SSE connection
  router.get('/mcp/sse', authMiddleware, async (req, res): Promise<void> => {
    const requestId = (req as any).requestId;
    const authToken = (req as any).authToken;
    const clientInfo = (req as any).clientInfo;
    
    logger.info('SSE Connection Request', {
      requestId,
      tokenId: authToken.id,
      tokenType: authToken.type,
      clientIP: clientInfo.ip,
      userAgent: req.headers['user-agent']
    });

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Cache-Control',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    });

    // Add connection to SSE manager
    const connectionId = sseManager.addConnection(res, authToken, {
      userAgent: req.headers['user-agent'],
      ip: clientInfo.ip
    });

    logger.info('SSE Connection Established', {
      requestId,
      connectionId,
      tokenId: authToken.id
    });

    // Send initial connection confirmation
    const welcomeMessage: MCPSSEMessage = {
      type: 'mcp-notification',
      result: {
        message: 'SSE connection established',
        connectionId,
        serverInfo: {
          name: 'project-backlog-mcp-server',
          version: '1.0.0'
        },
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: false, listChanged: false },
          prompts: { listChanged: false }
        }
      },
      timestamp: new Date().toISOString(),
      metadata: {
        requestId,
        tokenType: authToken.type
      }
    };

    sseManager.sendToConnection(connectionId, welcomeMessage);
  });

  // MCP endpoint for sending commands to SSE connections - POST request
  router.post('/mcp/sse/send', authMiddleware, async (req, res): Promise<void> => {
    const requestId = (req as any).requestId;
    const authToken = (req as any).authToken;
    
    try {
      const { connectionId, message } = req.body;
      
      if (!connectionId) {
        res.status(400).json({ error: 'connectionId is required' });
        return;
      }

      if (!message) {
        res.status(400).json({ error: 'message is required' });
        return;
      }

      logger.info('SSE Send Request', {
        requestId,
        connectionId,
        messageType: message.method || message.type,
        tokenId: authToken.id
      });

      // Process MCP message and send via SSE
      if (message.method) {
        // This is an MCP method call
        try {
          const response = await handleMCPMessage(message, authToken, requestId, deps);
          
          const sseMessage: MCPSSEMessage = {
            type: 'mcp-response',
            requestId,
            method: message.method,
            result: response.result,
            timestamp: new Date().toISOString()
          };

          const sent = sseManager.sendToConnection(connectionId, sseMessage);
          
          if (sent) {
            res.json({ success: true, sent: true });
          } else {
            res.status(404).json({ error: 'Connection not found or closed' });
          }
        } catch (error) {
          const errorMessage: MCPSSEMessage = {
            type: 'mcp-error',
            requestId,
            method: message.method,
            error: {
              message: error instanceof Error ? error.message : 'Unknown error',
              code: -32603
            },
            timestamp: new Date().toISOString()
          };

          const sent = sseManager.sendToConnection(connectionId, errorMessage);
          res.json({ success: true, sent, error: true });
        }
      } else {
        // This is a direct SSE message
        const sent = sseManager.sendToConnection(connectionId, message);
        
        if (sent) {
          res.json({ success: true, sent: true });
        } else {
          res.status(404).json({ error: 'Connection not found or closed' });
        }
      }
    } catch (error) {
      logger.error('SSE Send Error', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // SSE broadcast endpoint - POST request to broadcast to multiple connections
  router.post('/mcp/sse/broadcast', authMiddleware, async (req, res): Promise<void> => {
    const requestId = (req as any).requestId;
    const authToken = (req as any).authToken;
    
    if (authToken.type !== 'master') {
      res.status(403).json({ error: 'Master token required for broadcasting' });
      return;
    }

    try {
      const { message, filter } = req.body;
      
      if (!message) {
        res.status(400).json({ error: 'message is required' });
        return;
      }

      logger.info('SSE Broadcast Request', {
        requestId,
        messageType: message.type,
        filter,
        tokenId: authToken.id
      });

      let sentCount = 0;

      if (filter?.tokenTypes) {
        sentCount = sseManager.broadcastToTokenTypes(message, filter.tokenTypes);
      } else if (filter?.permissions) {
        sentCount = sseManager.broadcastToPermissions(message, filter.permissions);
      } else {
        sentCount = sseManager.broadcast(message);
      }

      res.json({ 
        success: true, 
        sentCount,
        totalConnections: sseManager.getStats().totalConnections
      });
    } catch (error) {
      logger.error('SSE Broadcast Error', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // SSE stats endpoint - GET request to get connection statistics
  router.get('/mcp/sse/stats', authMiddleware, (req, res): void => {
    const authToken = (req as any).authToken;
    
    if (authToken.type !== 'master') {
      res.status(403).json({ error: 'Master token required for stats' });
      return;
    }

    const stats = sseManager.getStats();
    res.json(stats);
  });
}
