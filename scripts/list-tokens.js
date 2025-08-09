#!/usr/bin/env node
import { AuthManager } from '../dist/auth.js';

const MCP_SERVER_SECRET = process.env.MCP_SERVER_SECRET || 'default-secret-change-me';

function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node list-tokens.js [options]

Options:
  --format <format>       Output format: table, json (default: table)
  --help, -h             Show this help message

Examples:
  node list-tokens.js
  node list-tokens.js --format json
    `);
    process.exit(0);
  }

  const options = {
    format: 'table'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--format' && i + 1 < args.length) {
      options.format = args[i + 1];
      i++;
    }
  }

  if (!['table', 'json'].includes(options.format)) {
    console.error('Error: Invalid format. Must be one of: table, json');
    process.exit(1);
  }

  return options;
}

function formatDate(date) {
  if (!date) return 'Never';
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

function formatDuration(date) {
  if (!date) return 'Never';
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  
  if (diff <= 0) return 'Expired';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function printTable(tokens) {
  if (tokens.length === 0) {
    console.log('\n📋 No active tokens found');
    return;
  }

  console.log('\n📋 Active Tokens');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Table headers
  const headers = ['ID', 'Type', 'Created', 'Expires', 'Last Used', 'Description'];
  const colWidths = [20, 10, 20, 15, 20, 30];
  
  // Print headers
  let headerRow = '';
  for (let i = 0; i < headers.length; i++) {
    headerRow += headers[i].padEnd(colWidths[i]);
  }
  console.log(headerRow);
  console.log('━'.repeat(headerRow.length));
  
  // Print token rows
  tokens.forEach(token => {
    const row = [
      token.id.substring(0, 18) + (token.id.length > 18 ? '..' : ''),
      token.type,
      formatDate(token.createdAt).substring(0, 19),
      formatDuration(token.expiresAt),
      token.lastUsed ? formatDate(token.lastUsed).substring(0, 19) : 'Never',
      (token.description || 'No description').substring(0, 28) + ((token.description || '').length > 28 ? '..' : '')
    ];
    
    let tokenRow = '';
    for (let i = 0; i < row.length; i++) {
      tokenRow += row[i].padEnd(colWidths[i]);
    }
    console.log(tokenRow);
  });
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n📊 Total: ${tokens.length} active token${tokens.length !== 1 ? 's' : ''}`);
}

function main() {
  try {
    const options = parseArgs();
    
    const authManager = new AuthManager(MCP_SERVER_SECRET);
    const tokens = authManager.listTokens();

    if (options.format === 'json') {
      console.log(JSON.stringify(tokens, null, 2));
    } else {
      printTable(tokens);
    }
    
  } catch (error) {
    console.error('Error listing tokens:', error.message);
    process.exit(1);
  }
}

main();
