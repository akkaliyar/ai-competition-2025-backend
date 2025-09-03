import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { FileUploadController } from './controllers/file-upload.controller';
import { HealthController } from './controllers/health.controller';
import { FileProcessingService } from './services/file-processing.service';
import { DatabaseSetupService } from './services/database-setup.service';
import { GoogleVisionService } from './services/google-vision.service';
import { ImagePreprocessingService } from './services/image-preprocessing.service';
import { ParsedFile } from './entities/parsed-file.entity';
import { OcrResult } from './entities/ocr-result.entity';
import { FileMetadata } from './entities/file-metadata.entity';
import { TableExtraction } from './entities/table-extraction.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        // If DATABASE_URL is provided (Railway style), use it
        if (process.env.DATABASE_URL) {
          return {
            type: 'mysql',
            url: process.env.DATABASE_URL,
            entities: [ParsedFile, OcrResult, FileMetadata, TableExtraction],
            synchronize: false,
            logging: process.env.NODE_ENV === 'development',
            charset: 'utf8mb4',
            timezone: '+00:00',
            connectTimeout: 10000,
            acquireTimeout: 10000,
            timeout: 10000,
            retryAttempts: 2,
            retryDelay: 3000,
          };
        }
        
        // Fallback to individual environment variables
        return {
          type: 'mysql',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT) || 3306,
          username: process.env.DB_USERNAME || 'root',
          password: process.env.DB_PASSWORD || '',
          database: process.env.DB_NAME || 'ai_crm',
          entities: [ParsedFile, OcrResult, FileMetadata, TableExtraction],
          synchronize: false,
          logging: process.env.NODE_ENV === 'development',
          charset: 'utf8mb4',
          timezone: '+00:00',
          connectTimeout: 10000,
          acquireTimeout: 10000,
          timeout: 10000,
          retryAttempts: 2,
          retryDelay: 3000,
        };
      },
    }),
    TypeOrmModule.forFeature([ParsedFile, OcrResult, FileMetadata, TableExtraction]),
  ],
  controllers: [FileUploadController, HealthController],
  providers: [FileProcessingService, DatabaseSetupService, GoogleVisionService, ImagePreprocessingService],
})
export class AppModule {}
