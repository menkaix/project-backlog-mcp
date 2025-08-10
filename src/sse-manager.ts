import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';
import { SSEConnection, SSEEvent, SSEEventType, MCPSSEMessage, AuthToken } from './types.js';

export class SSEManager {
  private connections: Map<string, SSEConnection> = new Map();
  private logger: winston.Logger;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(logger: winston.Logger) {
    this.logger = logger;
    this.startHeartbeat();
    this.startCleanup();
  }

  /**
   * Add a new SSE connection
   */
  addConnection(response: Response, authToken: AuthToken, clientInfo?: any): string {
    const connectionId = uuidv4();
    
    const connection: SSEConnection = {
      id: connectionId,
      response,
      authToken,
      connectedAt: new Date(),
      lastActivity: new Date(),
      clientInfo: {
        userAgent: clientInfo?.userAgent,
        ip: clientInfo?.ip
      }
    };

    this.connections.set(connectionId, connection);

    this.logger.info('SSE Connection Added', {
      connectionId,
      tokenId: authToken.id,
      tokenType: authToken.type,
      clientIP: clientInfo?.ip,
      userAgent: clientInfo?.userAgent,
      totalConnections: this.connections.size
    });

    // Send connection status event
    this.sendToConnection(connectionId, {
      type: 'connection-status',
      result: {
        status: 'connected',
        connectionId,
        serverTime: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

    // Handle connection close
    response.on('close', () => {
      this.removeConnection(connectionId);
    });

    response.on('error', (error) => {
      this.logger.error('SSE Connection Error', {
        connectionId,
        error: error.message,
        tokenId: authToken.id
      });
      this.removeConnection(connectionId);
    });

    return connectionId;
  }

  /**
   * Remove an SSE connection
   */
  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      this.logger.info('SSE Connection Removed', {
        connectionId,
        tokenId: connection.authToken.id,
        duration: Date.now() - connection.connectedAt.getTime(),
        totalConnections: this.connections.size - 1
      });

      // Close the response if it's still open
      try {
        if (!connection.response.headersSent) {
          connection.response.end();
        }
      } catch (error) {
        // Response might already be closed
      }

      this.connections.delete(connectionId);
    }
  }

  /**
   * Send an event to a specific connection
   */
  sendToConnection(connectionId: string, message: MCPSSEMessage): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      this.logger.warn('SSE Send Failed - Connection Not Found', { connectionId });
      return false;
    }

    try {
      const event: SSEEvent = {
        id: uuidv4(),
        event: message.type,
        data: JSON.stringify(message)
      };

      const sseData = this.formatSSEEvent(event);
      connection.response.write(sseData);
      connection.lastActivity = new Date();

      this.logger.debug('SSE Event Sent', {
        connectionId,
        eventType: message.type,
        eventId: event.id,
        dataSize: sseData.length
      });

      return true;
    } catch (error) {
      this.logger.error('SSE Send Error', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        eventType: message.type
      });

      // Remove broken connection
      this.removeConnection(connectionId);
      return false;
    }
  }

  /**
   * Broadcast an event to all connections
   */
  broadcast(message: MCPSSEMessage, filter?: (connection: SSEConnection) => boolean): number {
    let sentCount = 0;
    
    for (const [connectionId, connection] of this.connections) {
      if (filter && !filter(connection)) {
        continue;
      }

      if (this.sendToConnection(connectionId, message)) {
        sentCount++;
      }
    }

    this.logger.debug('SSE Broadcast Completed', {
      eventType: message.type,
      totalConnections: this.connections.size,
      sentCount
    });

    return sentCount;
  }

  /**
   * Broadcast to connections with specific permissions
   */
  broadcastToPermissions(message: MCPSSEMessage, requiredPermissions: string[]): number {
    return this.broadcast(message, (connection) => {
      return requiredPermissions.every(permission => 
        connection.authToken.permissions.includes(permission)
      );
    });
  }

  /**
   * Broadcast to connections with specific token types
   */
  broadcastToTokenTypes(message: MCPSSEMessage, tokenTypes: string[]): number {
    return this.broadcast(message, (connection) => {
      return tokenTypes.includes(connection.authToken.type);
    });
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number;
    connectionsByType: Record<string, number>;
    oldestConnection?: Date;
    newestConnection?: Date;
  } {
    const stats: {
      totalConnections: number;
      connectionsByType: Record<string, number>;
      oldestConnection?: Date;
      newestConnection?: Date;
    } = {
      totalConnections: this.connections.size,
      connectionsByType: {} as Record<string, number>
    };

    for (const connection of this.connections.values()) {
      // Count by token type
      const tokenType = connection.authToken.type;
      stats.connectionsByType[tokenType] = (stats.connectionsByType[tokenType] || 0) + 1;

      // Track oldest and newest connections
      if (!stats.oldestConnection || connection.connectedAt < stats.oldestConnection) {
        stats.oldestConnection = connection.connectedAt;
      }
      if (!stats.newestConnection || connection.connectedAt > stats.newestConnection) {
        stats.newestConnection = connection.connectedAt;
      }
    }

    return stats;
  }

  /**
   * Format an SSE event according to the specification
   */
  private formatSSEEvent(event: SSEEvent): string {
    let formatted = '';
    
    if (event.id) {
      formatted += `id: ${event.id}\n`;
    }
    
    if (event.event) {
      formatted += `event: ${event.event}\n`;
    }
    
    if (event.retry) {
      formatted += `retry: ${event.retry}\n`;
    }
    
    // Handle multi-line data
    const dataLines = JSON.stringify(event.data).split('\n');
    for (const line of dataLines) {
      formatted += `data: ${line}\n`;
    }
    
    formatted += '\n'; // Empty line to end the event
    
    return formatted;
  }

  /**
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const heartbeatMessage: MCPSSEMessage = {
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
        metadata: {
          serverTime: new Date().toISOString(),
          activeConnections: this.connections.size
        }
      };

      const sentCount = this.broadcast(heartbeatMessage);
      
      if (sentCount > 0) {
        this.logger.debug('SSE Heartbeat Sent', {
          sentCount,
          totalConnections: this.connections.size
        });
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Start cleanup of stale connections
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = new Date();
      const staleThreshold = 5 * 60 * 1000; // 5 minutes
      const staleConnections: string[] = [];

      for (const [connectionId, connection] of this.connections) {
        const timeSinceActivity = now.getTime() - connection.lastActivity.getTime();
        if (timeSinceActivity > staleThreshold) {
          staleConnections.push(connectionId);
        }
      }

      for (const connectionId of staleConnections) {
        this.logger.info('Removing Stale SSE Connection', {
          connectionId,
          timeSinceActivity: now.getTime() - this.connections.get(connectionId)!.lastActivity.getTime()
        });
        this.removeConnection(connectionId);
      }

      if (staleConnections.length > 0) {
        this.logger.info('SSE Cleanup Completed', {
          removedConnections: staleConnections.length,
          remainingConnections: this.connections.size
        });
      }
    }, 60000); // Every minute
  }

  /**
   * Shutdown the SSE manager
   */
  shutdown(): void {
    this.logger.info('Shutting down SSE Manager', {
      activeConnections: this.connections.size
    });

    // Clear intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Close all connections
    for (const connectionId of this.connections.keys()) {
      this.removeConnection(connectionId);
    }
  }
}
