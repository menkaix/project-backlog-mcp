# Project Backlog MCP Server

A Model Context Protocol (MCP) server that provides access to the HyperManager Project Backlog API. This server can be deployed on Railway or other cloud platforms and accessed remotely via HTTP.

## Features

- **Complete MCP Protocol Support**: Full implementation of MCP with initialize, tools, resources, and prompts
- **Complete API Coverage**: Access all HyperManager API endpoints through MCP tools
- **Smart Resources**: Auto-generated resources from Swagger API with intelligent caching
- **Contextual Prompts**: Pre-built prompts for common project management tasks
- **Secure Authentication**: Token-based authentication with different permission levels
- **Remote Deployment**: Deploy on Railway, Render, Fly.io, or any cloud platform
- **Rate Limiting**: Built-in protection against abuse
- **Comprehensive Logging**: Structured logging with Winston
- **Health Monitoring**: Health check endpoints for monitoring

## Available Tools

### Diagram Tools

- `create_diagram` - Create a new diagram
- `list_diagrams` - List all diagrams
- `get_diagram` - Get diagram by ID
- `update_diagram` - Update diagram
- `get_diagram_png` - Get diagram as PNG
- `get_diagram_plantuml_url` - Get PlantUML URL
- `get_diagram_definition` - Get diagram definition
- `update_diagram_definition` - Update diagram definition
- `update_diagram_graphic` - Update diagram graphic

### Project Tools

- `create_project` - Create a new project
- `list_projects` - List all projects
- `get_project_tree` - Get project tree structure

### Story Tools

- `get_story_tree` - Get story tree structure
- `update_story` - Update a story

### Feature Tools

- `refresh_feature_types` - Refresh feature types
- `list_feature_types` - List feature types
- `add_feature_to_story` - Add feature to story
- `add_child_feature` - Add child feature
- `adopt_child_feature` - Adopt child feature

### Actor Tools

- `add_actor` - Add actor to project
- `add_story_to_actor` - Add story to actor

### Utility Tools

- `normalize_tasks` - Normalize tasks

## Available Resources

The server provides intelligent resources that expose HyperManager data in a structured way for LLMs:

### Diagram Resources

- `resource://diagrams/` - List of all diagrams
- `resource://diagrams/{id}` - Specific diagram details
- `resource://diagrams/{name}/definition` - PlantUML definition
- `resource://diagrams/{name}/png` - PNG image data
- `resource://diagrams/{name}/plantuml-url` - PlantUML server URL

### Project Resources

- `resource://projects/` - List of all projects
- `resource://projects/{project}/tree` - Complete project structure

### Story Resources

- `resource://stories/{storyId}/tree` - Story hierarchy and features

### Feature Resources

- `resource://features/types` - Available feature types

### Meta Resources

- `resource://api/schema` - Complete Swagger API schema
- `resource://api/endpoints` - API endpoints summary

## Available Prompts

Pre-built prompts for common project management tasks:

### Project Analysis

- `analyze_project` - Comprehensive project structure analysis
- `optimize_project_structure` - Suggestions for project optimization

### Diagram Creation

- `create_diagram` - Guided PlantUML diagram creation with best practices

### Story Management

- `generate_user_stories` - Generate well-structured user stories
- `review_story_tree` - Analyze story completeness and structure
- `suggest_features` - Recommend features based on context

## Quick Start

### 1. Get Your HyperManager API Key

1. Visit the HyperManager developer dashboard
2. Create a new API key
3. Copy the key for later use

### 2. Deploy on VPS with Docker Compose

1. Clone the repository on your VPS:

```bash
git clone https://github.com/your-username/project-backlog-mcp.git
cd project-backlog-mcp
```

2. Copy and configure environment variables:

```bash
cp .env.example .env
```

3. Edit `.env` with your configuration:

```env
HYPERMANAGER_API_KEY=your-api-key-here
MCP_SERVER_SECRET=your-secure-jwt-secret-here
ALLOWED_TOKENS=token1,token2,token3
HOST=0.0.0.0
PORT=3000
NODE_ENV=production
ALLOWED_ORIGINS=https://yourdomain.com
```

4. Build and start the service:

```bash
docker-compose up -d
```

5. Verify the deployment:

```bash
docker-compose logs -f mcp-server
curl http://localhost:3000/backlog-mcp/health
```

### 3. Generate Access Tokens

After deployment, generate tokens for accessing your server:

