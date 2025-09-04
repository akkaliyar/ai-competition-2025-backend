const http = require('http');

const testHealthz = () => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/healthz',
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

const testHealthzEndpoint = async () => {
  try {
    console.log('🧪 Testing /healthz endpoint on port 3001...');
    const result = await testHealthz();
    console.log(`✅ /healthz: ${result.statusCode} - "${result.data}"`);
    
    if (result.statusCode === 200) {
      console.log('🎉 Health check is working! Railway should be happy.');
    } else {
      console.log('❌ Health check returned non-200 status');
    }
  } catch (error) {
    console.log(`❌ /healthz: ${error.message}`);
    console.log('💡 Make sure the server is running on port 3001');
  }
};

// Run the test
testHealthzEndpoint().catch(console.error);
