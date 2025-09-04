#!/usr/bin/env node

console.log('🚀 Railway Startup Script Starting...');
console.log('📊 Environment:', process.env.NODE_ENV || 'production');
console.log('📊 Port:', process.env.PORT || 8080);
console.log('📊 Time:', new Date().toISOString());

// Start the dedicated health check server
require('./railway-health-check.js');

console.log('✅ Railway startup script completed - health check server is running');
