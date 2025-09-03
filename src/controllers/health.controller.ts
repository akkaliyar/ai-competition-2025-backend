import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';

@Controller()
export class HealthController {
  @Get('health')
  @HttpCode(HttpStatus.OK)
  health(@Res() res: Response) {
    // Simple health check that always returns 200
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'ai-crm-backend'
    });
  }

  @Get('healthz')
  @HttpCode(HttpStatus.OK)
  healthz(@Res() res: Response) {
    // Alternative health endpoint (Kubernetes style)
    res.status(200).send('OK');
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  status(@Res() res: Response) {
    // Status endpoint
    res.status(200).json({ status: 'healthy' });
  }

  @Get()
  root() {
    return {
      message: 'AI CRM Backend API',
      status: 'running',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  }
}