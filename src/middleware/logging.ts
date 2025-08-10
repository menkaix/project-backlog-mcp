import express from 'express';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

export function createLoggingMiddleware(logger: winston.Logger, trustProxy: boolean) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const requestId = uuidv4();
    const startTime = Date.now();
    
    // Add request ID to request object
    (req as any).requestId = requestId;
    
    // Log incoming request with enhanced client information
    const clientInfo = (req as any).clientInfo;
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
      client: {
        ip: clientInfo?.ip,
        originalIP: clientInfo?.originalIP,
        forwardedFor: clientInfo?.forwardedFor,
        realIP: clientInfo?.realIP,
        protocol: clientInfo?.protocol,
        host: clientInfo?.host,
        behindProxy: trustProxy
      },
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
  };
}

export function createProxyMiddleware(logger: winston.Logger, trustProxy: boolean, trustedProxies: string[], proxyHops: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (trustProxy) {
      // Log proxy headers for debugging
      const proxyHeaders = {
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-forwarded-proto': req.headers['x-forwarded-proto'],
        'x-forwarded-host': req.headers['x-forwarded-host'],
        'x-real-ip': req.headers['x-real-ip'],
        'cf-connecting-ip': req.headers['cf-connecting-ip'], // Cloudflare
        'x-client-ip': req.headers['x-client-ip']
      };

      // Filter out undefined headers
      const definedProxyHeaders = Object.fromEntries(
        Object.entries(proxyHeaders).filter(([_, value]) => value !== undefined)
      );

      if (Object.keys(definedProxyHeaders).length > 0) {
        logger.debug('Proxy Headers Detected:', {
          requestId: (req as any).requestId || 'unknown',
          proxyHeaders: definedProxyHeaders,
          clientIP: req.ip,
          remoteAddress: req.connection.remoteAddress
        });
      }

      // Store original IP information for logging
      (req as any).clientInfo = {
        ip: req.ip, // This will be the real client IP after trust proxy is configured
        originalIP: req.connection.remoteAddress, // This will be the proxy IP
        forwardedFor: req.headers['x-forwarded-for'],
        realIP: req.headers['x-real-ip'],
        protocol: req.headers['x-forwarded-proto'] || req.protocol,
        host: req.headers['x-forwarded-host'] || req.get('host')
      };
    } else {
      // Direct connection - no proxy
      (req as any).clientInfo = {
        ip: req.connection.remoteAddress,
        originalIP: req.connection.remoteAddress,
        protocol: req.protocol,
        host: req.get('host')
      };
    }

    next();
  };
}
