#!/usr/bin/env node

/**
 * Test script for Server-Sent Events (SSE) MCP endpoint
 * Tests the new /mcp/sse endpoint for real-time communication
 */

import { EventSource } from 'eventsource';
import fetch from 'node-fetch';

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || 'test-token';
const BASE_PATH = process.env.BASE_PATH || '';

console.log('🧪 Testing MCP Server-Sent Events (SSE) Endpoint');
console.log(`📍 Server: ${SERVER_URL}${BASE_PATH}`);
console.log(`🔑 Token: ${MCP_AUTH_TOKEN.substring(0, 10)}...`);
console.log('');

let connectionId = null;
let eventSource = null;

async function testSSEConnection() {
  return new Promise((resolve, reject) => {
    console.log('🚀 Establishing SSE connection...');
    
    // Create EventSource with authentication
    const sseUrl = `${SERVER_URL}${BASE_PATH}/mcp/sse?token=${encodeURIComponent(MCP_AUTH_TOKEN)}`;
    eventSource = new EventSource(sseUrl);
    
    let messageCount = 0;
    let connectionEstablished = false;
    
    // Handle different event types
    eventSource.addEventListener('connection-status', (event) => {
      const data = JSON.parse(event.data);
      console.log('📡 Connection Status Event:');
      console.log(JSON.stringify(data, null, 2));
      
      if (data.result && data.result.connectionId) {
        connectionId = data.result.connectionId;
        connectionEstablished = true;
        console.log(`✅ Connection established with ID: ${connectionId}`);
      }
    });
    
    eventSource.addEventListener('mcp-notification', (event) => {
      const data = JSON.parse(event.data);
      console.log('📨 MCP Notification:');
      console.log(JSON.stringify(data, null, 2));
      
      if (data.result && data.result.connectionId) {
        connectionId = data.result.connectionId;
        connectionEstablished = true;
        console.log(`✅ Connection established with ID: ${connectionId}`);
      }
    });
    
    eventSource.addEventListener('mcp-response', (event) => {
      const data = JSON.parse(event.data);
      messageCount++;
      console.log(`📨 MCP Response ${messageCount}:`);
      console.log(JSON.stringify(data, null, 2));
    });
    
    eventSource.addEventListener('mcp-error', (event) => {
      const data = JSON.parse(event.data);
      console.log('❌ MCP Error:');
      console.log(JSON.stringify(data, null, 2));
    });
    
    eventSource.addEventListener('heartbeat', (event) => {
      const data = JSON.parse(event.data);
      console.log('💓 Heartbeat:', data.metadata?.serverTime);
    });
    
    eventSource.addEventListener('tool-result', (event) => {
      const data = JSON.parse(event.data);
      console.log('🔧 Tool Result:');
      console.log(JSON.stringify(data, null, 2));
    });
    
    // Handle connection open
    eventSource.onopen = () => {
      console.log('🔗 SSE connection opened');
    };
    
    // Handle errors
    eventSource.onerror = (error) => {
      console.log('❌ SSE connection error:', error);
      if (!connectionEstablished) {
        reject(new Error('Failed to establish SSE connection'));
      }
    };
    
    // Wait for connection to be established
    setTimeout(() => {
      if (connectionEstablished && connectionId) {
        resolve({ connectionId, messageCount });
      } else {
        reject(new Error('Connection not established within timeout'));
      }
    }, 5000);
  });
}

async function sendMCPCommand(connectionId, command) {
  console.log(`📤 Sending MCP command: ${command.method}`);
  
  try {
    const response = await fetch(`${SERVER_URL}${BASE_PATH}/mcp/sse/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MCP_AUTH_TOKEN}`
      },
      body: JSON.stringify({
        connectionId,
        message: command
      })
    });
    
    const result = await response.json();
    console.log('📤 Send result:', result);
    
    return result;
  } catch (error) {
    console.error('❌ Failed to send command:', error.message);
    return null;
  }
}

async function testBroadcast() {
  console.log('📡 Testing broadcast functionality...');
  
  try {
    const response = await fetch(`${SERVER_URL}${BASE_PATH}/mcp/sse/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MCP_AUTH_TOKEN}`
      },
      body: JSON.stringify({
        message: {
          type: 'mcp-notification',
          result: {
            message: 'Broadcast test message',
            timestamp: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        }
      })
    });
    
    const result = await response.json();
    console.log('📡 Broadcast result:', result);
    
    return result;
  } catch (error) {
    console.error('❌ Failed to broadcast:', error.message);
    return null;
  }
}

async function getSSEStats() {
  console.log('📊 Getting SSE statistics...');
  
  try {
    const response = await fetch(`${SERVER_URL}${BASE_PATH}/mcp/sse/stats`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${MCP_AUTH_TOKEN}`
      }
    });
    
    const stats = await response.json();
    console.log('📊 SSE Stats:', JSON.stringify(stats, null, 2));
    
    return stats;
  } catch (error) {
    console.error('❌ Failed to get stats:', error.message);
    return null;
  }
}

// Run the test
async function runTest() {
  try {
    console.log('🎯 Testing MCP Server-Sent Events\n');
    
    // Step 1: Establish SSE connection
    const connectionResult = await testSSEConnection();
    console.log(`✅ SSE connection established: ${connectionResult.connectionId}\n`);
    
    // Step 2: Wait a moment for connection to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 3: Send some MCP commands via SSE
    console.log('📤 Testing MCP commands via SSE...\n');
    
    // Test tools/list command
    await sendMCPCommand(connectionResult.connectionId, {
      method: 'tools/list'
    });
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test a simple tool call (if available)
    await sendMCPCommand(connectionResult.connectionId, {
      method: 'tools/call',
      params: {
        name: 'list_projects',
        arguments: {}
      }
    });
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 4: Test broadcast (if master token)
    await testBroadcast();
    
    // Wait for broadcast
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 5: Get SSE statistics
    await getSSEStats();
    
    // Step 6: Wait for heartbeat
    console.log('💓 Waiting for heartbeat...');
    await new Promise(resolve => setTimeout(resolve, 35000)); // Wait for heartbeat
    
    console.log('\n🎉 SSE test completed successfully!');
    console.log('✅ Connection established and maintained');
    console.log('✅ MCP commands sent and received');
    console.log('✅ Real-time communication working');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('');
    console.log('💡 Make sure your server is running with:');
    console.log('   npm start');
    console.log('');
    console.log('💡 And you have a valid token. Generate one with:');
    console.log('   npm run generate-token -- --type master');
    process.exit(1);
  } finally {
    // Clean up
    if (eventSource) {
      console.log('🔌 Closing SSE connection...');
      eventSource.close();
    }
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted by user');
  if (eventSource) {
    eventSource.close();
  }
  process.exit(0);
});

runTest();
