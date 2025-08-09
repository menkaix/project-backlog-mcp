#!/usr/bin/env node
import { AuthManager } from '../dist/auth.js';

const MCP_SERVER_SECRET = process.env.MCP_SERVER_SECRET || 'default-secret-change-me';

function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node revoke-token.js <token>

Arguments:
  <token>                 The token to revoke

Options:
  --help, -h             Show this help message

Examples:
  node revoke-token.js eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
    `);
    process.exit(0);
  }

  if (args.length === 0) {
    console.error('Error: Token is required');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  return args[0];
}

function main() {
  try {
    const token = parseArgs();
    
    const authManager = new AuthManager(MCP_SERVER_SECRET);
    const success = authManager.revokeToken(token);

    if (success) {
      console.log('\n✅ Token revoked successfully!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Token: ${token.substring(0, 20)}...`);
      console.log('Status: Revoked');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\n🔒 This token can no longer be used for authentication.');
    } else {
      console.log('\n⚠️  Token not found in active tokens list');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Token: ${token.substring(0, 20)}...`);
      console.log('Status: Not found or already revoked');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\n💡 The token has been added to the revoked list regardless.');
    }
    
  } catch (error) {
    console.error('Error revoking token:', error.message);
    process.exit(1);
  }
}

main();
