# Server-Sent Events (SSE) Implementation for MCP Services

## Overview

This document describes the implementation of Server-Sent Events (SSE) for the Model Context Protocol (MCP) services in the project-backlog-mcp server. SSE provides real-time, unidirectional communication from the server to clients, enabling push notifications, live updates, and event-driven architectures.

## Architecture

### Components

1. **SSEManager** (`src/sse-manager.ts`) - Core SSE connection management
2. **SSE Types** (`src/types.ts`) - TypeScript interfaces for SSE functionality
3. **SSE Endpoints** (`src/index.ts`) - HTTP endpoints for SSE operations
4. **Test Scripts** - Node.js and HTML testing tools

### SSE vs Other Transports

| Feature         | SSE                | HTTP Streaming   | WebSocket      |
| --------------- | ------------------ | ---------------- | -------------- |
| Direction       | Server → Client    | Bidirectional    | Bidirectional  |
| Protocol        | HTTP               | HTTP             | WebSocket      |
| Reconnection    | Automatic          | Manual           | Manual         |
| Browser Support | Native             | Custom           | Native         |
| Complexity      | Low                | Medium           | High           |
| Use Case        | Push notifications | Request/Response | Real-time chat |

## Implementation Details

### 1. SSE Manager (`src/sse-manager.ts`)

The `SSEManager` class handles all SSE connection lifecycle:

```typescript
export class SSEManager {
  private connections: Map<string, SSEConnection> = new Map();
  private logger: winston.Logger;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
}
```

**Key Features:**

- Connection management with unique IDs
- Automatic heartbeat every 30 seconds
- Stale connection cleanup every minute
- Event broadcasting with filtering
- Connection statistics and monitoring

### 2. SSE Event Types

```typescript
export type SSEEventType =
  | "mcp-response" // MCP method responses
  | "mcp-notification" // Server notifications
  | "mcp-error" // Error messages
  | "heartbeat" // Keep-alive signals
  | "tool-result" // Tool execution results
  | "connection-status"; // Connection state changes
```

### 3. HTTP Endpoints

#### Establish SSE Connection

```
GET /mcp/sse?token=<auth-token>
```

- Creates persistent SSE connection
- Returns connection ID in welcome message
- Starts heartbeat and monitoring

#### Send MCP Commands

```
POST /mcp/sse/send
{
  "connectionId": "uuid",
  "message": {
    "method": "tools/list"
  }
}
```

- Processes MCP commands via SSE
- Returns responses through SSE events
- Supports all MCP methods

#### Broadcast Messages

```
POST /mcp/sse/broadcast
{
  "message": {...},
  "filter": {
    "tokenTypes": ["team", "readonly"]
  }
}
```

- Broadcast to multiple connections
- Filter by token type or permissions
- Master token required

#### Connection Statistics

```
GET /mcp/sse/stats
```

- Active connection count
- Connection breakdown by token type
- Connection age statistics

## Usage Examples

### 1. JavaScript Client (Browser)

```javascript
// Establish SSE connection
const eventSource = new EventSource("/mcp/sse?token=your-token");

// Handle connection events
eventSource.addEventListener("mcp-notification", (event) => {
  const data = JSON.parse(event.data);
  console.log("Welcome:", data);
});

// Handle MCP responses
eventSource.addEventListener("mcp-response", (event) => {
  const data = JSON.parse(event.data);
  console.log("Response:", data.result);
});

// Handle heartbeats
eventSource.addEventListener("heartbeat", (event) => {
  console.log("Server alive");
});
```

### 2. Send Commands via HTTP

```javascript
// Send MCP command
await fetch("/mcp/sse/send", {
  method: "POST",
  headers: {
    Authorization: "Bearer your-token",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    connectionId: "your-connection-id",
    message: {
      method: "tools/list",
    },
  }),
});
```

### 3. Node.js Client

```javascript
import { EventSource } from "eventsource";

const eventSource = new EventSource(
  "http://localhost:3000/mcp/sse?token=your-token"
);

eventSource.addEventListener("mcp-response", (event) => {
  const data = JSON.parse(event.data);
  console.log("Tools:", data.result.tools);
});
```

## Testing

### 1. Node.js Test Script

```bash
# Run comprehensive SSE test
npm run test-sse

# With custom server
SERVER_URL=https://your-server.com MCP_AUTH_TOKEN=your-token npm run test-sse
```

### 2. HTML Demo

Open `demo-sse.html` in a browser:

1. Enter server URL and auth token
2. Click "Connect to SSE"
3. Send MCP commands
4. Monitor real-time events

### 3. Manual Testing with curl

```bash
# Establish SSE connection (in one terminal)
curl -N -H "Authorization: Bearer your-token" \
  "http://localhost:3000/mcp/sse"

# Send command (in another terminal)
curl -X POST http://localhost:3000/mcp/sse/send \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "connectionId": "connection-id-from-sse",
    "message": {"method": "tools/list"}
  }'
```

## Security Considerations

### Authentication

- JWT token required for all SSE operations
- Token validation on connection establishment
- Per-connection token tracking

### Authorization

- Permission-based filtering for broadcasts
- Tool access control via existing MCP permissions
- Master token required for admin operations

