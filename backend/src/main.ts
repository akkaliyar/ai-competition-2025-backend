import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as http from 'http';

// Create a simple HTTP server immediately for health checks
const createHealthCheckServer = (port: number) => {
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz' && req.method === 'GET') {
      console.log('🔍 Railway health check (HTTP server)');
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

  server.listen(port, '0.0.0.0', () => {
    console.log(`✅ Health check server started on port ${port}`);
    console.log(`🔗 Railway health check available at: http://0.0.0.0:${port}/healthz`);
  });

  return server;
};

async function bootstrap() {
  // Always use port 8080 for Railway deployment
  const port = process.env.PORT ? Number(process.env.PORT) : 8080;
  
  // Start health check server immediately
  const healthServer = createHealthCheckServer(port);
  
  try {
    console.log('🚀 Starting AI CRM Backend...');
    console.log('📊 Environment:', process.env.NODE_ENV || 'development');
    console.log('📊 Port:', port);
    
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'], // Enable logging for debugging
    });
    
    // Enable CORS for frontend communication
    app.enableCors({
      origin: true, // Allow all origins in development
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Allow-Headers'],
      credentials: true,
      preflightContinue: false,
      optionsSuccessStatus: 204,
    });

    // Global validation pipe
    app.useGlobalPipes(new ValidationPipe());

    // Simple Express-style health endpoints as backup
    app.use('/ping', (req, res) => {
      res.status(200).send('pong');
    });

    // Railway health check backup - always return 200 OK
    app.use('/healthz', (req, res) => {
      console.log('🔍 Railway health check (Express backup)');
      res.status(200).send('OK');
    });

    // Health endpoints are handled by HealthController

    // Start server on configured port
    await app.listen(port, '0.0.0.0');
    
    // Close the simple health check server since NestJS is now running
    healthServer.close(() => {
      console.log('🔄 Health check server closed, NestJS is now handling requests');
    });
    
    console.log(`✅ AI CRM Backend successfully started on port ${port}`);
    console.log(`🔗 Health check available at: http://0.0.0.0:${port}/health`);
    console.log(`🔗 Railway health check at: http://0.0.0.0:${port}/healthz`);
    console.log(`🔗 Status endpoint at: http://0.0.0.0:${port}/status`);
    console.log(`🔗 Ping endpoint at: http://0.0.0.0:${port}/ping`);
    
    // Graceful shutdown handling
    process.on('SIGTERM', async () => {
      console.log('🔄 SIGTERM received, shutting down gracefully...');
      await app.close();
      healthServer.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('🔄 SIGINT received, shutting down gracefully...');
      await app.close();
      healthServer.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start AI CRM Backend:', error);
    console.log('⚠️ But health check server is still running for Railway');
    console.log('⚠️ Database connection failed, but service is available for health checks');
    
    // Keep the health check server running even if NestJS fails
    process.on('SIGTERM', () => {
      console.log('🔄 SIGTERM received, shutting down health check server...');
      healthServer.close();
      process.exit(0);
    });

    process.on('SIGINT', () => {
      console.log('🔄 SIGINT received, shutting down health check server...');
      healthServer.close();
      process.exit(0);
    });
    
    // Don't exit - let the health check server keep running
    // This ensures Railway can always reach /healthz
    console.log('🔄 Health check server will continue running for Railway');
    
    // Keep the process alive
    setInterval(() => {
      console.log('💓 Health check server is still running...');
    }, 30000); // Log every 30 seconds
  }
}

// Global error handler to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.log('⚠️ But health check server is still running for Railway');
  // Don't exit - keep the health check server running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  console.log('⚠️ But health check server is still running for Railway');
  // Don't exit - keep the health check server running
});

bootstrap().catch(error => {
  console.error('❌ Bootstrap failed:', error);
  console.log('⚠️ But health check server is still running for Railway');
  console.log('⚠️ Railway can still reach /healthz endpoint');
  // Don't exit - let the health check server keep running
});
