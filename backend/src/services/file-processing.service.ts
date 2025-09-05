import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParsedFile, FileType, ProcessingStatus } from '../entities/parsed-file.entity';
import { OcrResult } from '../entities/ocr-result.entity';
import { FileMetadata } from '../entities/file-metadata.entity';
import { TableExtraction } from '../entities/table-extraction.entity';
import { GoogleVisionService } from './google-vision.service';
import { ImagePreprocessingService } from './image-preprocessing.service';
import { BillExtractionService } from './bill-extraction.service';
import * as Tesseract from 'tesseract.js';
import * as pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';

const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);

@Injectable()
export class FileProcessingService {
  constructor(
    @InjectRepository(ParsedFile)
    private parsedFileRepository: Repository<ParsedFile>,
    @InjectRepository(OcrResult)
    private ocrResultRepository: Repository<OcrResult>,
    @InjectRepository(FileMetadata)
    private fileMetadataRepository: Repository<FileMetadata>,
    @InjectRepository(TableExtraction)
    private tableExtractionRepository: Repository<TableExtraction>,
    private googleVisionService: GoogleVisionService,
    private imagePreprocessingService: ImagePreprocessingService,
    private billExtractionService: BillExtractionService,
  ) {}

  async processFile(file: Express.Multer.File, requestInfo?: { userAgent?: string; ip?: string; sessionId?: string }): Promise<ParsedFile> {
    const startTime = Date.now();
    
    // Validate file buffer exists
    if (!file.buffer || file.buffer.length === 0) {
      throw new Error('File buffer is missing or empty. Ensure multer is configured with memoryStorage.');
    }
    
    const fileType = this.determineFileTypeEnum(file);

    // Generate file hash for deduplication
    const fileHash = this.generateFileHash(file.buffer);
    
    // Generate unique filename and save to disk
    const uniqueFilename = `${fileHash}.${this.getFileExtension(file.originalname)}`;
    const filePath = `uploads/${uniqueFilename}`;
    const fullFilePath = path.join(process.cwd(), filePath);
    
    // Save file to disk
    await this.saveFileToDisk(file.buffer, fullFilePath);

    // Create initial ParsedFile record
    const parsedFile = new ParsedFile();
    parsedFile.filename = uniqueFilename;
    parsedFile.originalName = file.originalname;
    parsedFile.fileType = fileType;
    parsedFile.fileSize = file.size;
    parsedFile.mimeType = file.mimetype;
    parsedFile.filePath = filePath; // Add the missing filePath field
    parsedFile.fileHash = fileHash; // Add the missing fileHash field
    parsedFile.processingStatus = ProcessingStatus.PROCESSING;
    parsedFile.processingDurationMs = 0;
    parsedFile.characterCount = 0;
    parsedFile.wordCount = 0;
    parsedFile.lineCount = 0;
    parsedFile.hasStructuredData = false;
    parsedFile.tableCount = null;
    parsedFile.averageConfidence = 0;
    parsedFile.parsedContent = '{}';
    parsedFile.extractedText = '';
    parsedFile.createdAt = new Date();
    parsedFile.updatedAt = new Date();

    try {
      // Save initial record
      const savedFile = await this.parsedFileRepository.save(parsedFile);
      let extractedText = '';
      let parsedContent: any = {};
      let ocrResult: OcrResult | null = null;
      let tableExtractions: TableExtraction[] = [];

      // Process based on file type
      switch (fileType) {
        case FileType.IMAGE:
          const imageProcessingResult = await this.processImageWithMultipleEngines(file, savedFile.id, 'tesseract');
          extractedText = imageProcessingResult.text;
          ocrResult = imageProcessingResult.ocrResult;
          parsedContent = await this.createOcrStructuredData(extractedText, file);
          break;

        case FileType.PDF:
          const pdfText = await this.processPdf(file);
          extractedText = pdfText;
          parsedContent = await this.createGenericStructuredData(pdfText, 'pdf');
          break;

        case FileType.EXCEL:
          const excelResult = await this.processExcel(file, savedFile.id);
          extractedText = excelResult.text;
          tableExtractions = excelResult.tableExtractions;
          parsedContent = excelResult.parsedContent;
          break;

        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }

      // Update file record with results
      const endTime = Date.now();
      const finalFile = await this.parsedFileRepository.save({
        ...savedFile,
        processingStatus: ProcessingStatus.COMPLETED,
        processingDurationMs: endTime - startTime,
        characterCount: extractedText.length,
        wordCount: extractedText.split(/\s+/).length,
        lineCount: extractedText.split('\n').length,
        hasStructuredData: Object.keys(parsedContent).length > 0,
        tableCount: tableExtractions.length,
        averageConfidence: ocrResult?.overallConfidence || 0,
        parsedContent,
        extractedText,
        updatedAt: new Date()
      });
      
      // Extract and store bill data automatically
      try {
        await this.billExtractionService.extractAndStoreBillData(finalFile);
        
      } catch (billError) {
        // Don't fail the entire process if bill extraction fails
      }
      
      return finalFile;

    } catch (error) {
      // Update file record with error information
      try {
        const endTime = Date.now();
        parsedFile.processingStatus = ProcessingStatus.FAILED;
        parsedFile.processingDurationMs = endTime - startTime;
        // Error occurred during processing
        parsedFile.updatedAt = new Date();

        return await this.parsedFileRepository.save(parsedFile);
      } catch (dbError) {
        throw new Error(`File processing failed: ${error.message}. Database error: ${dbError.message}`);
      }
    }
  }

