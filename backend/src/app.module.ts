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
        console.log('DB_HOST:', process.env.DB_HOST);
        console.log('RAILWAY_PRIVATE_DOMAIN:', process.env.RAILWAY_PRIVATE_DOMAIN);
        console.log('MYSQL_ROOT_PASSWORD exists:', !!process.env.MYSQL_ROOT_PASSWORD);
        
        // If DATABASE_URL is provided (Railway style), use it
        if (process.env.DATABASE_URL) {
          console.log('📡 Using DATABASE_URL for connection');
          return {
            type: 'mysql',
            url: process.env.DATABASE_URL,
            entities: [ParsedFile, OcrResult, FileMetadata, TableExtraction, BillData],
            synchronize: false,
            logging: false, // Disable logging to reduce noise
            charset: 'utf8mb4',
            timezone: '+00:00',
            connectTimeout: 5000,    // Reduced timeout
            acquireTimeout: 5000,    // Reduced timeout
            timeout: 5000,           // Reduced timeout
            retryAttempts: 1,        // Reduced retries
            retryDelay: 1000,        // Reduced delay
            maxQueryExecutionTime: 5000,
          };
        }
        
        // Fallback to individual environment variables
        console.log('📡 Using individual DB variables for connection');
        return {
          type: 'mysql',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT) || 3306,
          username: process.env.DB_USERNAME || 'root',
          password: process.env.DB_PASSWORD || '',
          database: process.env.DB_NAME || 'ai_crm',
          entities: [ParsedFile, OcrResult, FileMetadata, TableExtraction, BillData],
          synchronize: false,
          logging: false,
          charset: 'utf8mb4',
          timezone: '+00:00',
          connectTimeout: 5000,
          acquireTimeout: 5000,
          timeout: 5000,
          retryAttempts: 1,
          retryDelay: 1000,
          maxQueryExecutionTime: 5000,
        };
      },
    }),
    TypeOrmModule.forFeature([ParsedFile, OcrResult, FileMetadata, TableExtraction, BillData]),
  ],
  controllers: [FileUploadController, HealthController, BillDataController],
  providers: [FileProcessingService, DatabaseSetupService, GoogleVisionService, ImagePreprocessingService, BillExtractionService],
})
export class AppModule {}
