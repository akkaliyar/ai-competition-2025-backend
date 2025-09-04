import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { FileUploadController } from './controllers/file-upload.controller';
import { HealthController } from './controllers/health.controller';
import { BillDataController } from './controllers/bill-data.controller';
import { FileProcessingService } from './services/file-processing.service';
import { DatabaseSetupService } from './services/database-setup.service';
import { GoogleVisionService } from './services/google-vision.service';
import { ImagePreprocessingService } from './services/image-preprocessing.service';
import { BillExtractionService } from './services/bill-extraction.service';
import { ParsedFile } from './entities/parsed-file.entity';
import { OcrResult } from './entities/ocr-result.entity';
import { FileMetadata } from './entities/file-metadata.entity';
import { TableExtraction } from './entities/table-extraction.entity';
import { BillData } from './entities/bill-data.entity';
import { DataSource } from 'typeorm';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => {

        
        // Base configuration with only valid MySQL2 options
        const config = {
          type: 'mysql' as const,
          entities: [ParsedFile, OcrResult, FileMetadata, TableExtraction, BillData],
          synchronize: true, // Enable table creation
          logging: true, // Enable logging to see what's happening
          charset: 'utf8mb4',
          timezone: '+00:00',
          // Only use valid MySQL2 connection options
          connectTimeout: 30000,
          timeout: 30000,
          retryAttempts: 5,
          retryDelay: 3000,
          maxQueryExecutionTime: 30000,
          // Additional options for better connection
          keepConnectionAlive: true,
          autoLoadEntities: true,
        };

        // Priority 1: Use DATABASE_URL if provided (Railway style)
        if (process.env.DATABASE_URL) {
          return {
            ...config,
            url: process.env.DATABASE_URL,
          };
        }
        
        // Priority 2: Use MYSQL_URL if provided (Railway MySQL)
        if (process.env.MYSQL_URL) {
          return {
            ...config,
            url: process.env.MYSQL_URL,
          };
        }
        
        // Priority 3: Use Railway MySQL environment variables
        if (process.env.MYSQLHOST && process.env.MYSQLUSER && process.env.MYSQLDATABASE) {
          return {
            ...config,
            host: process.env.MYSQLHOST,
            port: parseInt(process.env.MYSQLPORT) || 3306,
            username: process.env.MYSQLUSER,
            password: process.env.MYSQLPASSWORD || process.env.MYSQL_ROOT_PASSWORD || '',
            database: process.env.MYSQLDATABASE,
          };
        }
        
        // Priority 4: Use MYSQL_PUBLIC_URL if provided
        if (process.env.MYSQL_PUBLIC_URL) {
          return {
            ...config,
            url: process.env.MYSQL_PUBLIC_URL,
          };
        }
        
        // Priority 5: Use Railway TCP Proxy (for external connections)
        if (process.env.RAILWAY_TCP_PROXY_DOMAIN && process.env.RAILWAY_TCP_PROXY_PORT) {
          return {
            ...config,
            host: process.env.RAILWAY_TCP_PROXY_DOMAIN,
            port: parseInt(process.env.RAILWAY_TCP_PROXY_PORT),
            username: process.env.MYSQLUSER || 'root',
            password: process.env.MYSQLPASSWORD || process.env.MYSQL_ROOT_PASSWORD || '',
            database: process.env.MYSQLDATABASE || 'railway',
          };
        }
        
        // Fallback to individual environment variables (local development)
        return {
          ...config,
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT) || 3306,
          username: process.env.DB_USERNAME || 'root',
          password: process.env.DB_PASSWORD || '',
          database: process.env.DB_NAME || 'ai_crm',
        };
      },
    }),
    TypeOrmModule.forFeature([ParsedFile, OcrResult, FileMetadata, TableExtraction, BillData]),
  ],
  controllers: [FileUploadController, HealthController, BillDataController],
  providers: [FileProcessingService, DatabaseSetupService, GoogleVisionService, ImagePreprocessingService, BillExtractionService],
})
export class AppModule implements OnModuleInit {
  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    try {
      // Wait a bit for database connection to be ready
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      if (this.dataSource.isInitialized) {
        // Force database synchronization
        await this.dataSource.synchronize(true);
        
        // Verify tables exist
        const tables = await this.dataSource.query('SHOW TABLES');
        const tableNames = tables.map(t => Object.values(t)[0]);
        
        // Check if our required tables exist
        const requiredTables = ['parsed_files', 'file_metadata', 'ocr_results', 'table_extractions', 'bill_data'];
        const missingTables = requiredTables.filter(table => !tableNames.includes(table));
        
        if (missingTables.length > 0) {
          // Database synchronization may have failed
        } else {
          // All required tables are now available!
        }
        
      } else {
        // Database connection not ready
      }
    } catch (error) {
      // App will continue but database operations may fail
    }
  }
}
