import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  try {
    console.log('🚀 Starting AI CRM Backend...');
    
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
    const port = process.env.PORT ? Number(process.env.PORT) : 3001;
    await app.listen(port, '0.0.0.0');
    console.log(`✅ AI CRM Backend successfully started on port ${port}`);
    console.log(`🔗 Health check available at: http://0.0.0.0:${port}/health`);
  } catch (error) {
    console.error('❌ Failed to start AI CRM Backend:', error);
    process.exit(1);
  }
}

bootstrap().catch(error => {
  console.error('❌ Bootstrap failed:', error);
  process.exit(1);
});
