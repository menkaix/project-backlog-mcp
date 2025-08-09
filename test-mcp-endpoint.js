#!/usr/bin/env node

/**
 * Test script for the MCP server endpoint
 * This script will help you test the /backlog-mcp/mcp endpoint and see detailed logs
 */

const https = require('https');
const http = require('http');

// Configuration
const HOST = 'localhost';
const PORT = 3000;
const BASE_PATH = '/backlog-mcp';
const TOKEN = 'd4v0prlqes6frIslcr7n'; // First token from your .env file

// Test data
const testRequests = [
  {
    name: 'Health Check',
    method: 'GET',
    path: `${BASE_PATH}/health`,
    headers: {},
    body: null
  },
  {
    name: 'Tools List',
    method: 'POST',
    path: `${BASE_PATH}/mcp`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`
    },
    body: JSON.stringify({
      method: 'tools/list',
      params: {}
    })
  },
  {
    name: 'Invalid Method',
    method: 'POST',
    path: `${BASE_PATH}/mcp`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`
    },
    body: JSON.stringify({
      method: 'invalid/method',
      params: {}
    })
  },
  {
    name: 'No Auth Token',
    method: 'POST',
    path: `${BASE_PATH}/mcp`,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      method: 'tools/list',
      params: {}
    })
  }
];

function makeRequest(testCase) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: testCase.path,
      method: testCase.method,
      headers: testCase.headers
    };

    console.log(`\n🧪 Testing: ${testCase.name}`);
    console.log(`📤 ${testCase.method} http://${HOST}:${PORT}${testCase.path}`);
    if (testCase.headers.Authorization) {
      console.log(`🔑 Auth: ${testCase.headers.Authorization.substring(0, 20)}...`);
    }
    if (testCase.body) {
      console.log(`📦 Body: ${testCase.body}`);
    }

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`📥 Status: ${res.statusCode}`);
        console.log(`📄 Response: ${data}`);
        
        try {
          const jsonData = JSON.parse(data);
          console.log(`✨ Parsed Response:`, JSON.stringify(jsonData, null, 2));
        } catch (e) {
          console.log(`⚠️  Response is not valid JSON`);
        }
        
        resolve({
          statusCode: res.statusCode,
          data: data,
          headers: res.headers
        });
      });
    });

    req.on('error', (error) => {
      console.error(`❌ Request failed: ${error.message}`);
      reject(error);
    });

    if (testCase.body) {
      req.write(testCase.body);
    }

    req.end();
  });
}

async function runTests() {
  console.log('🚀 Starting MCP Server Tests');
  console.log(`🎯 Target: http://${HOST}:${PORT}${BASE_PATH}`);
  console.log('=' .repeat(60));

  for (const testCase of testRequests) {
    try {
      await makeRequest(testCase);
      console.log('✅ Test completed');
    } catch (error) {
      console.log(`❌ Test failed: ${error.message}`);
    }
    
    // Wait a bit between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n🏁 All tests completed!');
  console.log('📊 Check your server logs to see the detailed logging in action.');
}

// Check if server is running first
function checkServer() {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path: `${BASE_PATH}/health`,
      method: 'GET',
      timeout: 5000
    }, (res) => {
      resolve(true);
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Server connection timeout'));
    });

    req.end();
  });
}

// Main execution
async function main() {
  try {
    console.log('🔍 Checking if server is running...');
    await checkServer();
    console.log('✅ Server is running!');
    await runTests();
  } catch (error) {
    console.error('❌ Server is not running or not accessible:');
    console.error(`   ${error.message}`);
    console.error('\n💡 Make sure to start your MCP server first:');
    console.error('   npm start');
    console.error(`   or check if it's running on http://${HOST}:${PORT}`);
    process.exit(1);
  }
}

main();
