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
        // Test actual database query
        try {
          const result = await this.dataSource.query('SELECT 1 as test, NOW() as timestamp');
          console.log('✅ Database query test successful:', result);
          
          res.status(200).json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            database: 'connected_and_working',
            message: 'Service is healthy and database is responding',
            dbTest: result[0]
          });
        } catch (dbError) {
          console.error('❌ Database query failed:', dbError);
          res.status(503).json({
            status: 'degraded',
            timestamp: new Date().toISOString(),
            database: 'connected_but_query_failed',
            message: 'Service is running but database queries are failing',
            error: dbError.message
          });
        }
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
        message: 'Service is running but database check failed',
        error: error.message
      });
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