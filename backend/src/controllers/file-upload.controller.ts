import {
  Controller,
  Post,
  Get,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpStatus,
  HttpCode,
  ParseIntPipe,
  Req,
  Headers,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { FileProcessingService } from '../services/file-processing.service';
import { GoogleVisionService } from '../services/google-vision.service';
import { Request } from 'express';

// Configure multer for file storage (using memory storage to preserve file.buffer)
const multerConfig = {
  storage: memoryStorage(), // Use memory storage to keep file buffer available
  fileFilter: (req, file, cb) => {
    // Accept images, PDFs, and Excel files
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestException('Invalid file type. Only images, PDFs, and Excel files are allowed.'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
};

@Controller('api/files')
export class FileUploadController {
  constructor(
    private readonly fileProcessingService: FileProcessingService,
    private readonly googleVisionService: GoogleVisionService
  ) {}

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', multerConfig))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Req() request: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    // Upload request received
    console.log('🚀 File upload request received');
    console.log('📁 File details:', {
      originalname: file?.originalname,
      size: file?.size,
      mimetype: file?.mimetype
    });
    
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // File received
    console.log('✅ File received successfully');

    try {
      // Extract request information
      const requestInfo = {
        userAgent: userAgent || request.headers['user-agent'],
        ip: request.ip || request.connection.remoteAddress || request.socket.remoteAddress || 'unknown',
        sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };

      console.log('🔍 Request info:', requestInfo);

      // Starting file processing
      console.log('🚀 Starting file processing...');
      const result = await this.fileProcessingService.processFile(file, requestInfo);
      console.log('✅ File processing completed successfully');
      console.log('📊 Processing result:', {
        id: result.id,
        filename: result.filename,
        processingStatus: result.processingStatus
      });
      
      return {
        success: true,
        message: 'File processed successfully',
        data: {
          id: result.id,
          filename: result.filename,
          originalName: result.originalName,
          fileType: result.fileType,
          fileSize: result.fileSize,
          mimeType: result.mimeType,
          processingStatus: result.processingStatus,
          processingDurationMs: result.processingDurationMs,
          characterCount: result.characterCount,
          wordCount: result.wordCount,
          lineCount: result.lineCount,
          hasStructuredData: result.hasStructuredData,
          tableCount: result.tableCount,
          averageConfidence: result.averageConfidence,
          parsedContent: result.parsedContent ? JSON.parse(result.parsedContent) : null,
          extractedText: result.extractedText,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
        }
      };
    } catch (error) {
      throw new BadRequestException(`File processing failed: ${error.message}`);
    }
  }

  @Get()
  async getAllFiles() {
    try {
      const files = await this.fileProcessingService.getAllParsedFiles();
      
      return {
        success: true,
        data: files.map(file => {
          const structuredTableData = file.structuredTableData ? JSON.parse(file.structuredTableData) : null;
          return {
            id: file.id,
            filename: file.filename,
            originalName: file.originalName,
            fileType: file.fileType,
            fileSize: file.fileSize,
            mimeType: file.mimeType,
            processingStatus: file.processingStatus,
            processingDurationMs: file.processingDurationMs,
            characterCount: file.characterCount,
            wordCount: file.wordCount,
            lineCount: file.lineCount,
            hasStructuredData: file.hasStructuredData,
            tableCount: file.tableCount,
            averageConfidence: file.averageConfidence,
            parsedContent: file.parsedContent ? JSON.parse(file.parsedContent) : null,
            structuredTableData: structuredTableData,
            structuredDocumentData: structuredTableData?.structuredPayslipData || null, // Backward compatibility
            extractedText: file.extractedText,
            createdAt: file.createdAt,
            updatedAt: file.updatedAt,
          };
        })
      };
    } catch (error) {
      throw new BadRequestException(`Failed to retrieve files: ${error.message}`);
    }
  }

  @Get(':id')
  async getFileById(@Param('id', ParseIntPipe) id: number) {
    try {
      const file = await this.fileProcessingService.getParsedFileById(id);
      
      const structuredTableData = file.structuredTableData ? JSON.parse(file.structuredTableData) : null;
      
      return {
        success: true,
        data: {
          id: file.id,
          filename: file.filename,
          originalName: file.originalName,
          fileType: file.fileType,
          fileSize: file.fileSize,
          mimeType: file.mimeType,
          processingStatus: file.processingStatus,
          processingDurationMs: file.processingDurationMs,
          characterCount: file.characterCount,
          wordCount: file.wordCount,
          lineCount: file.lineCount,
          hasStructuredData: file.hasStructuredData,
          tableCount: file.tableCount,
          averageConfidence: file.averageConfidence,
          parsedContent: file.parsedContent ? JSON.parse(file.parsedContent) : null,
          structuredTableData: structuredTableData,
          structuredDocumentData: structuredTableData?.structuredPayslipData || null, // Backward compatibility
          extractedText: file.extractedText,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
        }
      };
    } catch (error) {
      throw new BadRequestException(`Failed to retrieve file: ${error.message}`);
    }
  }

  /**
   * 🧾 Advanced Invoice Extraction Endpoint
   * Specialized OCR + Table Detection for Invoice Processing
   */
  @Post('extract-invoice')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', multerConfig))
  async extractInvoice(
    @UploadedFile() file: Express.Multer.File,
    @Req() request: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    // Invoice extraction request received
    
    if (!file) {
      throw new BadRequestException('No invoice image uploaded');
    }

    // Validate file type (images only for invoice extraction)
    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
    if (!allowedImageTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only image files are supported for invoice extraction.');
    }

    // Processing invoice

    try {
      // Extract request information
      const requestInfo = {
        userAgent: userAgent || request.headers['user-agent'],
        ip: request.ip || request.connection.remoteAddress || request.socket.remoteAddress || 'unknown',
        sessionId: `invoice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };

      // Starting advanced invoice OCR processing
      
      // Use specialized invoice extraction method
      const extractionResult = await this.fileProcessingService.extractInvoiceData(file, requestInfo);
      
      // Invoice extraction completed
      
      // Parse the structured data
      const parsedContent = extractionResult.parsedContent ? JSON.parse(extractionResult.parsedContent) : null;
      
      // Return structured JSON in exact specification format
      return {
        success: true,
        message: 'Invoice extracted successfully',
        processingTime: extractionResult.processingDurationMs,
        
        // Main data array as per specification format
        data: parsedContent?.data || [],
        
        // Metadata for frontend
        metadata: {
          id: extractionResult.id,
          filename: extractionResult.filename,
          originalName: extractionResult.originalName,
          fileSize: extractionResult.fileSize,
          ocrEngine: extractionResult.ocrEngine || 'tesseract',
          confidence: extractionResult.averageConfidence,
          tableCount: extractionResult.tableCount,
          hasStructuredData: extractionResult.hasStructuredData,
          standardHeaders: parsedContent?.metadata?.standardHeaders || ['Product', 'Batch', 'HSN', 'Qty', 'MRP', 'Rate', 'Amount', 'SGST', 'CGST'],
          parsingMethod: parsedContent?.metadata?.parsingMethod || 'post-processing',
          characterCount: extractionResult.characterCount,
          wordCount: extractionResult.wordCount,
          lineCount: extractionResult.lineCount,
          createdAt: extractionResult.createdAt,
        },
        
        // Raw extracted text for debugging
        extractedText: extractionResult.extractedText,
        
        // Bounding box information (if available)
        boundingBoxes: extractionResult.boundingBoxes || null
      };

    } catch (error) {
      throw new BadRequestException(`Invoice extraction failed: ${error.message}`);
    }
  }

  /**
   * 🔍 Google Cloud Vision API Endpoint
   * Dedicated endpoint for Google Vision API text extraction
   */
  @Post('extract-with-vision')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', multerConfig))
  async extractWithGoogleVision(
    @UploadedFile() file: Express.Multer.File,
    @Req() request: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    // Google Vision API extraction requested

    // Validate file
    if (!file || !file.buffer) {
      throw new BadRequestException('No file uploaded or file buffer is empty');
    }

    // Check if Google Vision is available
    if (!this.googleVisionService.isGoogleVisionAvailable()) {
      throw new BadRequestException('Google Vision API is not available. Please configure credentials.');
    }

    try {
      const startTime = Date.now();
      
      // Extract request metadata
      const requestInfo = {
        userAgent: userAgent || request.get('user-agent') || 'Unknown',
        ip: request.ip || request.connection?.remoteAddress || 'Unknown',
        sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      // Processing with Google Vision API
      
      // Process with Google Vision API
      const visionResult = await this.googleVisionService.extractInvoiceDataWithVision(file.buffer);
      
      const totalProcessingTime = Date.now() - startTime;
      
      // Google Vision processing completed

      // Return structured response matching the specification
      return {
        success: visionResult.success,
        message: `Google Vision extraction ${visionResult.success ? 'completed' : 'failed'}`,
        processingTime: totalProcessingTime,
        
        // Main data array as per specification
        data: visionResult.data,
        
        // Enhanced metadata for Google Vision
        metadata: {
          ...visionResult.metadata,
          filename: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          totalProcessingTime: totalProcessingTime,
          requestInfo: requestInfo,
          visionFeatures: this.googleVisionService.getVisionCapabilities()
        },
        
        // Additional Google Vision specific data
        rawText: visionResult.rawText,
        confidence: visionResult.confidence,
        
        // Processing details
        processingDetails: {
          engine: 'google-vision',
          method: 'spatial-text-analysis',
          textBlockCount: visionResult.metadata.textBlockCount,
          hasStructuredData: visionResult.metadata.hasStructuredData
        }
      };

    } catch (error) {
      throw new BadRequestException(`Google Vision extraction failed: ${error.message}`);
    }
  }

  /**
   * 📊 Vision API Status and Capabilities
   */
  @Get('vision-status')
  async getVisionStatus() {
    // Vision API status requested
    
    const capabilities = this.googleVisionService.getVisionCapabilities();
    
    return {
      success: true,
      googleVision: {
        available: capabilities.available,
        configured: capabilities.authentication.serviceAccount || capabilities.authentication.apiKey,
        features: capabilities.features,
        authentication: {
          method: capabilities.authentication.serviceAccount ? 'Service Account' :
                  capabilities.authentication.apiKey ? 'API Key' : 'Not Configured',
          projectId: capabilities.authentication.projectId ? 'Configured' : 'Not Set'
        }
      },
      endpoints: {
        'extract-with-vision': 'POST /api/files/extract-with-vision',
        'vision-status': 'GET /api/files/vision-status',
        'extract-invoice': 'POST /api/files/extract-invoice (with fallback)'
      }
    };
  }
}
