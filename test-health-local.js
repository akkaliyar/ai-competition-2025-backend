const http = require('http');

// Test health check endpoints locally
const testEndpoints = async () => {
  const baseUrl = 'http://localhost:8080';
  const endpoints = [
    '/healthz',
    '/ping',
    '/',
    '/api/files'
  ];

  console.log('🧪 Testing health check endpoints...\n');

  for (const endpoint of endpoints) {
    try {
      const response = await new Promise((resolve, reject) => {
        const req = http.request(`${baseUrl}${endpoint}`, {
          method: 'GET',
          timeout: 5000
        }, resolve);
        
        req.on('error', reject);
        req.on('timeout', () => reject(new Error('Timeout')));
        req.end();
      });

      let data = '';
      response.on('data', chunk => data += chunk);
      
      await new Promise((resolve) => {
        response.on('end', resolve);
      });

      console.log(`✅ ${endpoint}: ${response.statusCode} ${response.statusMessage}`);
      if (data) {
        console.log(`   Response: ${data.substring(0, 100)}${data.length > 100 ? '...' : ''}`);
      }
    } catch (error) {
      console.log(`❌ ${endpoint}: ${error.message}`);
    }
    console.log('');
  }
};

// Test if server is running
const checkServer = async () => {
  try {
    const response = await new Promise((resolve, reject) => {
      const req = http.request('http://localhost:8080/healthz', {
        method: 'GET',
        timeout: 5000
      }, resolve);
      
      req.on('error', reject);
      req.on('timeout', () => reject(new Error('Timeout')));
      req.end();
    });

    console.log('🎯 Server is running! Testing endpoints...\n');
    await testEndpoints();
  } catch (error) {
    console.log('❌ Server is not running on port 8080');
    console.log('💡 Start the server first with: npm run start:prod');
    console.log('💡 Or test the standalone health server with: node ../health-server.js');
  }
};

checkServer();
