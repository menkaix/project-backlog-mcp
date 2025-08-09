#!/usr/bin/env node
import { AuthManager } from '../dist/auth.js';
import { v4 as uuidv4 } from 'uuid';

const MCP_SERVER_SECRET = process.env.MCP_SERVER_SECRET || 'default-secret-change-me';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    type: 'team',
    expires: undefined,
    description: undefined
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--type' && i + 1 < args.length) {
      options.type = args[i + 1];
      i++;
    } else if (arg === '--expires' && i + 1 < args.length) {
      options.expires = args[i + 1];
      i++;
    } else if (arg === '--description' && i + 1 < args.length) {
      options.description = args[i + 1];
      i++;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node generate-token.js [options]

Options:
  --type <type>           Token type: master, team, readonly (default: team)
  --expires <duration>    Token expiration: 30s, 5m, 2h, 7d (optional)
  --description <desc>    Token description (optional)
  --help, -h             Show this help message

Examples:
  node generate-token.js --type team --expires 30d --description "Team access token"
  node generate-token.js --type readonly --expires 7d
  node generate-token.js --type master
      `);
      process.exit(0);
    }
  }

  return options;
}

function main() {
  try {
    const options = parseArgs();
    
    if (!['master', 'team', 'readonly'].includes(options.type)) {
      console.error('Error: Invalid token type. Must be one of: master, team, readonly');
      process.exit(1);
    }

    const authManager = new AuthManager(MCP_SERVER_SECRET);
    const token = authManager.generateToken(
      options.type,
      options.expires,
      options.description
    );

    console.log('\n✅ Token generated successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Token: ${token}`);
    console.log(`Type: ${options.type}`);
    if (options.expires) {
      console.log(`Expires: ${options.expires}`);
    } else {
      console.log('Expires: Never');
    }
    if (options.description) {
      console.log(`Description: ${options.description}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📋 Add this to your MCP client configuration:');
    console.log(`{
  "mcpServers": {
    "backlog-remote": {
      "command": "npx",
      "args": ["@modelcontextprotocol/client-http", "https://your-app.railway.app/mcp"],
      "env": {
        "MCP_AUTH_TOKEN": "${token}"
      }
    }
  }
}`);
    console.log('\n🔒 Keep this token secure and do not share it publicly!');
    
  } catch (error) {
    console.error('Error generating token:', error.message);
    process.exit(1);
  }
}

main();
