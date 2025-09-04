const http = require('http');

// Simple health check server for Railway
const server = http.createServer((req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (req.url === '/healthz' && req.method === 'GET') {
    console.log('🔍 Railway health check (Standalone server)');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else if (req.url === '/ping' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('pong');
  } else if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: 'AI CRM Backend Health Server',
      status: 'running',
      timestamp: new Date().toISOString(),
      endpoints: ['/healthz', '/ping', '/']
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

const port = process.env.PORT || 8080;

server.listen(port, '0.0.0.0', () => {
  console.log(`✅ Health check server started on port ${port}`);
  console.log(`🔗 Railway health check available at: http://0.0.0.0:${port}/healthz`);
  console.log(`🔗 Ping endpoint at: http://0.0.0.0:${port}/ping`);
  console.log(`🔗 Root endpoint at: http://0.0.0.0:${port}/`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Health check server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🔄 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Health check server closed');
    process.exit(0);
  });
});

// Error handling
server.on('error', (error) => {
  console.error('❌ Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.log('⚠️ Port is in use, trying alternative port...');
    const altPort = port + 1;
    server.listen(altPort, '0.0.0.0', () => {
      console.log(`✅ Health check server started on alternative port ${altPort}`);
      console.log(`🔗 Railway health check available at: http://0.0.0.0:${altPort}/healthz`);
    });
  }
});
