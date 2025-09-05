import { Controller, Post, Body, BadRequestException, HttpStatus, HttpCode, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MedicalBillExtractionService } from '../services/medical-bill-extraction.service';
import { FileProcessingService } from '../services/file-processing.service';
import { MedicalBillDto } from '../dto/medical-bill.dto';
import { Express } from 'express';

// Configure multer for medical bill uploads
const medicalBillMulterConfig = {
  storage: memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/bmp',
      'image/webp',
      'application/pdf'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestException('Invalid file type. Only images and PDFs are allowed for medical bills.'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
};

@Controller('api/medical-bills')
export class MedicalBillController {
  constructor(
    private readonly medicalBillExtractionService: MedicalBillExtractionService,
    private readonly fileProcessingService: FileProcessingService,
  ) {}

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', medicalBillMulterConfig))
  async uploadMedicalBill(@UploadedFile() file: Express.Multer.File): Promise<MedicalBillDto> {
    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }

    try {
      // Process the file to get OCR text
      const requestInfo = {
        ip: 'N/A',
        userAgent: 'N/A',
        sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };

      const result = await this.fileProcessingService.processFile(file, requestInfo);

      if (!result.extractedText) {
        throw new BadRequestException('Could not extract text from the uploaded file.');
      }

      // Check if this is a medical bill
      if (!this.medicalBillExtractionService.isMedicalBill(result.extractedText)) {
        throw new BadRequestException('Uploaded file does not appear to be a medical bill.');
      }

      // Extract medical bill data
      const medicalBillData = this.medicalBillExtractionService.extractMedicalBillData(result.extractedText);
      const validation = this.medicalBillExtractionService.validateMedicalBill(medicalBillData);

      if (!validation.isValid) {
        throw new BadRequestException(`Medical bill validation failed: ${validation.errors.join(', ')}`);
      }

      // Return ONLY the medical bill data in the exact format requested
      return medicalBillData;
    } catch (error) {
      throw new BadRequestException(`Failed to process medical bill: ${error.message}`);
    }
  }

  @Post('extract-from-text')
  @HttpCode(HttpStatus.OK)
  async extractMedicalBillFromText(@Body('text') text: string): Promise<{ success: boolean; data: MedicalBillDto; message: string }> {
    if (!text) {
      throw new BadRequestException('No text provided for extraction.');
    }

    try {
      // Check if this looks like a medical bill
      if (!this.medicalBillExtractionService.isMedicalBill(text)) {
        return {
          success: false,
          data: null,
          message: 'Text does not appear to be a medical bill'
        };
      }

      // Extract medical bill data
      const medicalBillData = this.medicalBillExtractionService.extractMedicalBillData(text);
      
      // Validate the extracted data
      const validation = this.medicalBillExtractionService.validateMedicalBill(medicalBillData);
      const confidence = this.medicalBillExtractionService.calculateConfidence(medicalBillData);
      
      // Add metadata
      const enhancedData = {
        ...medicalBillData,
        _metadata: {
          extractionMethod: 'medical_bill_specialized_parser',
          confidence: confidence,
          processingTime: Date.now(),
          documentType: 'medical_invoice',
          validation: validation
        }
      };

      return {
        success: true,
        data: enhancedData,
        message: 'Medical bill data extracted successfully'
      };
    } catch (error) {
      throw new BadRequestException(`Failed to extract medical bill data from text: ${error.message}`);
    }
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validateMedicalBill(@Body() billData: MedicalBillDto): Promise<{ success: boolean; validation: any; confidence: number }> {
    try {
      const validation = this.medicalBillExtractionService.validateMedicalBill(billData);
      const confidence = this.medicalBillExtractionService.calculateConfidence(billData);
      
      return {
        success: true,
        validation: validation,
        confidence: confidence
      };
    } catch (error) {
      throw new BadRequestException(`Failed to validate medical bill data: ${error.message}`);
    }
  }
}
