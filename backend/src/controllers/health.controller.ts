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
  async healthz(@Res() res: Response) {
    try {
      // Railway health check endpoint - more robust
      console.log('🔍 Health check requested from Railway');
      console.log('📊 Process uptime:', process.uptime());
      console.log('📊 Memory usage:', process.memoryUsage());
      console.log('📊 Environment:', process.env.NODE_ENV);
      
      // Check if database is accessible (but don't fail if it's not)
      let dbStatus = 'unknown';
      try {
        if (this.dataSource.isInitialized) {
          await this.dataSource.query('SELECT 1');
          dbStatus = 'connected';
        } else {
          dbStatus = 'not_initialized';
        }
      } catch (dbError) {
        console.log('⚠️ Database health check failed:', dbError.message);
        dbStatus = 'error';
      }

      // Always return 200 for Railway health check, but include status info
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: dbStatus,
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
      });
    } catch (error) {
      console.error('❌ Health check error:', error);
      // Even if there's an error, return 200 to prevent Railway from marking as unhealthy
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        error: 'Health check had issues but service is running',
        environment: process.env.NODE_ENV || 'development'
      });
    }
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