  async deleteParsedFile(parsedFileId: number): Promise<void> {
    try {
      await this.ocrResultRepository.delete({ parsedFileId });
      await this.fileMetadataRepository.delete({ parsedFileId });
      await this.tableExtractionRepository.delete({ parsedFileId });
      await this.parsedFileRepository.delete(parsedFileId);
    } catch (error) {
      throw error;
    }
  }

  async cleanupOrphanedRecords(): Promise<void> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const orphanedFiles = await this.parsedFileRepository.find({
        where: {
          processingStatus: ProcessingStatus.FAILED,
          createdAt: { $lt: oneHourAgo } as any
        }
      });
      for (const file of orphanedFiles) {
        await this.deleteParsedFile(file.id);
      }
    } catch (error) {
      // Error cleaning up orphaned records
    }
  }

  async getAllParsedFiles(): Promise<ParsedFile[]> {
    return await this.parsedFileRepository.find({
      order: { createdAt: 'DESC' }
    });
  }

  async getParsedFileById(id: number): Promise<ParsedFile | null> {
    return await this.parsedFileRepository.findOne({ where: { id } });
  }

  private async processImageWithMultipleEngines(file: Express.Multer.File, parsedFileId: number, preferredEngine: string): Promise<{ text: string; ocrResult: OcrResult | null }> {
    try {
      if (preferredEngine === 'google-vision' && this.googleVisionService.isGoogleVisionAvailable()) {
        return await this.processWithGoogleVision(file, parsedFileId);
      } else {
        return await this.processImageEnhanced(file, parsedFileId);
      }
    } catch (error) {
      // Fallback to Tesseract
      return await this.processImageEnhanced(file, parsedFileId);
    }
  }

  /**
   * Get optimized Tesseract configuration for medical bills
   */
  private getMedicalBillTesseractConfig(): any {
    return {
      logger: (m: any) => {
        if (m.status === 'recognizing text') {
          // OCR progress
        }
      },
      // Enhanced OCR configuration for medical bills
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:;()[]{}@#$%&*+-/=<>?!"\'\\|~`^_ \n\t',
      tessedit_pageseg_mode: '6', // Assume uniform block of text
      preserve_interword_spaces: '1', // Preserve spaces between words
      tessedit_ocr_engine_mode: '3', // Default neural nets LSTM engine
      tessedit_do_invert: '0', // Don't invert image
      textord_min_linesize: '2.0', // Minimum line size
      textord_tabfind_show_vlines: '0', // Don't show vertical lines
      classify_enable_learning: '1', // Enable learning
      classify_enable_adaptive_matcher: '1', // Enable adaptive matching
      // Medical bill specific patterns
      user_words_suffix: 'user-words',
      user_patterns_suffix: 'user-patterns'
    };
  }

  private async processImageEnhanced(file: Express.Multer.File, parsedFileId: number): Promise<{ text: string; ocrResult: OcrResult | null }> {
    const startTime = Date.now();
    
    // Create OCR result record
    const ocrResult = new OcrResult();
    ocrResult.parsedFileId = parsedFileId;
    ocrResult.rawText = '';
    ocrResult.overallConfidence = 0;
    ocrResult.processingTimeMs = 0;
    ocrResult.ocrEngine = 'tesseract';
    ocrResult.ocrVersion = '5.0.0'; // Tesseract version
    ocrResult.language = 'eng';
    ocrResult.characterCount = 0;
    ocrResult.wordCount = 0;
    ocrResult.lineCount = 0;
    ocrResult.createdAt = new Date();
    // OCR result created
    
    try {
      // Preprocess the image for better OCR accuracy (specialized for medical bills)
      const preprocessingResult = await this.imagePreprocessingService.preprocessMedicalBill(file.buffer, file.originalname);
      
      const result = await Tesseract.recognize(preprocessingResult.processedBuffer, 'eng', this.getMedicalBillTesseractConfig());
      
      const extractedText = result.data.text.trim();
      const processingTime = Date.now() - startTime;
      
      // Populate OCR result with successful data
      ocrResult.rawText = extractedText || 'No text detected in image';
      ocrResult.overallConfidence = (result.data.confidence || 0) + preprocessingResult.confidenceBoost;
      ocrResult.processingTimeMs = processingTime;
      ocrResult.characterCount = (extractedText || '').length;
      ocrResult.wordCount = (extractedText || '').split(/\s+/).length;
      ocrResult.lineCount = (extractedText || '').split('\n').length;
      
      // Save OCR result
      const savedOcrResult = await this.ocrResultRepository.save(ocrResult);
      
      return {
        text: extractedText,
        ocrResult: savedOcrResult
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Create fallback message with error details
      const fallbackText = `Image uploaded successfully: "${file.originalname}"\n\n` +
        `File Details:\n` +
        `• Size: ${(file.size / 1024).toFixed(2)} KB\n` +
        `• Type: ${file.mimetype}\n` +
        `• Processing Time: ${processingTime}ms\n\n` +
        `OCR Processing Error:\n` +
        `• Error: ${error.message}\n` +
        `• Please try uploading a clearer image or different format.`;
      
      // Populate OCR result with error data
      ocrResult.rawText = fallbackText;
      ocrResult.overallConfidence = 0;
      ocrResult.processingTimeMs = processingTime;
      
      // Save OCR result
      const savedOcrResult = await this.ocrResultRepository.save(ocrResult);
      
      return {
        text: fallbackText,
        ocrResult: savedOcrResult
      };
    }
  }

  private async processWithGoogleVision(file: Express.Multer.File, parsedFileId: number): Promise<{ text: string; ocrResult: OcrResult | null }> {
    const startTime = Date.now();
    
    // Create OCR result record
    const ocrResult = new OcrResult();
    ocrResult.parsedFileId = parsedFileId;
    ocrResult.rawText = '';
    ocrResult.overallConfidence = 0;
    ocrResult.processingTimeMs = 0;
    ocrResult.ocrEngine = 'google-vision';
    ocrResult.ocrVersion = 'v1'; // Google Vision API version
    ocrResult.language = 'en';
    ocrResult.characterCount = 0;
    ocrResult.wordCount = 0;
    ocrResult.lineCount = 0;
    ocrResult.createdAt = new Date();
    // OCR result created
    
    try {
      // Preprocess the image for better OCR accuracy (specialized for medical bills)
      const preprocessingResult = await this.imagePreprocessingService.preprocessMedicalBill(file.buffer, file.originalname);
      
      const visionResult = await this.googleVisionService.extractTableFromImage(preprocessingResult.processedBuffer);
      const processingTime = Date.now() - startTime;
      
      // Populate OCR result
      ocrResult.rawText = visionResult.text;
      ocrResult.overallConfidence = visionResult.confidence + preprocessingResult.confidenceBoost;
      ocrResult.processingTimeMs = processingTime;
      ocrResult.characterCount = (visionResult.text || '').length;
      ocrResult.wordCount = (visionResult.text || '').split(/\s+/).length;
      ocrResult.lineCount = (visionResult.text || '').split('\n').length;
      
      // Save OCR result
      const savedOcrResult = await this.ocrResultRepository.save(ocrResult);
      
      return {
        text: visionResult.text,
        ocrResult: savedOcrResult
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Create error OCR result
      ocrResult.rawText = `Google Vision processing failed: ${error.message}`;
      ocrResult.overallConfidence = 0;
      ocrResult.processingTimeMs = processingTime;
      
      // Save OCR result
      const savedOcrResult = await this.ocrResultRepository.save(ocrResult);
      
    return {
        text: `Google Vision processing failed: ${error.message}`,
        ocrResult: savedOcrResult
      };
    }
  }

  private async processPdf(file: Express.Multer.File): Promise<string> {
    try {
      const data = await pdfParse(file.buffer);
      return data.text;
    } catch (error) {
      throw new Error(`PDF processing failed: ${error.message}`);
    }
  }

  private async processExcel(file: Express.Multer.File, parsedFileId: number): Promise<{ text: string; tableExtractions: TableExtraction[]; parsedContent: any }> {
    try {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const tableExtractions: TableExtraction[] = [];
      const result: any = { sheets: {} };

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length > 0) {
          const headers = jsonData[0] as string[];
          const dataRows = jsonData.slice(1);
          
          // Create table extraction record
          const tableExtraction = new TableExtraction();
          tableExtraction.parsedFileId = parsedFileId;
          tableExtraction.tableName = sheetName;
          tableExtraction.headers = headers;
          tableExtraction.tableData = JSON.stringify(dataRows);
          tableExtraction.rowCount = dataRows.length;
          tableExtraction.columnCount = headers.length;
          tableExtraction.dataCompleteness = this.calculateDataCompleteness(dataRows as any[][]);
          tableExtraction.createdAt = new Date();
          // Table extraction created
          
          const savedTableExtraction = await this.tableExtractionRepository.save(tableExtraction);
          tableExtractions.push(savedTableExtraction);
          
          result.sheets[sheetName] = {
            headers,
            data: dataRows,
            rowCount: dataRows.length,
            columnCount: headers.length
          };
        }
      }

      return {
        text: `Excel file processed with ${workbook.SheetNames.length} sheets`,
        tableExtractions,
        parsedContent: result
      };
    } catch (error) {
      throw new Error(`Excel processing failed: ${error.message}`);
    }
  }

  private async createOcrStructuredData(text: string, file: Express.Multer.File): Promise<any> {
    return {
      type: 'ocr',
      metadata: {
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        processedAt: new Date().toISOString(),
        extractedAt: new Date().toISOString(),
        ocrEngine: 'tesseract',
        detectedStructure: 'text'
      },
      statistics: {
        totalCharacters: text.length,
        totalWords: text.split(/\s+/).length,
        totalLines: text.split('\n').length,
        averageWordsPerLine: Math.round(text.split(/\s+/).length / text.split('\n').length),
        hasStructuredData: false
      },
      content: {
        rawText: text,
        lines: text.split('\n').map((line, index) => ({
          lineNumber: index + 1,
          text: line,
          wordCount: line.split(/\s+/).length,
          characterCount: line.length
        })),
        words: text.split(/\s+/).map((word, index) => ({
          position: index + 1,
          text: word,
          length: word.length
        })),
        detectedStructure: 'paragraph',
        tableData: null
      }
    };
  }

  private async createGenericStructuredData(text: string, originalFileType?: string): Promise<any> {
      return {
      documentType: 'generic',
      extractedAt: new Date().toISOString(),
      sections: {
        company: {
          name: 'Unknown',
          type: 'organization'
        },
        keyValuePairs: {},
        numericData: {
          amounts: [],
          currency: 'INR',
          count: 0
        },
        dates: {
          foundDates: [],
          count: 0
        },
        identifiers: {
          numbers: [],
          count: 0
        }
      }
    };
  }

  private calculateDataCompleteness(dataRows: any[][]): number {
    if (dataRows.length === 0) return 0;
    
    let totalCells = 0;
    let filledCells = 0;
    
    for (const row of dataRows) {
      for (const cell of row) {
        totalCells++;
        if (cell !== null && cell !== undefined && cell !== '') {
          filledCells++;
        }
      }
    }
    
    return totalCells > 0 ? (filledCells / totalCells) * 100 : 0;
  }

  private determineFileTypeEnum(file: Express.Multer.File): FileType {
    const mimeType = file.mimetype.toLowerCase();
    
    if (mimeType.startsWith('image/')) {
      return FileType.IMAGE;
    } else if (mimeType === 'application/pdf') {
      return FileType.PDF;
    } else if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || 
               file.originalname.toLowerCase().endsWith('.xlsx') || 
               file.originalname.toLowerCase().endsWith('.xls')) {
      return FileType.EXCEL;
        } else {
      return FileType.IMAGE; // Default to IMAGE for unknown types
    }
  }

  private generateFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private getFileExtension(filename: string): string {
    return filename.split('.').pop() || 'unknown';
  }

  private async saveFileToDisk(buffer: Buffer, filePath: string): Promise<void> {
    try {
      const dir = path.dirname(filePath);
      await mkdirAsync(dir, { recursive: true });
      await writeFileAsync(filePath, buffer);
    } catch (error) {
      throw new Error(`Failed to save file to disk: ${error.message}`);
    }
  }
}
