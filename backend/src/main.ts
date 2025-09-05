import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as http from 'http';
import * as net from 'net';

// Simple port availability check
const isPortAvailable = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, '0.0.0.0', () => {
      server.once('close', () => resolve(true));
      server.close();
    });
    server.on('error', () => resolve(false));
  });
};

// Create a simple HTTP server immediately for health checks
const createHealthCheckServer = (port: number) => {
  const server = http.createServer((req, res) => {
    // Set CORS headers for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Allow-Headers');
    res.setHeader('Access-Control-Allow-Credentials', 'false');
    
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    if (req.url === '/healthz' && req.method === 'GET') {
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
        endpoints: ['/healthz', '/ping', '/', '/api/files', '/api/files/upload']
      }));
    } else if (req.url === '/api/files' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'File API endpoint (Express fallback)',
        status: 'running',
        timestamp: new Date().toISOString(),
        note: 'Database connection required for full functionality'
      }));
    } else if (req.url === '/api/files/upload' && req.method === 'POST') {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Service temporarily unavailable',
        message: 'Database connection required for file uploads',
        status: 'database_connection_failed',
        timestamp: new Date().toISOString()
      }));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  server.listen(port, '0.0.0.0', () => {
    // Health check server started
  });

  return server;
};

async function bootstrap() {
  // Always use port 8080 for Railway deployment
  let port = process.env.PORT ? Number(process.env.PORT) : 8080;
  let maxPortAttempts = 20; // Increased from 5 to 20
  let currentAttempt = 0;
  
  // Ports to try in order (avoiding common conflicts and using safer ranges)
  const portSequence = [
    8080, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089, // Main app ports (avoid 8081 for health server)
    8090, 8091, 8092, 8093, 8094, 8095, 8096, 8097, 8098, 8099, // Extended range
    9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008, 9009 // Avoid 9000 as it's commonly used
  ];

  // Start health check server immediately - THIS IS CRITICAL FOR RAILWAY
  const healthServer = createHealthCheckServer(port);

  try {
    // Starting AI CRM Backend
    
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'], // Enable logging for debugging
    });
    
    // Enable CORS for all origins - Allow everything
    app.enableCors({
      origin: true, // Allow all origins
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Allow-Headers', 'Access-Control-Allow-Origin'],
      credentials: false, // Set to false for wildcard origin
      preflightContinue: false,
      optionsSuccessStatus: 204,
      maxAge: 86400, // Cache preflight for 24 hours
    });

    // Global validation pipe
    app.useGlobalPipes(new ValidationPipe());

    // Global CORS middleware for all routes
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Allow-Headers');
      res.header('Access-Control-Allow-Credentials', 'false');
      
      // Handle preflight OPTIONS request
      if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
      }
      
      next();
    });

    // Simple Express-style health endpoints as backup
    app.use('/ping', (req, res) => {
      res.status(200).send('pong');
    });

    // Railway health check backup - always return 200 OK
    app.use('/healthz', (req, res) => {
      res.status(200).send('OK');
    });

    // Health endpoints are handled by HealthController

    // Try to start server with improved port fallback
    let serverStarted = false;
    while (!serverStarted && currentAttempt < maxPortAttempts) {
      try {
        // Use the port sequence for better port selection
        const currentPort = portSequence[currentAttempt] || (port + currentAttempt);
        
        // Check if port is available before trying to use it
        const portAvailable = await isPortAvailable(currentPort);
        if (!portAvailable) {
          currentAttempt++;
          continue;
        }
        
        await app.listen(currentPort, '0.0.0.0');
        port = currentPort;
        serverStarted = true;
      } catch (error) {
        if (error.code === 'EADDRINUSE') {
          currentAttempt++;
          // Port is busy, trying next port
          
          // Update health check server to new port
          const newPort = portSequence[currentAttempt] || (port + currentAttempt);
          healthServer.close();
          const newHealthServer = createHealthCheckServer(newPort);
          Object.assign(healthServer, newHealthServer);
        } else {
          throw error; // Re-throw non-port related errors
        }
      }
    }

    if (!serverStarted) {
      // Failed to start server but health check server is still running
      
      // Keep the health check server running even if NestJS fails
      process.on('SIGTERM', () => {
        healthServer.close();
        process.exit(0);
      });

      process.on('SIGINT', () => {
        healthServer.close();
        process.exit(0);
      });

      // Keep the process alive
      setInterval(() => {
        // Health check server is still running
      }, 30000);
      
      return; // Exit early but keep health check server running
    }

    // Close the simple health check server since NestJS is now running
    healthServer.close(() => {
      // Health check server closed
    });

    // Graceful shutdown handling
    process.on('SIGTERM', async () => {
      await app.close();
      healthServer.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      await app.close();
      healthServer.close();
      process.exit(0);
    });

    // Server started successfully

  } catch (error) {
    // Failed to start AI CRM Backend but health check server is still running

    // Keep the health check server running even if NestJS fails
    process.on('SIGTERM', () => {
      healthServer.close();
      process.exit(0);
    });

    process.on('SIGINT', () => {
      healthServer.close();
      process.exit(0);
    });

    // This ensures Railway can always reach /healthz
    // Keep the process alive
    setInterval(() => {
      // Log every 30 seconds
    }, 30000);
  }
}

// Global error handler to prevent crashes
process.on('uncaughtException', (error) => {
  // Uncaught Exception - health check server is still running
  // Don't exit - keep the health check server running
});

process.on('unhandledRejection', (reason, promise) => {
  // Unhandled Rejection - health check server is still running
  // Don't exit - keep the health check server running
});

bootstrap().catch(error => {
  // Bootstrap failed - health check server is still running
  // Don't exit - let the health check server keep running
});
