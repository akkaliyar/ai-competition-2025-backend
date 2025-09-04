const net = require('net');

// Check which ports are available
const checkPort = (port) => {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.listen(port, '0.0.0.0', () => {
      server.close();
      resolve({ port, available: true });
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve({ port, available: false, error: 'Address in use' });
      } else {
        resolve({ port, available: false, error: err.message });
      }
    });
  });
};

// Check a range of ports
const checkPortRange = async (startPort, endPort) => {
  console.log(`🔍 Checking ports ${startPort}-${endPort} for availability...\n`);
  
  const results = [];
  const batchSize = 10; // Check 10 ports at a time
  
  for (let i = startPort; i <= endPort; i += batchSize) {
    const batch = [];
    for (let j = 0; j < batchSize && i + j <= endPort; j++) {
      batch.push(checkPort(i + j));
    }
    
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
    
    // Show progress
    const available = batchResults.filter(r => r.available).length;
    console.log(`Ports ${i}-${Math.min(i + batchSize - 1, endPort)}: ${available}/${batchResults.length} available`);
  }
  
  return results;
};

// Main function
const main = async () => {
  console.log('🚀 Port Availability Checker\n');
  
  // Check common port ranges
  const results = await checkPortRange(8080, 8100);
  
  console.log('\n📊 Results Summary:');
  console.log('==================');
  
  const available = results.filter(r => r.available);
  const unavailable = results.filter(r => !r.available);
  
  console.log(`✅ Available ports: ${available.length}`);
  console.log(`❌ Unavailable ports: ${unavailable.length}`);
  
  if (available.length > 0) {
    console.log('\n🎯 Recommended ports to use:');
    available.slice(0, 10).forEach(r => {
      console.log(`   Port ${r.port}`);
    });
  }
  
  if (unavailable.length > 0) {
    console.log('\n⚠️ Unavailable ports:');
    unavailable.slice(0, 10).forEach(r => {
      console.log(`   Port ${r.port}: ${r.error}`);
    });
  }
  
  console.log('\n💡 Tip: Use available ports in your port sequence for better startup success');
};

main().catch(console.error);
