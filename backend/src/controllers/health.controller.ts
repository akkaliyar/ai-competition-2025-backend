import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { DataSource } from 'typeorm';

@Controller()
export class HealthController {
  constructor(private dataSource: DataSource) {}

  @Get('healthz')
  @HttpCode(HttpStatus.OK)
  healthz(@Res() res: Response) {
    // Railway health check - ALWAYS return 200 OK
    console.log('🔍 Railway health check (Controller) - SUCCESS');
    res.status(200).send('OK');
  }

  @Get('health')
  @HttpCode(HttpStatus.OK)
  async health(@Res() res: Response) {
    try {
      // Check database connection
      const isConnected = this.dataSource.isInitialized;
      
      if (isConnected) {
        res.status(200).json({
          status: 'ok',
          timestamp: new Date().toISOString(),
          database: 'connected',
          message: 'Service is healthy'
        });
      } else {
        res.status(503).json({
          status: 'degraded',
          timestamp: new Date().toISOString(),
          database: 'disconnected',
          message: 'Service is running but database is not connected'
        });
      }
    } catch (error) {
      console.error('Health check error:', error);
      res.status(503).json({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        database: 'error',
        message: 'Service is running but database check failed'
      });
    }
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  async status(@Res() res: Response) {
    try {
      const isConnected = this.dataSource.isInitialized;
      
      res.status(200).json({
        status: isConnected ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        database: isConnected ? 'connected' : 'disconnected',
        endpoints: {
          health: '/health',
          healthz: '/healthz',
          status: '/status',
          ping: '/ping'
        }
      });
    } catch (error) {
      console.error('Status check error:', error);
      res.status(200).json({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        database: 'unknown',
        endpoints: {
          health: '/health',
          healthz: '/healthz',
          status: '/status',
          ping: '/ping'
        }
      });
    }
  }

  @Get('ping')
  @HttpCode(HttpStatus.OK)
  ping(@Res() res: Response) {
    res.status(200).send('pong');
  }
}