const http = require('http');

// Test the backend health check server
const testHealthCheck = async () => {
  console.log('🧪 Testing Backend Health Check Server...\n');
  
  try {
    // Start the health check server
    console.log('🚀 Starting backend health check server...');
    require('./railway-health.js');
    
    // Wait a moment for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test health check endpoint
    const response = await new Promise((resolve, reject) => {
      const req = http.request('http://localhost:8080/healthz', {
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

    console.log(`✅ Health check response: ${response.statusCode} ${response.statusMessage}`);
    console.log(`📝 Response body: ${data}`);
    
    if (response.statusCode === 200 && data === 'OK') {
      console.log('\n🎯 SUCCESS: Backend health check server is working perfectly!');
      console.log('🚀 Ready to deploy to Railway!');
    } else {
      console.log('\n❌ FAILED: Health check not responding correctly');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Make sure no other process is using port 8080');
  }
};

// Run the test
testHealthCheck();