```bash
# Generate a master token (full access)
docker-compose exec mcp-server npm run generate-token -- --type master --description "Master access token"

# Generate a team token (limited access)
docker-compose exec mcp-server npm run generate-token -- --type team --expires 30d --description "Team access token"

# Generate a readonly token
docker-compose exec mcp-server npm run generate-token -- --type readonly --expires 7d --description "Read-only access"
```

### 4. Configure Your MCP Client

Add the server to your MCP client configuration:

```json
{
  "mcpServers": {
    "backlog-remote": {
      "command": "npx",
      "args": [
        "@modelcontextprotocol/client-http",
        "https://yourdomain.com/backlog-mcp/mcp"
      ],
      "env": {
        "MCP_AUTH_TOKEN": "your-generated-token-here"
      }
    }
  }
}
```

## Docker Compose Management

### Common Commands

```bash
# Start the service
docker-compose up -d

# Stop the service
docker-compose down

# View logs
docker-compose logs -f mcp-server

# Restart the service
docker-compose restart mcp-server

# Rebuild and restart
docker-compose up -d --build

# Check service status
docker-compose ps

# Execute commands in the container
docker-compose exec mcp-server npm run generate-token -- --type master
```

### Updates and Maintenance

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart with new code
docker-compose down
docker-compose up -d --build

# View container resource usage
docker stats project-backlog-mcp
```

## Local Development

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Setup

1. Clone the repository:

```bash
git clone https://github.com/your-username/project-backlog-mcp.git
cd project-backlog-mcp
```

2. Install dependencies:

```bash
npm install
```

3. Copy environment variables:

```bash
cp .env.example .env
```

4. Edit `.env` with your configuration:

```env
HYPERMANAGER_API_KEY=your-api-key-here
MCP_SERVER_SECRET=your-secret-here
ALLOWED_TOKENS=token1,token2
```

5. Build and start:

```bash
npm run build
npm start
```

### Development Mode

For development with auto-reload:

```bash
npm run dev
```

### Testing

Test your server connection:

```bash
# Test local server
MCP_AUTH_TOKEN=your-token npm test

# Test remote server
SERVER_URL=https://your-app.railway.app MCP_AUTH_TOKEN=your-token npm test
```

## Authentication & Security

### Token Types

- **Master**: Full access to all tools and admin functions
- **Team**: Access to all tools except admin functions
- **Readonly**: Read-only access to tools

### Security Features

- JWT-based authentication
- Rate limiting (100 requests per 15 minutes per IP)
- CORS protection
- Helmet security headers
- Input validation with Zod
- Secure token generation and management

### Admin Endpoints

Master tokens can access admin endpoints:

- `POST /admin/generate-token` - Generate new tokens
- `POST /admin/revoke-token` - Revoke existing tokens
- `GET /admin/tokens` - List active tokens

## API Reference

### Health Check

```
GET /backlog-mcp/health
```

### MCP Endpoints

**Important**: This server follows the Model Context Protocol (MCP) standard. All tool operations go through MCP endpoints with different methods in the request body.

#### Standard HTTP MCP Endpoint (for Postman, curl, etc.)

```
POST /backlog-mcp/mcp
Authorization: Bearer <token>
Content-Type: application/json

{
  "method": "tools/list" | "tools/call" | "resources/list" | "resources/read" | "prompts/list" | "prompts/get",
  "params": { ... }
}
```

#### HTTP Streaming MCP Endpoint (for n8n, streaming clients)

```
POST /backlog-mcp/mcp/stream
Authorization: Bearer <token>
Content-Type: application/json
Connection: keep-alive

{"method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "client", "version": "1.0.0"}}}
{"method": "tools/list"}
{"method": "tools/call", "params": {"name": "list_projects", "arguments": {}}}
```

The streaming endpoint:

- Accepts multiple JSON messages separated by newlines
- Maintains persistent connection
- Responds with JSON messages for each request
- Compatible with n8n's "HTTP Streamable" transport

**⚠️ Common Mistake**: Do NOT use REST-style endpoints like `/backlog-mcp/tools/list` - these will return 404 errors. All operations must use the MCP endpoints above.

### List Available Tools

```bash
curl -X POST https://yourdomain.com/backlog-mcp/mcp \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/list"
  }'
```

### Tool Call Example

```bash
curl -X POST https://yourdomain.com/backlog-mcp/mcp \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "list_projects",
      "arguments": {}
    }
  }'
```

### Resources Examples

List available resources:

```bash
curl -X POST https://yourdomain.com/backlog-mcp/mcp \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "resources/list"
  }'
```

Read a specific resource:

```bash
curl -X POST https://yourdomain.com/backlog-mcp/mcp \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "resources/read",
    "params": {
      "uri": "resource://projects/"
    }
  }'
