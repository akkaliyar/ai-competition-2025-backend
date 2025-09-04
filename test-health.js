const http = require('http');

const testEndpoint = (port, path) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: port,
      path: path,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          data: data,
          headers: res.headers
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
};

const testHealthEndpoints = async () => {
  const port = process.env.PORT || 8080;
  const endpoints = ['/', '/health', '/healthz', '/status', '/ping'];
  
  console.log(`🧪 Testing health endpoints on port ${port}...\n`);
  
  for (const endpoint of endpoints) {
    try {
      console.log(`🔍 Testing ${endpoint}...`);
      const result = await testEndpoint(port, endpoint);
      console.log(`✅ ${endpoint}: ${result.statusCode} - ${result.data.substring(0, 100)}${result.data.length > 100 ? '...' : ''}`);
    } catch (error) {
      console.log(`❌ ${endpoint}: ${error.message}`);
    }
    console.log('');
  }
  
  console.log('🏁 Health check testing completed!');
};

// Run the test
testHealthEndpoints().catch(console.error);
