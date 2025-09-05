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
import { MedicalBillExtractionService } from '../services/medical-bill-extraction.service';
import { MedicalBillService } from '../services/medical-bill.service';
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
    private readonly googleVisionService: GoogleVisionService,
    private readonly medicalBillExtractionService: MedicalBillExtractionService,
    private readonly medicalBillService: MedicalBillService,
  ) {}

  /**
   * Clean up failed upload by removing the parsed file record
   */
  private async cleanupFailedUpload(parsedFileId: number): Promise<void> {
    try {
      await this.fileProcessingService.deleteParsedFile(parsedFileId);
    } catch (error) {
      // Failed to cleanup parsed file
    }
  }

  /**
   * Clean up orphaned records endpoint
   */
  @Post('cleanup')
  async cleanupOrphanedRecords() {
    try {
      await this.fileProcessingService.cleanupOrphanedRecords();
      return {
        status: true,
        message: "Orphaned records cleanup completed successfully"
      };
    } catch (error) {
      throw new BadRequestException(`Cleanup failed: ${error.message}`);
    }
  }

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', multerConfig))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Req() request: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    let result: any = null;
    
    try {
      if (!file) {
        throw new BadRequestException('No file uploaded');
      }
      // Extract request information
      const requestInfo = {
        userAgent: userAgent || request.headers['user-agent'],
        ip: request.ip || request.connection.remoteAddress || request.socket.remoteAddress || 'unknown',
        sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };

  

      // Starting file processing
      result = await this.fileProcessingService.processFile(file, requestInfo);
     
      // Check if this is a medical bill and extract structured data
      const isMedicalBill = result.extractedText ? this.medicalBillExtractionService.isMedicalBill(result.extractedText) : false;
      
      if (result.extractedText && isMedicalBill) {
        try {
          const medicalBillData = this.medicalBillExtractionService.extractMedicalBillData(result.extractedText);
          const validation = this.medicalBillExtractionService.validateMedicalBill(medicalBillData);
          
          if (validation.isValid) {
            // Calculate confidence score
            const confidence = this.medicalBillExtractionService.calculateConfidence(medicalBillData);
            
            // Save medical bill data to database with file information
            await this.medicalBillService.saveMedicalBill(result.id, medicalBillData, confidence, {
              fileName: result.originalName,
              fileSize: result.fileSize,
              processedStatus: result.processingStatus
            });
            
            // Return the medical bill data in the requested format with message and data
            return {
              status: true,
              message: "Medical bill data extracted and saved successfully",
              data: {
                id: result.id,
                fileName: result.originalName,
                fileSize: result.fileSize,
                processedStatus: result.processingStatus,
                processedDate: new Date().toISOString(),
                ...medicalBillData
              }
            };
          } else {
            // Clean up the parsed file record if medical bill validation fails
            await this.cleanupFailedUpload(result.id);
            throw new BadRequestException(`Medical bill validation failed: ${validation.errors.join(', ')}`);
          }
        } catch (error) {
          // Clean up the parsed file record if medical bill extraction fails
          if (result && result.id) {
            await this.cleanupFailedUpload(result.id);
          }
          throw new BadRequestException(`Medical bill extraction failed: ${error.message}`);
        }
      }

      // If not a medical bill, clean up and return error
      if (result && result.id) {
        await this.cleanupFailedUpload(result.id);
      }
      // Provide more detailed error information for debugging
      const debugInfo = result.extractedText ? {
        textLength: result.extractedText.length,
        textPreview: result.extractedText.substring(0, 200) + '...',
        isMedicalBill: isMedicalBill
      } : { textLength: 0, textPreview: 'No text extracted', isMedicalBill: false };
      
      throw new BadRequestException(`Uploaded file does not appear to be a medical bill. Debug info: ${JSON.stringify(debugInfo)}`);
    } catch (error) {
      // Clean up any partially created records
      if (result && result.id) {
        await this.cleanupFailedUpload(result.id);
      }
      throw new BadRequestException(`File processing failed: ${error.message}`);
    }
  }

  @Get()
  async getAllFiles() {
    try {
      const files = await this.fileProcessingService.getAllParsedFiles();
      
      return {
        status: true,
        message: "Files retrieved successfully",
        data: await Promise.all(files.map(async (file) => {
          // Check if medical bill data exists in database
          const medicalBill = await this.medicalBillService.getMedicalBillByParsedFileId(file.id);
          if (medicalBill) {
            // Return the saved medical bill data directly
            return this.medicalBillService.convertToDto(medicalBill);
          }
          
          // If not in database, check if this is a medical bill and extract structured data
          if (file.extractedText && this.medicalBillExtractionService.isMedicalBill(file.extractedText)) {
            try {
              const medicalBillData = this.medicalBillExtractionService.extractMedicalBillData(file.extractedText);
              const validation = this.medicalBillExtractionService.validateMedicalBill(medicalBillData);
              
              if (validation.isValid) {
                // Calculate confidence and save to database
                const confidence = this.medicalBillExtractionService.calculateConfidence(medicalBillData);
                await this.medicalBillService.saveMedicalBill(file.id, medicalBillData, confidence, {
                  fileName: file.originalName,
                  fileSize: file.fileSize,
                  processedStatus: file.processingStatus
                });
                
                // Return the medical bill data directly with ID
                return {
                  id: file.id,
                  fileName: file.originalName,
                  fileSize: file.fileSize,
                  processedStatus: file.processingStatus,
                  processedDate: new Date().toISOString(),
                  ...medicalBillData
                };
              } else {
                // If validation fails, still return the extracted data with ID for debugging
                return {
                  id: file.id,
                  fileName: file.originalName,
                  fileSize: file.fileSize,
                  processedStatus: file.processingStatus,
                  processedDate: new Date().toISOString(),
                  ...medicalBillData
                };
              }
            } catch (error) {
              // If medical bill extraction fails, continue with normal processing
            }
          }
          
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
        }))
      };
    } catch (error) {
      throw new BadRequestException(`Failed to retrieve files: ${error.message}`);
    }
  }

  @Get(':id')
  async getFileById(@Param('id', ParseIntPipe) id: number) {
    try {
      const file = await this.fileProcessingService.getParsedFileById(id);
      
      // Check if medical bill data exists in database
      const medicalBill = await this.medicalBillService.getMedicalBillByParsedFileId(id);
      if (medicalBill) {
        // Return the saved medical bill data in the requested format with message and data
        const medicalBillData = this.medicalBillService.convertToDto(medicalBill);
        return {
          status: true,
          message: "Medical bill data retrieved successfully",
          data: medicalBillData
        };
      }
      
      // If not in database, check if this is a medical bill and extract structured data
      if (file.extractedText && this.medicalBillExtractionService.isMedicalBill(file.extractedText)) {
        try {
          const medicalBillData = this.medicalBillExtractionService.extractMedicalBillData(file.extractedText);
          const validation = this.medicalBillExtractionService.validateMedicalBill(medicalBillData);
          
          if (validation.isValid) {
            // Calculate confidence and save to database
            const confidence = this.medicalBillExtractionService.calculateConfidence(medicalBillData);
            await this.medicalBillService.saveMedicalBill(id, medicalBillData, confidence, {
              fileName: file.originalName,
              fileSize: file.fileSize,
              processedStatus: file.processingStatus
            });
            
            // Return the medical bill data in the requested format with message and data
            return {
              status: true,
              message: "Medical bill data extracted and saved successfully",
              data: {
                id: id,
                fileName: file.originalName,
                fileSize: file.fileSize,
                processedStatus: file.processingStatus,
                processedDate: new Date().toISOString(),
                ...medicalBillData
              }
            };
          } else {
            // If validation fails, still return the extracted data with ID for debugging
            return {
              status: true,
              message: "Medical bill data extracted but validation failed",
              data: {
                id: id,
                fileName: file.originalName,
                fileSize: file.fileSize,
                processedStatus: file.processingStatus,
                processedDate: new Date().toISOString(),
                ...medicalBillData
              }
            };
          }
        } catch (error) {
          // If medical bill extraction fails, continue with normal processing
        }
      }
      
      const structuredTableData = file.structuredTableData ? JSON.parse(file.structuredTableData) : null;
      
      return {
        status: true,
        message: "File data retrieved successfully",
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
      
      // Use standard file processing method
      const extractionResult = await this.fileProcessingService.processFile(file, requestInfo);
      
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
          ocrEngine: 'tesseract', // Default OCR engine
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
        
        // Bounding box information (not available in ParsedFile)
        boundingBoxes: null
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

  @Get('debug/:id')
  async debugFile(@Param('id', ParseIntPipe) id: number) {
    try {
      const file = await this.fileProcessingService.getParsedFileById(id);
      if (!file) {
        throw new BadRequestException('File not found');
      }

      return {
        status: true,
        message: "Debug information retrieved",
        data: {
          id: file.id,
          fileName: file.originalName,
          extractedText: file.extractedText,
          extractedTextLength: file.extractedText ? file.extractedText.length : 0,
          isMedicalBill: file.extractedText ? this.medicalBillExtractionService.isMedicalBill(file.extractedText) : false,
          medicalBillData: file.extractedText && this.medicalBillExtractionService.isMedicalBill(file.extractedText) 
            ? this.medicalBillExtractionService.extractMedicalBillData(file.extractedText)
            : null
        }
      };
    } catch (error) {
      throw new BadRequestException(`Debug failed: ${error.message}`);
    }
  }
}
