#!/usr/bin/env node

console.log('🚀 Railway Startup Script Starting...');
console.log('📊 Environment:', process.env.NODE_ENV || 'production');
console.log('📊 Port:', process.env.PORT || 8080);
console.log('📊 Time:', new Date().toISOString());
console.log('📁 Current directory:', process.cwd());
console.log('📁 Files in directory:', require('fs').readdirSync('.'));

// Start the dedicated health check server
try {
  console.log('🔍 Loading railway-health-check.js...');
  require('./railway-health-check.js');
  console.log('✅ Health check server loaded successfully');
} catch (error) {
  console.error('❌ Failed to load health check server:', error.message);
  console.log('📁 Available files:', require('fs').readdirSync('.'));
  process.exit(1);
}

console.log('✅ Railway startup script completed - health check server is running');
