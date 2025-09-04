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
          status: res.statusCode,
          headers: res.headers,
          data: data
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
  const endpoints = ['/', '/healthz', '/health', '/ping', '/status'];

  console.log(`🔍 Testing health endpoints on port ${port}...\n`);

  for (const endpoint of endpoints) {
    try {
      const result = await testEndpoint(port, endpoint);
      console.log(`✅ ${endpoint}: ${result.status} - ${result.data.substring(0, 100)}...`);
    } catch (error) {
      console.log(`❌ ${endpoint}: ${error.message}`);
    }
  }

  console.log('\n🎯 Health check test completed!');
};

testHealthEndpoints().catch(console.error);
