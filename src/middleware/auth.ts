import express from 'express';
import winston from 'winston';
import { AuthManager } from '../auth.js';

export function createAuthMiddleware(authManager: AuthManager, logger: winston.Logger) {
  return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
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
}
