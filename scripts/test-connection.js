#!/usr/bin/env node
import axios from 'axios';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

async function testConnection() {
  console.log('🔍 Testing MCP Server Connection...\n');
  
  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get(`${SERVER_URL}/health`);
    console.log('✅ Health check passed:', healthResponse.data);
    
    if (!AUTH_TOKEN) {
      console.log('\n⚠️  No AUTH_TOKEN provided. Skipping authenticated tests.');
      console.log('Set MCP_AUTH_TOKEN environment variable to test authenticated endpoints.');
      return;
    }
    
    // Test MCP tools list
    console.log('\n2. Testing MCP tools list...');
    const toolsResponse = await axios.post(`${SERVER_URL}/mcp`, {
      method: 'tools/list',
      params: {}
    }, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Tools list retrieved successfully:');
    console.log(`   Found ${toolsResponse.data.tools.length} tools`);
    toolsResponse.data.tools.forEach(tool => {
      console.log(`   - ${tool.name}: ${tool.description}`);
    });
    
    // Test a simple tool call
    console.log('\n3. Testing tool call (list_projects)...');
    const toolCallResponse = await axios.post(`${SERVER_URL}/mcp`, {
      method: 'tools/call',
      params: {
        name: 'list_projects',
        arguments: {}
      }
    }, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Tool call successful:');
    console.log('   Response:', toolCallResponse.data.content[0].text.substring(0, 200) + '...');
    
    console.log('\n🎉 All tests passed! Your MCP server is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
    }
    
    console.log('\n🔧 Troubleshooting tips:');
    console.log('- Make sure the server is running');
    console.log('- Check your AUTH_TOKEN is valid');
    console.log('- Verify the SERVER_URL is correct');
    console.log('- Check server logs for more details');
    
    process.exit(1);
  }
}

function showUsage() {
  console.log(`
Usage: node test-connection.js

Environment Variables:
  SERVER_URL      Server URL (default: http://localhost:3000)
  MCP_AUTH_TOKEN  Authentication token for testing

Examples:
  # Test local server
  MCP_AUTH_TOKEN=your-token node test-connection.js
  
  # Test remote server
  SERVER_URL=https://your-app.railway.app MCP_AUTH_TOKEN=your-token node test-connection.js
  `);
}

// Check for help flag
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showUsage();
  process.exit(0);
}

testConnection();
