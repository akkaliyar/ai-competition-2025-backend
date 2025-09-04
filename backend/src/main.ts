import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  try {
    console.log('🚀 Starting AI CRM Backend...');
    console.log('📊 Environment:', process.env.NODE_ENV || 'development');
    console.log('📊 Port:', process.env.PORT || 8080);
    
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

    // Simple Express-style health endpoint as backup
    app.use('/ping', (req, res) => {
      res.status(200).send('pong');
    });

    // Health endpoints are handled by HealthController

    // Start server on configured port
    const port = process.env.PORT ? Number(process.env.PORT) : 8080;
    await app.listen(port, '0.0.0.0');
    
    console.log(`✅ AI CRM Backend successfully started on port ${port}`);
    console.log(`🔗 Health check available at: http://0.0.0.0:${port}/health`);
    console.log(`🔗 Railway health check at: http://0.0.0.0:${port}/healthz`);
    console.log(`🔗 Status endpoint at: http://0.0.0.0:${port}/status`);
    console.log(`🔗 Ping endpoint at: http://0.0.0.0:${port}/ping`);
    
    // Graceful shutdown handling
    process.on('SIGTERM', async () => {
      console.log('🔄 SIGTERM received, shutting down gracefully...');
      await app.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('🔄 SIGINT received, shutting down gracefully...');
      await app.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start AI CRM Backend:', error);
    
    // If it's a database connection error, log it but don't exit
    if (error.message && error.message.includes('database')) {
      console.log('⚠️ Database connection failed, but continuing to start...');
      console.log('⚠️ Health checks will show database as unavailable');
      
      // Try to start the app anyway for health checks
      try {
        const app = await NestFactory.create(AppModule, {
          logger: ['error', 'warn', 'log'],
        });
        
        app.enableCors({
          origin: true,
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
          allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Allow-Headers'],
          credentials: true,
          preflightContinue: false,
          optionsSuccessStatus: 204,
        });

        app.useGlobalPipes(new ValidationPipe());
        app.use('/ping', (req, res) => {
          res.status(200).send('pong');
        });

        const port = process.env.PORT ? Number(process.env.PORT) : 8080;
        await app.listen(port, '0.0.0.0');
        
        console.log(`✅ AI CRM Backend started on port ${port} (without database)`);
        console.log(`⚠️ Database connection failed, but service is running for health checks`);
        
      } catch (retryError) {
        console.error('❌ Failed to start even without database:', retryError);
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }
}

bootstrap().catch(error => {
  console.error('❌ Bootstrap failed:', error);
  process.exit(1);
});