```

### Prompts Examples

List available prompts:

```bash
curl -X POST https://yourdomain.com/backlog-mcp/mcp \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "prompts/list"
  }'
```

Get a prompt with arguments:

```bash
curl -X POST https://yourdomain.com/backlog-mcp/mcp \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "prompts/get",
    "params": {
      "name": "analyze_project",
      "arguments": {
        "project": "my-project"
      }
    }
  }'
```

### Available Endpoints Summary

| Endpoint               | Method   | Purpose          | Authentication    |
| ---------------------- | -------- | ---------------- | ----------------- |
| `/backlog-mcp/health`  | GET      | Health check     | None              |
| `/backlog-mcp/mcp`     | GET      | MCP info/usage   | None              |
| `/backlog-mcp/mcp`     | POST     | MCP operations   | Required          |
| `/backlog-mcp/admin/*` | POST/GET | Admin operations | Master token only |

**❌ These endpoints DO NOT exist:**

- `/backlog-mcp/tools/list` (use POST `/backlog-mcp/mcp` with `{"method": "tools/list"}`)
- `/backlog-mcp/tools/call` (use POST `/backlog-mcp/mcp` with `{"method": "tools/call"}`)
- `/backlog-mcp/projects` (use the MCP endpoint with appropriate tool calls)

### Admin Endpoints

With BASE_PATH configured, admin endpoints are available at:

- `POST /backlog-mcp/admin/generate-token` - Generate new tokens
- `POST /backlog-mcp/admin/revoke-token` - Revoke existing tokens
- `GET /backlog-mcp/admin/tokens` - List active tokens

## Deployment Options

### VPS with Docker Compose (Recommended)

The easiest way to deploy on your own VPS with nginx already configured:

1. Clone the repository on your VPS
2. Configure environment variables in `.env`
3. Run `docker-compose up -d`
4. Configure nginx to proxy to `localhost:3000/backlog-mcp`

**Nginx Configuration Example:**

```nginx
location /backlog-mcp/ {
    proxy_pass http://localhost:3000/backlog-mcp/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Port $server_port;
}
```

See the "Deploy on VPS with Docker Compose" section above for detailed instructions.

### Railway

1. Connect your GitHub repository to Railway
2. Set environment variables
3. Deploy automatically

### Render

1. Create a new Web Service
2. Connect your repository
3. Set build command: `npm run build`
4. Set start command: `npm start`
5. Add environment variables

### Fly.io

1. Install Fly CLI
2. Run `fly launch`
3. Configure `fly.toml`
4. Deploy with `fly deploy`

### Docker (Manual)

```bash
# Build image
docker build -t backlog-mcp .

# Run container
docker run -p 3000:3000 \
  -e HYPERMANAGER_API_KEY=your-key \
  -e MCP_SERVER_SECRET=your-secret \
  backlog-mcp
```

## Monitoring

### Health Checks

The server provides health check endpoints:

- `GET /health` - Basic health status
- Docker health check included

### Logging

Structured logging with Winston:

- Console output in development
- JSON format in production
- Configurable log levels

### Metrics

Monitor your deployment:

- Request/response logging
- Error tracking
- Token usage statistics

## Troubleshooting

### Common Issues

1. **404 Error on `/backlog-mcp/tools/list`**

   - **Problem**: Trying to access REST-style endpoints that don't exist
   - **Solution**: Use the MCP endpoint instead:

     ```bash
     # ❌ Wrong - This returns 404
     curl https://yourdomain.com/backlog-mcp/tools/list

     # ✅ Correct - Use MCP endpoint
     curl -X POST https://yourdomain.com/backlog-mcp/mcp \
       -H "Authorization: Bearer your-token" \
       -H "Content-Type: application/json" \
       -d '{"method": "tools/list"}'
     ```

2. **Authentication Failed**

   - Check your token is valid
   - Verify token hasn't expired
   - Ensure correct Authorization header

3. **API Errors**

   - Verify HYPERMANAGER_API_KEY is correct
   - Check API endpoint availability
   - Review server logs

4. **Connection Issues**
   - Confirm server is running
   - Check firewall/network settings
   - Verify URL is correct

### Debug Mode

Enable debug logging:

```env
NODE_ENV=development
```

### Support

- Check server logs for detailed error messages
- Use the test script to diagnose issues
- Review the health endpoint for server status

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Security

- Report security issues privately
- Keep your API keys secure
- Regularly rotate access tokens
- Monitor access logs

---

For more information about the Model Context Protocol, visit [https://modelcontextprotocol.io](https://modelcontextprotocol.io)
