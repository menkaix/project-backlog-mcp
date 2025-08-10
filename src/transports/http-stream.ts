import express from 'express';
import winston from 'winston';
import { handleMCPMessage, MCPMessageHandlerDependencies } from '../handlers/mcp-message.js';

export function setupHttpStreamTransport(
  router: express.Router,
  authMiddleware: express.RequestHandler,
  deps: MCPMessageHandlerDependencies
) {
  const { logger } = deps;

  // MCP endpoint for HTTP streaming transport (existing - for n8n)
  router.post('/mcp/stream', authMiddleware, async (req, res): Promise<void> => {
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
                const response = await handleMCPMessage(message, authToken, `${requestId}-${messageCount}`, deps);
                
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
}
