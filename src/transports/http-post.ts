import express from 'express';
import winston from 'winston';
import { handleMCPMessage, MCPMessageHandlerDependencies } from '../handlers/mcp-message.js';

export function setupHttpPostTransport(
  router: express.Router,
  authMiddleware: express.RequestHandler,
  deps: MCPMessageHandlerDependencies
) {
  const { logger } = deps;

  // MCP endpoint info for GET requests
  router.get('/mcp', (req, res) => {
    const basePath = process.env['BASE_PATH'] || '';
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
      healthCheck: `${basePath}/health`,
      version: '1.0.0'
    });
  });

  // MCP endpoint for HTTP transport (existing - for Postman, etc.)
  router.post('/mcp', authMiddleware, async (req, res): Promise<void> => {
    const requestId = (req as any).requestId;
    const authToken = (req as any).authToken;
    
    try {
      const response = await handleMCPMessage(req.body, authToken, requestId, deps);
      
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
}
