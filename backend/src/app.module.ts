import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        console.log('🔧 Configuring database connection...');
        console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
        console.log('MYSQL_URL exists:', !!process.env.MYSQL_URL);
        console.log('MYSQLHOST:', process.env.MYSQLHOST);
        console.log('MYSQLUSER:', process.env.MYSQLUSER);
        console.log('MYSQLDATABASE:', process.env.MYSQLDATABASE);
        console.log('RAILWAY_PRIVATE_DOMAIN:', process.env.RAILWAY_PRIVATE_DOMAIN);
        
        const config = {
          type: 'mysql' as const,
          entities: [ParsedFile, OcrResult, FileMetadata, TableExtraction, BillData],
          synchronize: false,
          logging: false, // Disable logging to reduce noise
          charset: 'utf8mb4',
          timezone: '+00:00',
          connectTimeout: 30000,    // Increased timeout for Railway
          acquireTimeout: 30000,    // Increased timeout for Railway
          timeout: 30000,           // Increased timeout for Railway
          retryAttempts: 5,         // Increased retries for Railway
          retryDelay: 3000,         // Increased delay for Railway
          maxQueryExecutionTime: 30000,
          // Remove invalid MySQL2 options
          extra: {
            connectionLimit: 10,
            acquireTimeout: 30000,
            timeout: 30000,
            reconnect: true,
          }
        };

        // Priority 1: Use DATABASE_URL if provided (Railway style)
        if (process.env.DATABASE_URL) {
          console.log('📡 Using DATABASE_URL for connection');
          return {
            ...config,
            url: process.env.DATABASE_URL,
          };
        }
        
        // Priority 2: Use MYSQL_URL if provided (Railway MySQL)
        if (process.env.MYSQL_URL) {
          console.log('📡 Using MYSQL_URL for connection');
          return {
            ...config,
            url: process.env.MYSQL_URL,
          };
        }
        
        // Priority 3: Use Railway MySQL environment variables
        if (process.env.MYSQLHOST && process.env.MYSQLUSER && process.env.MYSQLDATABASE) {
          console.log('📡 Using Railway MySQL variables for connection');
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
          console.log('📡 Using MYSQL_PUBLIC_URL for connection');
          return {
            ...config,
            url: process.env.MYSQL_PUBLIC_URL,
          };
        }
        
        // Fallback to individual environment variables (local development)
        console.log('📡 Using individual DB variables for connection (local dev)');
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
export class AppModule {}
