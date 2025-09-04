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
        console.log('RAILWAY_TCP_PROXY_DOMAIN:', process.env.RAILWAY_TCP_PROXY_DOMAIN);
        
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
          console.log('📡 Using DATABASE_URL for connection');
          console.log('📡 DATABASE_URL value:', process.env.DATABASE_URL.replace(/:[^:@]*@/, ':****@')); // Hide password
          return {
            ...config,
            url: process.env.DATABASE_URL,
          };
        }
        
        // Priority 2: Use MYSQL_URL if provided (Railway MySQL)
        if (process.env.MYSQL_URL) {
          console.log('📡 Using MYSQL_URL for connection');
          console.log('📡 MYSQL_URL value:', process.env.MYSQL_URL.replace(/:[^:@]*@/, ':****@')); // Hide password
          return {
            ...config,
            url: process.env.MYSQL_URL,
          };
        }
        
        // Priority 3: Use Railway MySQL environment variables
        if (process.env.MYSQLHOST && process.env.MYSQLUSER && process.env.MYSQLDATABASE) {
          console.log('📡 Using Railway MySQL variables for connection');
          console.log('📡 Host:', process.env.MYSQLHOST);
          console.log('📡 Port:', process.env.MYSQLPORT || 3306);
          console.log('📡 User:', process.env.MYSQLUSER);
          console.log('📡 Database:', process.env.MYSQLDATABASE);
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
          console.log('📡 MYSQL_PUBLIC_URL value:', process.env.MYSQL_PUBLIC_URL.replace(/:[^:@]*@/, ':****@')); // Hide password
          return {
            ...config,
            url: process.env.MYSQL_PUBLIC_URL,
          };
        }
        
        // Priority 5: Use Railway TCP Proxy (for external connections)
        if (process.env.RAILWAY_TCP_PROXY_DOMAIN && process.env.RAILWAY_TCP_PROXY_PORT) {
          console.log('📡 Using Railway TCP Proxy for connection');
          console.log('📡 Proxy Domain:', process.env.RAILWAY_TCP_PROXY_DOMAIN);
          console.log('📡 Proxy Port:', process.env.RAILWAY_TCP_PROXY_PORT);
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
        console.log('📡 Using individual DB variables for connection (local dev)');
        console.log('📡 Host:', process.env.DB_HOST || 'localhost');
        console.log('📡 Port:', process.env.DB_PORT || 3306);
        console.log('📡 User:', process.env.DB_USERNAME || 'root');
        console.log('📡 Database:', process.env.DB_NAME || 'ai_crm');
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
