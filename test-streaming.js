#!/usr/bin/env node

/**
 * Test script for HTTP Streaming MCP endpoint
 * Tests the new /mcp/stream endpoint for n8n compatibility
 */

const http = require('http');

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || 'test-token';
const BASE_PATH = process.env.BASE_PATH || '/backlog-mcp';

console.log('🧪 Testing MCP HTTP Streaming Endpoint');
console.log(`📍 Server: ${SERVER_URL}${BASE_PATH}/mcp/stream`);
console.log(`🔑 Token: ${MCP_AUTH_TOKEN.substring(0, 10)}...`);
console.log('');

function testStreamingEndpoint() {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SERVER_URL}${BASE_PATH}/mcp/stream`);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MCP_AUTH_TOKEN}`,
        'User-Agent': 'MCP-Streaming-Test-Client/1.0.0'
      }
    };

    console.log('🚀 Starting streaming connection...');
    
    const req = http.request(options, (res) => {
      console.log(`📡 Connection established - Status: ${res.statusCode}`);
      console.log(`📋 Headers:`, res.headers);
      console.log('');
      
      let responseData = '';
      let messageCount = 0;
      
      res.on('data', (chunk) => {
        const data = chunk.toString();
        responseData += data;
        
        // Process complete JSON lines
        const lines = data.split('\n');
        lines.forEach(line => {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            messageCount++;
            console.log(`📨 Response ${messageCount}:`);
            try {
              const parsed = JSON.parse(trimmedLine);
              console.log(JSON.stringify(parsed, null, 2));
            } catch (e) {
              console.log(`Raw: ${trimmedLine}`);
            }
            console.log('');
          }
        });
      });
      
      res.on('end', () => {
        console.log('✅ Streaming connection ended');
        console.log(`📊 Total messages received: ${messageCount}`);
        resolve({ success: true, messageCount, responseData });
      });
      
      res.on('error', (error) => {
        console.log('❌ Response error:', error.message);
        reject(error);
      });
    });

    req.on('error', (error) => {
      console.log('❌ Request error:', error.message);
      reject(error);
    });

    // Send test messages
    console.log('📤 Sending initialize message...');
    const initMessage = JSON.stringify({
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'streaming-test-client',
          version: '1.0.0'
        }
      }
    }) + '\n';
    
    req.write(initMessage);
    
    // Wait a bit then send tools/list
    setTimeout(() => {
      console.log('📤 Sending tools/list message...');
      const toolsMessage = JSON.stringify({
        method: 'tools/list'
      }) + '\n';
      
      req.write(toolsMessage);
      
      // End the request after another short delay
      setTimeout(() => {
        console.log('📤 Ending request...');
        req.end();
      }, 1000);
    }, 1000);
  });
}

// Run the test
async function runTest() {
  try {
    console.log('🎯 Testing HTTP Streaming MCP Endpoint\n');
    
    const result = await testStreamingEndpoint();
    
    console.log('🎉 Test completed successfully!');
    console.log(`✅ Messages exchanged: ${result.messageCount}`);
    
    if (result.messageCount >= 2) {
      console.log('✅ Streaming protocol working correctly');
      console.log('✅ Ready for n8n integration');
    } else {
      console.log('⚠️  Expected at least 2 messages (initialize + tools/list)');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('');
    console.log('💡 Make sure your server is running with:');
    console.log('   npm start');
    console.log('');
    console.log('💡 And you have a valid token. Generate one with:');
    console.log('   npm run generate-token -- --type master');
    process.exit(1);
  }
}

runTest();
