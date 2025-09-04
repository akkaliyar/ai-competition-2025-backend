import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { DataSource } from 'typeorm';

@Controller()
export class HealthController {
  constructor(private dataSource: DataSource) {}

  @Get('healthz')
  getHealthz(): string {
    return 'OK';
  }

  @Get('health')
  async getHealth(): Promise<any> {
    try {
      // Test database connection with a simple query
      const result = await this.dataSource.query('SELECT 1 as test');
      
      return {
        status: 'healthy',
        database: 'connected',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
      };
    } catch (dbError) {
      return {
        status: 'degraded',
        database: 'disconnected',
        error: dbError.message,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
      };
    }
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  async status(@Res() res: Response) {
    try {
      const isConnected = this.dataSource.isInitialized;
      
      if (isConnected) {
        // Test database tables
        try {
          const tables = await this.dataSource.query('SHOW TABLES');
          const tableNames = tables.map(t => Object.values(t)[0]);
          
          res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: 'connected_and_working',
            tables: tableNames,
            endpoints: {
              health: '/health',
              healthz: '/healthz',
              status: '/status',
              ping: '/ping'
            }
          });
        } catch (dbError) {
          res.status(200).json({
            status: 'degraded',
            timestamp: new Date().toISOString(),
            database: 'connected_but_tables_check_failed',
            error: dbError.message,
            endpoints: {
              health: '/health',
              healthz: '/healthz',
              status: '/status',
              ping: '/ping'
            }
          });
        }
      } else {
        res.status(200).json({
          status: 'degraded',
          timestamp: new Date().toISOString(),
          database: 'disconnected',
          endpoints: {
            health: '/health',
            healthz: '/healthz',
            status: '/status',
            ping: '/ping'
          }
        });
      }
    } catch (error) {
      console.error('Status check error:', error);
      res.status(200).json({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        database: 'unknown',
        error: error.message,
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