### Rate Limiting

- Existing Express rate limiting applies
- Connection limits per token type
- Automatic cleanup of stale connections

### CORS and Headers

```javascript
res.writeHead(200, {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Cache-Control",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
});
```

## Monitoring and Debugging

### Connection Statistics

```bash
# Get SSE stats (master token required)
curl -H "Authorization: Bearer master-token" \
  http://localhost:3000/mcp/sse/stats
```

Response:

```json
{
  "totalConnections": 5,
  "connectionsByType": {
    "master": 1,
    "team": 3,
    "readonly": 1
  },
  "oldestConnection": "2024-01-01T10:00:00Z",
  "newestConnection": "2024-01-01T10:30:00Z"
}
```

### Logging

SSE operations are logged with structured data:

```json
{
  "level": "info",
  "message": "SSE Connection Added",
  "connectionId": "uuid",
  "tokenId": "token-id",
  "tokenType": "team",
  "clientIP": "192.168.1.100",
  "totalConnections": 3
}
```

### Health Monitoring

- Automatic heartbeat every 30 seconds
- Stale connection cleanup every minute
- Connection duration tracking
- Event count monitoring

## Performance Considerations

### Memory Usage

- Each connection stores minimal state
- Automatic cleanup prevents memory leaks
- Connection limits can be configured

### Network Efficiency

- Heartbeat only when connections exist
- Efficient JSON serialization
- Gzip compression supported

### Scalability

- Stateless design allows horizontal scaling
- Connection state stored in memory (consider Redis for multi-instance)
- Event broadcasting optimized for large connection counts

## Error Handling

### Connection Errors

```javascript
eventSource.onerror = (error) => {
  console.error("SSE Error:", error);
  // Automatic reconnection by browser
};
```

### Command Errors

```json
{
  "type": "mcp-error",
  "method": "tools/call",
  "error": {
    "message": "Tool not found",
    "code": -32601
  },
  "timestamp": "2024-01-01T10:00:00Z"
}
```

### Network Issues

- Browser automatically reconnects SSE connections
- Last-Event-ID header for event replay (if implemented)
- Graceful degradation to HTTP polling

## Integration Examples

### 1. Real-time Dashboard

```javascript
// Dashboard showing live project updates
eventSource.addEventListener("tool-result", (event) => {
  const data = JSON.parse(event.data);
  if (data.method === "list_projects") {
    updateProjectList(data.result);
  }
});

// Periodic project list refresh
setInterval(() => {
  sendMCPCommand("tools/call", {
    name: "list_projects",
    arguments: {},
  });
}, 30000);
```

### 2. Notification System

```javascript
// Broadcast maintenance notifications
await fetch("/mcp/sse/broadcast", {
  method: "POST",
  headers: {
    Authorization: "Bearer master-token",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    message: {
      type: "mcp-notification",
      result: {
        message: "Server maintenance in 5 minutes",
        level: "warning",
      },
      timestamp: new Date().toISOString(),
    },
    filter: {
      tokenTypes: ["team", "readonly"],
    },
  }),
});
```

### 3. Progress Tracking

```javascript
// Long-running tool execution with progress updates
eventSource.addEventListener("tool-result", (event) => {
  const data = JSON.parse(event.data);
  if (data.metadata?.progress) {
    updateProgressBar(data.metadata.progress);
  }
});
```

## Future Enhancements

### Planned Features

1. **Event Replay** - Store recent events for reconnecting clients
2. **Connection Pooling** - Optimize resource usage for many connections
3. **Custom Event Types** - Allow plugins to define custom SSE events
4. **Metrics Integration** - Prometheus/Grafana monitoring
5. **Redis Backend** - Multi-instance connection sharing

### Possible Improvements

1. **Compression** - Gzip compression for large events
2. **Filtering** - Client-side event filtering
3. **Batching** - Batch multiple events for efficiency
4. **Encryption** - End-to-end encryption for sensitive data

## Troubleshooting

### Common Issues

1. **Connection Refused**

   - Check server is running
   - Verify auth token is valid
   - Confirm URL and port

2. **Events Not Received**

   - Check browser console for errors
   - Verify SSE connection is established
   - Check server logs for connection issues

3. **Authentication Errors**

   - Ensure token is not expired
   - Check token permissions
   - Verify Authorization header format

4. **CORS Issues**
   - Configure ALLOWED_ORIGINS environment variable
   - Check browser CORS policy
   - Verify preflight OPTIONS requests

### Debug Commands

```bash
# Check server health
curl http://localhost:3000/health

# Test authentication
curl -H "Authorization: Bearer your-token" \
  http://localhost:3000/mcp/sse/stats

# Monitor server logs
docker-compose logs -f mcp-server

# Test SSE connection
npm run test-sse
```

## Conclusion

The SSE implementation provides a robust, scalable solution for real-time communication in the MCP server. It enables:

- **Real-time Updates**: Push notifications and live data updates
- **Event-Driven Architecture**: Reactive programming patterns
- **Scalable Broadcasting**: Efficient message distribution
- **Reliable Connections**: Automatic reconnection and error handling

The implementation follows web standards, provides comprehensive testing tools, and includes detailed monitoring capabilities for production deployment.
