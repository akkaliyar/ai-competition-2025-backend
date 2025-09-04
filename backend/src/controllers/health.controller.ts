import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

@Controller()
export class HealthController {
  constructor(
    @InjectDataSource() private dataSource: DataSource
  ) {}

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
    // Railway health check endpoint - simplest possible response
    console.log('🔍 Health check requested from Railway');
    
    // Always return 200 OK with minimal response
    res.status(200).send('OK');
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  async status(@Res() res: Response) {
    try {
      // Status endpoint with database health
      let dbStatus = 'unknown';
      try {
        if (this.dataSource.isInitialized) {
          await this.dataSource.query('SELECT 1');
          dbStatus = 'connected';
        } else {
          dbStatus = 'not_initialized';
        }
      } catch (dbError) {
        dbStatus = 'error';
      }

      res.status(200).json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        pid: process.pid,
        memory: process.memoryUsage(),
        database: dbStatus,
        uptime: process.uptime()
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
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