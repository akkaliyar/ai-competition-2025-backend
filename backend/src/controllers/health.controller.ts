import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';

@Controller()
export class HealthController {
  @Get('health')
  @HttpCode(HttpStatus.OK)
  health(@Res() res: Response) {
    // Simple health check that always returns 200 (no database dependency)
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'ai-crm-backend',
      environment: process.env.NODE_ENV || 'development'
    });
  }

  @Get('healthz')
  @HttpCode(HttpStatus.OK)
  healthz(@Res() res: Response) {
    // Railway health check endpoint (simplest possible)
    console.log('🔍 Health check requested from Railway');
    console.log('📊 Process uptime:', process.uptime());
    console.log('📊 Memory usage:', process.memoryUsage());
    console.log('📊 Environment:', process.env.NODE_ENV);
    res.status(200).send('OK');
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  status(@Res() res: Response) {
    // Status endpoint
    res.status(200).json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      pid: process.pid,
      memory: process.memoryUsage()
    });
  }

  @Get('ping')
  @HttpCode(HttpStatus.OK)
  ping(@Res() res: Response) {
    // Simple ping endpoint
    res.status(200).send('pong');
  }

  @Get()
  root() {
    console.log('🏠 Root endpoint accessed');
    return {
      message: 'AI CRM Backend API',
      status: 'running',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      endpoints: ['/healthz', '/health', '/status', '/ping'],
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    };
  }
}