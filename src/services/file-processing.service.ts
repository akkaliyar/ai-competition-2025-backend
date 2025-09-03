import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParsedFile, FileType, ProcessingStatus } from '../entities/parsed-file.entity';
import { OcrResult } from '../entities/ocr-result.entity';
import { FileMetadata } from '../entities/file-metadata.entity';
import { TableExtraction } from '../entities/table-extraction.entity';
import { GoogleVisionService } from './google-vision.service';
import { ImagePreprocessingService } from './image-preprocessing.service';
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
  ) {}

  async processFile(file: Express.Multer.File, requestInfo?: { userAgent?: string; ip?: string; sessionId?: string }): Promise<ParsedFile> {
    const startTime = Date.now();
    // Processing File
    // Name: ${file.originalname}
    // Size: ${(file.size / 1024).toFixed(2)} KB
    // Type: ${file.mimetype}
    
    // Validate file buffer exists
    if (!file.buffer || file.buffer.length === 0) {
      throw new Error('File buffer is missing or empty. Ensure multer is configured with memoryStorage.');
    }
    
    const fileType = this.determineFileTypeEnum(file);
    // Detected file type: ${fileType}

    // Generate file hash for deduplication
    const fileHash = this.generateFileHash(file.buffer);
    
    // Generate unique filename and save to disk
    const fileExtension = path.extname(file.originalname);
    const uniqueFilename = `${fileHash}${fileExtension}`;
    const filePath = `uploads/${uniqueFilename}`;
    const fullFilePath = path.join(process.cwd(), filePath);
    
    // Save file to disk
    await this.saveFileToDisk(file.buffer, fullFilePath);

    // Create initial ParsedFile record
    const parsedFile = new ParsedFile();
    parsedFile.filename = uniqueFilename; // Use the hash-based filename
    parsedFile.originalName = file.originalname;
    parsedFile.fileType = fileType;
    parsedFile.mimeType = file.mimetype;
    parsedFile.fileSize = file.size;
    parsedFile.fileHash = fileHash;
    parsedFile.filePath = filePath;
    parsedFile.processingStatus = ProcessingStatus.PROCESSING;
    parsedFile.processingStartedAt = new Date();
    
    // Add request information if available
    if (requestInfo) {
      parsedFile.userAgent = requestInfo.userAgent;
      parsedFile.uploadedFromIp = requestInfo.ip;
      parsedFile.sessionId = requestInfo.sessionId;
    }

    try {
      // Save initial record
      const savedFile = await this.parsedFileRepository.save(parsedFile);
      // Initial file record saved with ID: ${savedFile.id}

      let extractedText = '';
      let parsedContent: any = {};
      let ocrResult: OcrResult | null = null;
      let tableExtractions: TableExtraction[] = [];

      // Process based on file type
      switch (fileType) {
        case FileType.IMAGE:
          // Processing as image with multi-engine OCR
          
          // Select optimal OCR engine based on file characteristics
          const ocrEngine = this.selectOptimalOcrEngine(file);
          // Selected OCR engine: ${ocrEngine}
          
          const imageProcessingResult = await this.processImageWithMultipleEngines(file, savedFile.id, ocrEngine);
          extractedText = imageProcessingResult.text;
          ocrResult = imageProcessingResult.ocrResult;
          parsedContent = await this.createOcrStructuredData(extractedText, file);
          break;

        case FileType.PDF:
          // Processing as PDF
          const pdfProcessingResult = await this.processPdfEnhanced(file, savedFile.id);
          extractedText = pdfProcessingResult.text;
          parsedContent = pdfProcessingResult.parsedContent;
          tableExtractions = pdfProcessingResult.tables || [];
          break;

        case FileType.EXCEL:
          // Processing as Excel
          const excelProcessingResult = await this.processExcelEnhanced(file, savedFile.id);
          parsedContent = excelProcessingResult.parsedContent;
          tableExtractions = excelProcessingResult.tables || [];
          break;

        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }

      // Create and save file metadata
      await this.createFileMetadata(savedFile.id, file, fileType, parsedContent);

      // Save table extractions if any
      if (tableExtractions.length > 0) {
        await this.tableExtractionRepository.save(tableExtractions);
        savedFile.hasStructuredData = true;
        savedFile.tableCount = tableExtractions.length;
      }

      // Update file record with processing results
      const endTime = Date.now();
      savedFile.processingStatus = ProcessingStatus.COMPLETED;
      savedFile.processingCompletedAt = new Date();
      savedFile.processingDurationMs = endTime - startTime;
      savedFile.extractedText = extractedText;
      savedFile.parsedContent = JSON.stringify(parsedContent);
      
      // Create enhanced structured table data for easy display
      const structuredTableData = await this.createEnhancedStructuredTableData(parsedContent, fileType, extractedText);
      savedFile.structuredTableData = JSON.stringify(structuredTableData);
      
      // Update statistics
      if (extractedText) {
        savedFile.characterCount = extractedText.length;
        savedFile.wordCount = extractedText.split(/\s+/).filter(word => word.length > 0).length;
        savedFile.lineCount = extractedText.split('\n').length;
      }

      // Set confidence if available from OCR
      if (ocrResult && ocrResult.overallConfidence) {
        savedFile.averageConfidence = ocrResult.overallConfidence;
      }

      const finalFile = await this.parsedFileRepository.save(savedFile);
      // File processing completed in ${endTime - startTime}ms
      // === Processing Complete ===
      
      return finalFile;

    } catch (error) {
      // === Processing Error ===
      // File: ${file.originalname}
      // Error: ${error.message}
      // Stack: ${error.stack}
      // ======================

      // Update file record with error information
      try {
        const endTime = Date.now();
        parsedFile.processingStatus = ProcessingStatus.FAILED;
        parsedFile.processingCompletedAt = new Date();
        parsedFile.processingDurationMs = endTime - startTime;
        parsedFile.errorMessage = error.message;
        parsedFile.errorStack = error.stack;
        parsedFile.extractedText = `Processing failed: ${error.message}`;
        parsedFile.parsedContent = JSON.stringify({
          type: 'error',
          error: error.message,
          fileInfo: {
            name: file.originalname,
            size: file.size,
            type: file.mimetype
          }
        });

        return await this.parsedFileRepository.save(parsedFile);
      } catch (dbError) {
        // Database save also failed: ${dbError.message}
        throw new Error(`File processing failed: ${error.message}. Database error: ${dbError.message}`);
      }
    }
  }

  private determineFileTypeEnum(file: Express.Multer.File): FileType {
    const mimeType = file.mimetype.toLowerCase();
    
    if (mimeType.startsWith('image/')) {
      return FileType.IMAGE;
    } else if (mimeType === 'application/pdf') {
      return FileType.PDF;
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel' ||
      file.originalname.toLowerCase().endsWith('.xlsx') ||
      file.originalname.toLowerCase().endsWith('.xls')
    ) {
      return FileType.EXCEL;
    }
    
    throw new Error('Unsupported file type');
  }

  private generateFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private async processImageEnhanced(file: Express.Multer.File, parsedFileId: number): Promise<{ text: string; ocrResult: OcrResult | null }> {
    const startTime = Date.now();
    console.log(`Processing image: ${file.originalname} (${(file.size / 1024).toFixed(2)} KB)`);
    
    // Create OCR result record
    const ocrResult = new OcrResult();
    ocrResult.parsedFileId = parsedFileId;
    ocrResult.ocrEngine = 'tesseract';
    ocrResult.ocrVersion = '5.0.5';
    ocrResult.language = 'eng';
    ocrResult.pageNumber = 1;
    
    try {
      console.log('🔍 Starting OCR processing...');
      
      // Enhanced OCR processing with timeout and error handling
      const ocrPromise = Tesseract.recognize(
        file.buffer,
        'eng',
        {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
            }
          }
        }
      );
      
      // Set timeout to prevent hanging (60 seconds)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('OCR processing timeout after 60 seconds')), 60000);
      });
      
      console.log('⏳ Processing with 60-second timeout...');
      const result = await Promise.race([ocrPromise, timeoutPromise]);
      
      const extractedText = result.data.text.trim();
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ OCR completed successfully in ${processingTime}ms`);
      console.log(`📝 Extracted ${extractedText.length} characters`);
      
      // Populate OCR result with successful data
      ocrResult.rawText = extractedText || 'No text detected in image';
      ocrResult.overallConfidence = result.data.confidence || 0;
      ocrResult.processingTimeMs = processingTime;
      ocrResult.characterCount = extractedText.length;
      ocrResult.wordCount = extractedText ? extractedText.split(/\s+/).filter(w => w.length > 0).length : 0;
      ocrResult.lineCount = extractedText ? extractedText.split('\n').length : 0;
      ocrResult.imageQuality = this.assessImageQuality(result.data.confidence || 0);
      
      // Save successful OCR result
      const savedOcrResult = await this.ocrResultRepository.save(ocrResult);
      
      const displayText = extractedText || `Image uploaded successfully: "${file.originalname}"\n\nNo readable text was found in this image. The image may contain:\n• Non-text content (drawings, logos, etc.)\n• Text that is too blurry or low resolution\n• Handwritten text (not supported)\n• Text in unsupported languages`;
      
      return {
        text: displayText,
        ocrResult: savedOcrResult
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ OCR processing failed after ${processingTime}ms:`, error.message);
      
      // Create fallback message with error details
      const fallbackText = `Image uploaded successfully: "${file.originalname}"\n\n` +
        `File Details:\n` +
        `• Size: ${(file.size / 1024).toFixed(2)} KB\n` +
        `• Type: ${file.mimetype}\n` +
        `• Processing Time: ${processingTime}ms\n\n` +
        `⚠️ OCR Processing Failed\n` +
        `Error: ${error.message}\n\n` +
        `Possible Solutions:\n` +
        `• Try a higher resolution image (300+ DPI)\n` +
        `• Ensure good contrast between text and background\n` +
        `• Use PNG or JPEG format\n` +
        `• Avoid very small or blurry text\n` +
        `• Try a different image if text is handwritten\n\n` +
        `Your image has been saved to the database for future processing.`;
      
      // Populate OCR result with error data
      ocrResult.rawText = fallbackText;
      ocrResult.overallConfidence = 0;
      ocrResult.processingTimeMs = processingTime;
      ocrResult.characterCount = fallbackText.length;
      ocrResult.wordCount = fallbackText.split(/\s+/).length;
      ocrResult.lineCount = fallbackText.split('\n').length;
      ocrResult.imageQuality = 'failed';
      ocrResult.errors = error.message;
      ocrResult.warnings = 'OCR processing failed but file was saved successfully';
      
      // Save failed OCR result for debugging
      const savedOcrResult = await this.ocrResultRepository.save(ocrResult);
      
      return {
        text: fallbackText,
        ocrResult: savedOcrResult
      };
    }
  }

  private selectOptimalOcrEngine(file: Express.Multer.File): 'tesseract' | 'google-vision' {
    // Check if Google Vision is available first
    if (!this.googleVisionService.isGoogleVisionAvailable()) {
      console.log('📊 Google Vision not available - using enhanced Tesseract OCR');
      return 'tesseract';
    }

    // Smart OCR engine selection based on file characteristics
    const fileSize = file.size;
    const mimeType = file.mimetype;
    
    // For complex financial documents or large images, prefer Google Vision
    if (fileSize > 2 * 1024 * 1024) { // > 2MB
      console.log('📊 Large image detected - selecting Google Vision for better accuracy');
      return 'google-vision';
    }
    
    // For JPEGs and complex documents, Google Vision often performs better
    if (mimeType === 'image/jpeg' && fileSize > 500 * 1024) { // > 500KB JPEG
      console.log('📊 Complex JPEG detected - selecting Google Vision');
      return 'google-vision';
    }
    
    // Default to enhanced Tesseract for most cases
    console.log('📊 Using enhanced Tesseract OCR');
    return 'tesseract';
  }

  private async processImageWithMultipleEngines(
    file: Express.Multer.File, 
    parsedFileId: number, 
    preferredEngine: 'tesseract' | 'google-vision'
  ): Promise<{ text: string; ocrResult: OcrResult | null }> {
    
    console.log(`🚀 Starting ${preferredEngine} OCR processing...`);
    
    try {
      if (preferredEngine === 'google-vision') {
        return await this.processWithGoogleVision(file, parsedFileId);
      } else {
        return await this.processImageEnhanced(file, parsedFileId);
      }
    } catch (error) {
      console.warn(`⚠️ ${preferredEngine} OCR failed: ${error.message}`);
      
      // Fallback to alternative engine (only if available)
      const fallbackEngine = preferredEngine === 'google-vision' ? 'tesseract' : 
                            (this.googleVisionService.isGoogleVisionAvailable() ? 'google-vision' : 'tesseract');
      
      console.log(`🔄 Falling back to ${fallbackEngine}...`);
      
      try {
        if (fallbackEngine === 'google-vision' && this.googleVisionService.isGoogleVisionAvailable()) {
          return await this.processWithGoogleVision(file, parsedFileId);
        } else {
          return await this.processImageEnhanced(file, parsedFileId);
        }
      } catch (fallbackError) {
        console.error(`❌ OCR fallback failed. Using Tesseract as last resort.`);
        return await this.processImageEnhanced(file, parsedFileId);
      }
    }
  }

  private async processWithGoogleVision(file: Express.Multer.File, parsedFileId: number): Promise<{ text: string; ocrResult: OcrResult | null }> {
    const startTime = Date.now();
    console.log(`🔍 Processing with Google Vision API: ${file.originalname}`);
    
    // Create OCR result record
    const ocrResult = new OcrResult();
    ocrResult.parsedFileId = parsedFileId;
    ocrResult.ocrEngine = 'google-vision';
    ocrResult.ocrVersion = 'v1';
    ocrResult.language = 'en';
    ocrResult.pageNumber = 1;
    
    try {
      // Use Google Vision API for table extraction
      const visionResult = await this.googleVisionService.extractTableFromImage(file.buffer);
      
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ Google Vision completed in ${processingTime}ms`);
      console.log(`📊 Detected table with ${visionResult.tableData.length} rows`);
      console.log(`🎯 Confidence: ${visionResult.confidence.toFixed(1)}%`);
      
      // Populate OCR result
      ocrResult.rawText = visionResult.text;
      ocrResult.overallConfidence = visionResult.confidence;
      ocrResult.processingTimeMs = processingTime;
      ocrResult.characterCount = visionResult.text.length;
      ocrResult.wordCount = visionResult.text.split(/\s+/).filter(w => w.length > 0).length;
      ocrResult.lineCount = visionResult.text.split('\n').length;
      ocrResult.hasTabularData = visionResult.tableData.length > 0;
      ocrResult.imageQuality = visionResult.confidence >= 80 ? 'high' : visionResult.confidence >= 60 ? 'medium' : 'low';
      ocrResult.warnings = `Google Vision API processing with ${visionResult.tableData.length} detected table rows`;
      
      // Save OCR result
      const savedOcrResult = await this.ocrResultRepository.save(ocrResult);
      
      // Format response with enhanced table data if available
      let responseText = visionResult.text;
      if (visionResult.tableData.length > 0) {
        responseText += '\n\n[STRUCTURED TABLE DATA DETECTED]';
      }
      
      return {
        text: responseText,
        ocrResult: savedOcrResult
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ Google Vision processing failed: ${error.message}`);
      
      // Create error OCR result
      const errorText = `Google Vision processing failed: ${error.message}`;
      ocrResult.rawText = errorText;
      ocrResult.overallConfidence = 0;
      ocrResult.processingTimeMs = processingTime;
      ocrResult.characterCount = errorText.length;
      ocrResult.wordCount = errorText.split(/\s+/).length;
      ocrResult.lineCount = errorText.split('\n').length;
      ocrResult.imageQuality = 'failed';
      ocrResult.errors = error.message;
      
      const savedOcrResult = await this.ocrResultRepository.save(ocrResult);
      
      // Re-throw error to trigger fallback
      throw new Error(`Google Vision API error: ${error.message}`);
    }
  }

  private assessImageQuality(confidence: number): string {
    if (confidence >= 90) return 'excellent';
    if (confidence >= 80) return 'high';
    if (confidence >= 65) return 'medium';
    if (confidence >= 45) return 'low';
    return 'poor';
  }

  /**
   * 🧾 Specialized Invoice Data Extraction
   * Enhanced OCR + Table Detection with Preprocessing
   */
  async extractInvoiceData(file: Express.Multer.File, requestInfo?: { userAgent?: string; ip?: string; sessionId?: string }): Promise<any> {
    const startTime = Date.now();
    console.log(`\n=== 🧾 ADVANCED INVOICE EXTRACTION ===`);
    console.log(`Invoice: ${file.originalname} (${(file.size / 1024).toFixed(2)} KB)`);
    
    // Step 1: Image Preprocessing for Enhanced OCR
    console.log('🎯 Step 1: Advanced Image Preprocessing for Invoice OCR');
    const preprocessingResult = await this.imagePreprocessingService.preprocessInvoice(
      file.buffer, 
      file.originalname
    );
    
    console.log(`✅ Preprocessing completed: ${preprocessingResult.appliedOperations.join(', ')}`);
    console.log(`📈 Expected OCR boost: +${preprocessingResult.confidenceBoost}%`);
    
    // Step 2: Smart OCR Engine Selection
    const preferredEngine = this.selectOptimalOcrEngineForInvoice(file);
    console.log(`🎯 Step 2: Selected OCR Engine: ${preferredEngine}`);
    
    // Step 3: Enhanced OCR Processing with Bounding Boxes
    console.log('🎯 Step 3: OCR Processing with Bounding Box Detection');
    let ocrResult: { text: string; confidence: number; boundingBoxes?: any; engine: string };
    
    try {
      if (preferredEngine === 'google-vision' && this.googleVisionService.isGoogleVisionAvailable()) {
        ocrResult = await this.processInvoiceWithGoogleVision(preprocessingResult.processedBuffer);
      } else {
        ocrResult = await this.processInvoiceWithTesseract(preprocessingResult.processedBuffer);
      }
    } catch (error) {
      console.warn(`⚠️ Primary OCR engine failed, falling back to Tesseract: ${error.message}`);
      ocrResult = await this.processInvoiceWithTesseract(preprocessingResult.processedBuffer);
    }
    
    // Apply OCR confidence boost from preprocessing
    const enhancedConfidence = Math.min(100, ocrResult.confidence + preprocessingResult.confidenceBoost);
    
    console.log(`✅ OCR completed with ${ocrResult.engine}`);
    console.log(`🎯 Enhanced confidence: ${enhancedConfidence.toFixed(1)}%`);
    
    // Step 4: Advanced Table Detection and Parsing
    console.log('🎯 Step 4: Advanced Table Structure Analysis');
    const structuredData = await this.parseInvoiceToTableJSON(ocrResult.text, ocrResult.boundingBoxes);
    
    console.log(`📊 Detected ${structuredData.tableCount} tables with ${structuredData.totalRows} rows`);
    
    // Step 5: Save to Database with Enhanced Metadata
    const savedFile = await this.saveInvoiceExtractionResult(
      file,
      ocrResult.text,
      structuredData,
      enhancedConfidence,
      ocrResult.engine,
      Date.now() - startTime,
      requestInfo
    );
    
    console.log(`🎉 Invoice extraction completed in ${Date.now() - startTime}ms`);
    
    // Return enhanced result with bounding boxes
    return {
      ...savedFile,
      boundingBoxes: ocrResult.boundingBoxes,
      ocrEngine: ocrResult.engine
    };
  }

  /**
   * Smart OCR engine selection specifically for invoices
   */
  private selectOptimalOcrEngineForInvoice(file: Express.Multer.File): 'tesseract' | 'google-vision' {
    // For invoices, prioritize Google Vision if available for better table detection
    if (this.googleVisionService.isGoogleVisionAvailable()) {
      // Complex invoices benefit from Google Vision's spatial analysis
      if (file.size > 1024 * 1024) { // > 1MB
        console.log('📊 Large invoice image - selecting Google Vision for spatial analysis');
        return 'google-vision';
      }
      
      // JPEG invoices often have complex layouts
      if (file.mimetype === 'image/jpeg') {
        console.log('📊 JPEG invoice - selecting Google Vision for layout analysis');
        return 'google-vision';
      }
    }
    
    console.log('📊 Using enhanced Tesseract OCR with preprocessing');
    return 'tesseract';
  }

  /**
   * Process invoice with Google Vision API (with bounding boxes)
   */
  private async processInvoiceWithGoogleVision(imageBuffer: Buffer): Promise<{ text: string; confidence: number; boundingBoxes: any; engine: string }> {
    const visionResult = await this.googleVisionService.extractTableFromImage(imageBuffer);
    
    return {
      text: visionResult.text,
      confidence: visionResult.confidence,
      boundingBoxes: {
        textBlocks: visionResult.tableData, // Google Vision provides spatial data
        method: 'google-vision',
        hasTableStructure: visionResult.tableData.length > 0
      },
      engine: 'google-vision'
    };
  }

  /**
   * Process invoice with enhanced Tesseract (with confidence data)
   */
  private async processInvoiceWithTesseract(imageBuffer: Buffer): Promise<{ text: string; confidence: number; boundingBoxes: any; engine: string }> {
    console.log('🔍 Starting enhanced Tesseract OCR for invoice...');
    
    // Enhanced Tesseract configuration for invoices
    const result = await Tesseract.recognize(imageBuffer, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log(`📊 Invoice OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });
    
    const extractedText = result.data.text.trim();
    const confidence = result.data.confidence || 0;
    
    // Extract word-level bounding boxes from Tesseract
    const boundingBoxes = {
      words: result.data.words?.map(word => ({
        text: word.text,
        confidence: word.confidence,
        bbox: word.bbox,
        x: word.bbox.x0,
        y: word.bbox.y0,
        width: word.bbox.x1 - word.bbox.x0,
        height: word.bbox.y1 - word.bbox.y0
      })) || [],
      method: 'tesseract-enhanced',
      hasTableStructure: this.detectTableInBoundingBoxes(result.data.words || [])
    };
    
    console.log(`✅ Tesseract extracted ${boundingBoxes.words.length} words with bounding boxes`);
    
    return {
      text: extractedText,
      confidence,
      boundingBoxes,
      engine: 'tesseract-enhanced'
    };
  }

  /**
   * Detect table structure from bounding boxes
   */
  private detectTableInBoundingBoxes(words: any[]): boolean {
    if (words.length < 10) return false; // Too few words for a table
    
    // Analyze spatial distribution to detect table-like structure
    const yPositions = words.map(w => w.bbox?.y0 || 0).sort((a, b) => a - b);
    const xPositions = words.map(w => w.bbox?.x0 || 0).sort((a, b) => a - b);
    
    // Check for regular row spacing (table characteristic)
    const rowSpacing = this.analyzeSpacing(yPositions, 15); // 15px tolerance
    const columnAlignment = this.analyzeSpacing(xPositions, 20); // 20px tolerance
    
    const hasTableStructure = rowSpacing.regularSpacing >= 3 && columnAlignment.regularSpacing >= 2;
    
    if (hasTableStructure) {
      console.log(`📊 Table structure detected: ${rowSpacing.regularSpacing} rows, ${columnAlignment.regularSpacing} columns`);
    }
    
    return hasTableStructure;
  }

  /**
   * Analyze spacing patterns in positions
   */
  private analyzeSpacing(positions: number[], tolerance: number): { regularSpacing: number; averageGap: number } {
    const gaps: number[] = [];
    
    for (let i = 1; i < positions.length; i++) {
      const gap = positions[i] - positions[i - 1];
      if (gap > tolerance) { // Only consider significant gaps
        gaps.push(gap);
      }
    }
    
    if (gaps.length === 0) return { regularSpacing: 0, averageGap: 0 };
    
    const averageGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    
    // Count gaps that are similar (within tolerance)
    let regularSpacing = 0;
    for (const gap of gaps) {
      if (Math.abs(gap - averageGap) <= tolerance) {
        regularSpacing++;
      }
    }
    
    return { regularSpacing, averageGap };
  }

  /**
   * 📊 Parse Invoice Text to Structured Table JSON
   * Post-processing approach with stable column mapping (as per specification)
   */
  private async parseInvoiceToTableJSON(extractedText: string, boundingBoxes?: any): Promise<any> {
    console.log('📊 Parsing invoice text with post-processing and stable column mapping...');
    
    // Define stable header structure for consistent mapping
    const standardHeaders = [
      'Product', 'Batch', 'HSN', 'Qty', 'MRP', 'Rate', 'Amount', 'SGST', 'CGST'
    ];
    
    let structuredData: any = {
      type: 'invoice',
      data: [], // Direct array format as per specification
      tableCount: 0,
      totalRows: 0,
      metadata: {
        parsingMethod: 'post-processing',
        confidence: 0,
        hasStructuredData: false,
        standardHeaders: standardHeaders
      }
    };

    // Strategy 1: Parse using bounding boxes with post-processing
    if (boundingBoxes && boundingBoxes.hasTableStructure) {
      console.log('📊 Using bounding box parsing with post-processing...');
      structuredData.data = await this.parseWithBoundingBoxPostProcessing(extractedText, boundingBoxes, standardHeaders);
    } else {
      // Strategy 2: Parse using text line mapping (stable approach)
      console.log('📊 Using text line mapping with stable column structure...');
      structuredData.data = await this.parseWithTextLineMapping(extractedText, standardHeaders);
    }

    // Update metadata
    structuredData.totalRows = structuredData.data.length;
    structuredData.tableCount = structuredData.totalRows > 0 ? 1 : 0;
    structuredData.metadata.hasStructuredData = structuredData.totalRows > 0;
    structuredData.metadata.confidence = this.calculateParsingConfidence(structuredData.data);

    console.log(`✅ Post-processing completed: ${structuredData.totalRows} rows with ${standardHeaders.length} columns`);
    
    return structuredData;
  }

  /**
   * Parse with bounding box data using post-processing approach
   */
  private async parseWithBoundingBoxPostProcessing(text: string, boundingBoxes: any, standardHeaders: string[]): Promise<any[]> {
    const words = boundingBoxes.words || [];
    
    // Group words into rows based on Y positions
    const rows = this.groupWordsIntoRows(words);
    
    // Apply post-processing to map to stable column structure
    return this.mapRowsToStandardFormat(rows, standardHeaders);
  }

  /**
   * Parse using text line mapping (stable column mapping approach)
   */
  private async parseWithTextLineMapping(text: string, standardHeaders: string[]): Promise<any[]> {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    
    // Find table data lines (skip headers and metadata)
    const dataLines = this.extractDataLines(lines);
    
    // Apply post-processing to map each line to standard format
    return this.mapLinesToStandardFormat(dataLines, standardHeaders);
  }

  /**
   * Extract data lines from OCR text (skip headers, footers, etc.)
   */
  private extractDataLines(lines: string[]): string[] {
    const dataLines: string[] = [];
    let inTableSection = false;
    
    for (const line of lines) {
      const cleanLine = line.trim();
      
      // Skip empty lines
      if (!cleanLine) continue;
      
      // Skip obvious header lines
      if (this.isHeaderLine(cleanLine)) {
        inTableSection = true;
        continue;
      }
      
      // Skip footer/total lines
      if (this.isFooterLine(cleanLine)) {
        break;
      }
      
      // If we're in table section and line looks like data, include it
      if (inTableSection && this.isDataLine(cleanLine)) {
        dataLines.push(cleanLine);
      }
    }
    
    return dataLines;
  }

  /**
   * Check if line is a header line
   */
  private isHeaderLine(line: string): boolean {
    const headerPatterns = [
      /^(sl|sr|sn|no|product|item|description|batch|hsn|qty|quantity|rate|price|amount|total|gst|sgst|cgst)/i,
      /^(particulars|details|code)/i
    ];
    
    return headerPatterns.some(pattern => pattern.test(line));
  }

  /**
   * Check if line is a footer/total line
   */
  private isFooterLine(line: string): boolean {
    const footerPatterns = [
      /^(total|subtotal|grand\s*total|net\s*amount|final)/i,
      /^(thanks|thank\s*you|terms|conditions)/i
    ];
    
    return footerPatterns.some(pattern => pattern.test(line));
  }

  /**
   * Check if line contains data (has product info, numbers, etc.)
   */
  private isDataLine(line: string): boolean {
    // Must contain some meaningful content
    if (line.length < 3) return false;
    
    // Should have some numbers (quantities, prices, etc.)
    const hasNumbers = /\d+/.test(line);
    
    // Should have some text (product names)
    const hasText = /[a-zA-Z]{3,}/.test(line);
    
    // Skip lines that are just numbers or just text
    return hasNumbers && hasText;
  }

  /**
   * Map text lines to standard JSON format
   */
  private mapLinesToStandardFormat(lines: string[], standardHeaders: string[]): any[] {
    const results: any[] = [];
    
    for (const line of lines) {
      const mappedRow = this.mapLineToStandardColumns(line, standardHeaders);
      if (mappedRow && Object.keys(mappedRow).length > 1) {
        results.push(mappedRow);
      }
    }
    
    return results;
  }

  /**
   * Map a single line to standard column format using intelligent parsing
   */
  private mapLineToStandardColumns(line: string, standardHeaders: string[]): any {
    // Initialize result with standard headers
    const result: any = {};
    standardHeaders.forEach(header => {
      result[header] = '';
    });

    // Split line into segments (by spaces, tabs, or other delimiters)
    const segments = this.intelligentLineSplit(line);
    
    if (segments.length < 3) return null; // Not enough data for a valid row
    
    // Apply intelligent mapping based on patterns
    let segmentIndex = 0;
    
    // Map Product (usually longest text segment or first text-heavy segment)
    const productSegment = this.findProductSegment(segments);
    if (productSegment) {
      result.Product = productSegment.text;
      segmentIndex = productSegment.index + 1;
    }
    
    // Map remaining segments to numeric fields
    const remainingSegments = segments.slice(segmentIndex);
    this.mapNumericSegments(remainingSegments, result);
    
    return result;
  }

  /**
   * Intelligent line splitting considering various delimiters and patterns
   */
  private intelligentLineSplit(line: string): Array<{text: string, index: number}> {
    // First try splitting by multiple spaces or tabs
    let segments = line.split(/\s{2,}|\t/).filter(s => s.trim().length > 0);
    
    // If too few segments, try single space split
    if (segments.length < 3) {
      segments = line.split(/\s+/).filter(s => s.trim().length > 0);
    }
    
    return segments.map((text, index) => ({ text: text.trim(), index }));
  }

  /**
   * Find the product name segment (usually the longest or most text-heavy)
   */
  private findProductSegment(segments: Array<{text: string, index: number}>): {text: string, index: number} | null {
    // Look for segment with most alphabetic characters and reasonable length
    let bestSegment = null;
    let bestScore = 0;
    
    for (const segment of segments) {
      const text = segment.text;
      
      // Skip if it's clearly numeric (price, quantity, etc.)
      if (/^\d+\.?\d*$/.test(text) || /^₹/.test(text)) continue;
      
      // Calculate score based on text content
      const textLength = text.length;
      const alphaCount = (text.match(/[a-zA-Z]/g) || []).length;
      const score = textLength + (alphaCount * 2);
      
      if (score > bestScore && textLength > 3) {
        bestScore = score;
        bestSegment = segment;
      }
    }
    
    return bestSegment;
  }

  /**
   * Map numeric segments to appropriate fields (Batch, HSN, Qty, MRP, Rate, Amount, taxes)
   */
  private mapNumericSegments(segments: Array<{text: string, index: number}>, result: any): void {
    const numericFields = ['Batch', 'HSN', 'Qty', 'MRP', 'Rate', 'Amount', 'SGST', 'CGST'];
    let fieldIndex = 0;
    
    for (const segment of segments) {
      const text = segment.text;
      
      if (fieldIndex >= numericFields.length) break;
      
      const field = numericFields[fieldIndex];
      
      // Apply field-specific parsing
      switch (field) {
        case 'Batch':
          // Batch numbers are usually alphanumeric
          if (/^[A-Z0-9]+$/i.test(text)) {
            result[field] = text;
            fieldIndex++;
          }
          break;
          
        case 'HSN':
          // HSN codes are usually 4-8 digits
          if (/^\d{4,8}$/.test(text)) {
            result[field] = text;
            fieldIndex++;
          }
          break;
          
        case 'Qty':
          // Quantities are usually integers
          const qty = this.parseNumeric(text);
          if (qty && qty === Math.floor(qty)) {
            result[field] = qty;
            fieldIndex++;
          }
          break;
          
        case 'MRP':
        case 'Rate':
        case 'Amount':
          // Prices/amounts are decimal numbers
          const amount = this.parseNumeric(text);
          if (amount && amount > 0) {
            result[field] = amount;
            fieldIndex++;
          }
          break;
          
        case 'SGST':
        case 'CGST':
          // Tax amounts (might be 0.00)
          const tax = this.parseNumeric(text);
          if (tax !== null) {
            result[field] = tax;
            fieldIndex++;
          }
          break;
      }
    }
  }

  /**
   * Parse numeric value from text (handles currency symbols, commas, etc.)
   */
  private parseNumeric(text: string): number | null {
    // Remove currency symbols and commas
    const cleaned = text.replace(/[₹$,\s]/g, '');
    
    // Try to parse as number
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  /**
   * Calculate confidence score for parsed data
   */
  private calculateParsingConfidence(data: any[]): number {
    if (data.length === 0) return 0;
    
    let totalScore = 0;
    let maxScore = 0;
    
    for (const row of data) {
      let rowScore = 0;
      let rowMaxScore = 0;
      
      // Check each field
      Object.entries(row).forEach(([key, value]) => {
        rowMaxScore += 10;
        
        if (value && String(value).trim().length > 0) {
          rowScore += 10;
          
          // Bonus for well-formatted fields
          if (key === 'Product' && String(value).length > 5) rowScore += 5;
          if (key === 'HSN' && /^\d{4,8}$/.test(String(value))) rowScore += 5;
          if (['MRP', 'Rate', 'Amount'].includes(key) && typeof value === 'number' && value > 0) rowScore += 5;
        }
      });
      
      totalScore += rowScore;
      maxScore += rowMaxScore;
    }
    
    return maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  }

  /**
   * Group words into rows based on Y positions (for bounding box processing)
   */
  private groupWordsIntoRows(words: any[]): any[][] {
    if (!words || words.length === 0) return [];
    
    // Sort words by Y position first, then X position
    const sortedWords = words.sort((a, b) => {
      const yDiff = (a.y || 0) - (b.y || 0);
      if (Math.abs(yDiff) < 10) { // Same row tolerance
        return (a.x || 0) - (b.x || 0);
      }
      return yDiff;
    });

    // Group into rows
    const rows: any[][] = [];
    let currentRow: any[] = [];
    let lastY = -1;
    const rowTolerance = 15;

    for (const word of sortedWords) {
      const y = word.y || 0;
      
      if (lastY === -1 || Math.abs(y - lastY) <= rowTolerance) {
        currentRow.push(word);
      } else {
        if (currentRow.length > 0) {
          rows.push([...currentRow]);
        }
        currentRow = [word];
      }
      lastY = y;
    }

    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    return rows;
  }

  /**
   * Map word rows to standard format using post-processing
   */
  private mapRowsToStandardFormat(rows: any[][], standardHeaders: string[]): any[] {
    const results: any[] = [];
    
    for (const row of rows) {
      // Convert word row to line text
      const lineText = row.map(word => word.text).join(' ');
      
      // Skip header-like rows
      if (this.isHeaderLine(lineText) || !this.isDataLine(lineText)) {
        continue;
      }
      
      // Map to standard format
      const mappedRow = this.mapLineToStandardColumns(lineText, standardHeaders);
      if (mappedRow && Object.values(mappedRow).some(v => v !== '')) {
        results.push(mappedRow);
      }
    }
    
    return results;
  }

  /**
   * Parse table using bounding box spatial information
   */
  private async parseBoundingBoxTable(text: string, boundingBoxes: any): Promise<any> {
    const words = boundingBoxes.words || [];
    
    // Group words into rows based on Y positions
    const rowTolerance = 15; // pixels
    const rows: any[][] = [];
    const sortedWords = words.sort((a: any, b: any) => a.y - b.y);
    
    let currentRow: any[] = [];
    let lastY = -1;
    
    for (const word of sortedWords) {
      if (lastY === -1 || Math.abs(word.y - lastY) <= rowTolerance) {
        currentRow.push(word);
      } else {
        if (currentRow.length > 0) {
          // Sort current row by X position (left to right)
          currentRow.sort((a, b) => a.x - b.x);
          rows.push([...currentRow]);
        }
        currentRow = [word];
      }
      lastY = word.y;
    }
    
    // Add the last row
    if (currentRow.length > 0) {
      currentRow.sort((a, b) => a.x - b.x);
      rows.push(currentRow);
    }

    // Convert to structured table format
    const tableData = this.convertRowsToTableJSON(rows);
    
    return {
      type: 'invoice',
      tables: [tableData],
      tableCount: 1,
      totalRows: tableData.rows?.length || 0,
      metadata: {
        parsingMethod: 'bounding-box',
        confidence: 85,
        hasStructuredData: true,
        spatialAnalysis: true
      }
    };
  }

  /**
   * Parse table using text patterns and delimiters
   */
  private async parseTextPatternTable(text: string): Promise<any> {
    // Use existing OCR structured data creation logic
    const structuredResult = await this.createOcrStructuredData(text, { originalname: 'invoice' } as any);
    
    return {
      type: 'invoice',
      tables: structuredResult.sheets ? [structuredResult.sheets.OCR_Data] : [],
      tableCount: structuredResult.sheets ? 1 : 0,
      totalRows: structuredResult.sheets?.OCR_Data?.data?.length || 0,
      metadata: {
        parsingMethod: 'text-pattern',
        confidence: structuredResult.metadata?.confidence || 70,
        hasStructuredData: structuredResult.type === 'spreadsheet'
      }
    };
  }

  /**
   * 🧾 Convert word rows to structured invoice JSON table
   */
  private convertRowsToTableJSON(rows: any[][]): any {
    if (rows.length === 0) return { headers: [], rows: [] };
    
    // Detect headers with multi-line support
    const headerInfo = this.detectTableHeaders(rows);
    const dataRows = rows.slice(headerInfo.headerRowCount);
    
    // Convert rows to structured data with invoice-specific processing
    const structuredRows = dataRows
      .filter(row => this.isValidDataRow(row))  // Filter out empty/invalid rows
      .map((row, index) => {
        const rowData: any = { rowNumber: index + 1 };
        
        row.forEach((word, colIndex) => {
          const columnKey = headerInfo.headers[colIndex] || `Column_${colIndex + 1}`;
          const existingValue = rowData[columnKey] || '';
          let cellValue = existingValue + (existingValue ? ' ' : '') + word.text;
          
          // Apply invoice-specific data cleaning and formatting
          cellValue = this.cleanInvoiceDataValue(cellValue, columnKey);
          
          rowData[columnKey] = cellValue;
        });
        
        // Post-process row for invoice-specific enhancements
        return this.enhanceInvoiceRowData(rowData);
      });

    return {
      headers: headerInfo.headers,
      rows: structuredRows,
      rowCount: structuredRows.length,
      columnCount: headerInfo.headers.length,
      confidence: 85,
      invoiceMetadata: this.extractInvoiceMetadata(structuredRows)
    };
  }

  /**
   * Check if a row contains valid data (not just headers or empty)
   */
  private isValidDataRow(row: any[]): boolean {
    if (!row || row.length === 0) return false;
    
    const text = row.map(word => word.text).join(' ').trim();
    
    // Skip empty rows
    if (text.length === 0) return false;
    
    // Skip rows that look like headers or separators
    const headerLikePatterns = [
      /^(sl|sr|sn|no|description|product|qty|rate|amount|total|hsn|gst|batch)(\s|$)/i,
      /^[-=_\s]+$/,  // Separator lines
      /^total|subtotal|grand\s*total/i  // Total lines (might want these later)
    ];
    
    if (headerLikePatterns.some(pattern => pattern.test(text))) {
      return false;
    }
    
    // Must have at least some meaningful content
    return text.length > 2 && /[a-zA-Z0-9]/.test(text);
  }

  /**
   * Clean and format invoice data values based on column type
   */
  private cleanInvoiceDataValue(value: string, columnKey: string): string {
    if (!value) return '';
    
    let cleaned = value.trim();
    
    switch (columnKey) {
      case 'Serial_Number':
        // Extract just the number
        const serialMatch = cleaned.match(/(\d+)/);
        return serialMatch ? serialMatch[1] : cleaned;
        
      case 'Product_Description':
        // Clean product names, preserve important text
        cleaned = cleaned.replace(/\s+/g, ' ');
        return this.enhanceProductName(cleaned);
        
      case 'Batch_Number':
        // Extract batch/lot numbers
        const batchMatch = cleaned.match(/([A-Z0-9-]+)/i);
        return batchMatch ? batchMatch[1] : cleaned;
        
      case 'Quantity':
        // Extract numeric quantity
        const qtyMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
        return qtyMatch ? qtyMatch[1] : cleaned;
        
      case 'Unit_Price':
      case 'Total_Amount':
        // Format currency values
        return this.formatCurrencyValue(cleaned);
        
      case 'HSN_Code':
        // Extract HSN/SAC codes
        const hsnMatch = cleaned.match(/(\d{4,8})/);
        return hsnMatch ? hsnMatch[1] : cleaned;
        
      case 'GST_Details':
        // Extract GST percentages and values
        return this.formatGSTValue(cleaned);
        
      case 'Discount':
        // Format discount values
        const discountMatch = cleaned.match(/(\d+(?:\.\d+)?%?)/);
        return discountMatch ? discountMatch[1] : cleaned;
        
      default:
        return cleaned;
    }
  }

  /**
   * Enhance product name extraction and cleaning
   */
  private enhanceProductName(text: string): string {
    // Common OCR corrections for product names
    let enhanced = text
      .replace(/\bl\b/g, '1')  // Common OCR error: l instead of 1
      .replace(/\bO\b/g, '0')  // Common OCR error: O instead of 0
      .replace(/\s+/g, ' ')    // Normalize spaces
      .trim();
    
    // Preserve important pharmaceutical/chemical terms
    const preservePatterns = [
      /SESNODIN/i,
      /BRASV/i,
      /MG|GM|KG|ML|LTR/i,
      /TABLET|CAPSULE|SYRUP|INJECTION/i
    ];
    
    return enhanced;
  }

  /**
   * Format currency values consistently
   */
  private formatCurrencyValue(text: string): string {
    // Extract currency symbol and amount
    const currencyMatch = text.match(/(₹|Rs\.?\s*|INR\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
    
    if (currencyMatch) {
      const amount = currencyMatch[2];
      return `₹${amount}`;
    }
    
    return text;
  }

  /**
   * Format GST values and percentages
   */
  private formatGSTValue(text: string): string {
    // Extract GST percentage
    const gstPercentMatch = text.match(/(\d{1,2}(?:\.\d+)?)\s*%/);
    if (gstPercentMatch) {
      return `${gstPercentMatch[1]}%`;
    }
    
    // Extract GST amount
    const gstAmountMatch = text.match(/(₹|Rs\.?\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
    if (gstAmountMatch) {
      return `₹${gstAmountMatch[2]}`;
    }
    
    return text;
  }

  /**
   * Enhance row data with calculated fields and corrections
   */
  private enhanceInvoiceRowData(rowData: any): any {
    const enhanced = { ...rowData };
    
    // Calculate total if unit price and quantity are available
    if (enhanced.Unit_Price && enhanced.Quantity) {
      const unitPrice = this.parseNumericValue(enhanced.Unit_Price);
      const quantity = this.parseNumericValue(enhanced.Quantity);
      
      if (unitPrice && quantity) {
        const calculatedTotal = unitPrice * quantity;
        enhanced.Calculated_Total = `₹${calculatedTotal.toFixed(2)}`;
      }
    }
    
    // Extract and normalize HSN codes
    if (enhanced.HSN_Code) {
      enhanced.HSN_Code = this.normalizeHSNCode(enhanced.HSN_Code);
    }
    
    return enhanced;
  }

  /**
   * Parse numeric value from formatted text
   */
  private parseNumericValue(text: string): number | null {
    if (!text) return null;
    
    const match = text.replace(/[₹,Rs]/g, '').match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
  }

  /**
   * Normalize HSN codes to standard format
   */
  private normalizeHSNCode(hsn: string): string {
    const hsnMatch = hsn.match(/(\d{4,8})/);
    return hsnMatch ? hsnMatch[1] : hsn;
  }

  /**
   * Extract invoice-level metadata from structured rows
   */
  private extractInvoiceMetadata(rows: any[]): any {
    const metadata: any = {
      totalItems: rows.length,
      hasGSTDetails: false,
      hasBatchNumbers: false,
      hasHSNCodes: false,
      totalAmount: 0,
      gstAmount: 0
    };
    
    rows.forEach(row => {
      // Check for GST details
      if (row.GST_Details) {
        metadata.hasGSTDetails = true;
      }
      
      // Check for batch numbers
      if (row.Batch_Number) {
        metadata.hasBatchNumbers = true;
      }
      
      // Check for HSN codes
      if (row.HSN_Code) {
        metadata.hasHSNCodes = true;
      }
      
      // Sum total amounts
      if (row.Total_Amount) {
        const amount = this.parseNumericValue(row.Total_Amount);
        if (amount) {
          metadata.totalAmount += amount;
        }
      }
    });
    
    metadata.formattedTotalAmount = `₹${metadata.totalAmount.toFixed(2)}`;
    
    return metadata;
  }

  /**
   * 🧾 Enhanced Invoice Header Detection
   * Specifically handles multi-line headers and invoice-specific fields
   */
  private detectTableHeaders(rows: any[][]): { headers: string[]; headerRowCount: number } {
    if (rows.length === 0) return { headers: [], headerRowCount: 0 };
    
    // Analyze first 2-3 rows for multi-line headers
    const headerRows = rows.slice(0, Math.min(3, rows.length));
    let headerRowCount = 1;
    
    // Combine multi-line headers
    const combinedHeaders = this.combineMultiLineHeaders(headerRows);
    
    // If multi-line headers detected, adjust row count
    if (combinedHeaders.multiLineDetected) {
      headerRowCount = combinedHeaders.rowCount;
    }
    
    const headers = combinedHeaders.headers.map((headerText, index) => {
      const text = headerText.toLowerCase().trim();
      
      // Enhanced mapping for invoice-specific fields
      if (text.includes('sn') || text.includes('sr') || text.includes('sl') || text.includes('serial')) {
        return 'Serial_Number';
      }
      if (text.includes('product') || text.includes('item') || text.includes('description') || text.includes('particulars')) {
        return 'Product_Description';
      }
      if (text.includes('batch') || text.includes('lot') || text.includes('mfg')) {
        return 'Batch_Number';
      }
      if (text.includes('qty') || text.includes('quantity') || text.includes('units')) {
        return 'Quantity';
      }
      if (text.includes('rate') || text.includes('price') || text.includes('unit')) {
        return 'Unit_Price';
      }
      if (text.includes('amount') || text.includes('total') || text.includes('value')) {
        return 'Total_Amount';
      }
      if (text.includes('hsn') || text.includes('sac') || text.includes('code')) {
        return 'HSN_Code';
      }
      if (text.includes('gst') || text.includes('tax') || text.includes('cgst') || text.includes('sgst') || text.includes('igst')) {
        return 'GST_Details';
      }
      if (text.includes('discount') || text.includes('disc')) {
        return 'Discount';
      }
      if (text.includes('exp') || text.includes('expiry') || text.includes('date')) {
        return 'Expiry_Date';
      }
      
      // Use original text for unrecognized headers
      return this.cleanHeaderText(headerText) || `Column_${index + 1}`;
    });
    
    return { headers, headerRowCount };
  }

  /**
   * Combine multi-line headers from multiple rows
   */
  private combineMultiLineHeaders(rows: any[][]): { headers: string[]; multiLineDetected: boolean; rowCount: number } {
    if (rows.length <= 1) {
      return {
        headers: rows[0]?.map(word => word.text) || [],
        multiLineDetected: false,
        rowCount: 1
      };
    }

    // Check if we have multi-line headers by analyzing text patterns
    const firstRow = rows[0];
    const secondRow = rows[1];
    
    let multiLineDetected = false;
    let rowCount = 1;
    
    // Detect multi-line headers: incomplete words, continued text, etc.
    const combinedHeaders = firstRow.map((word, index) => {
      let headerText = word.text;
      
      // Check if this header continues in the next row
      if (secondRow && secondRow[index]) {
        const secondRowText = secondRow[index].text.toLowerCase();
        const firstRowText = word.text.toLowerCase();
        
        // Combine if: short text, incomplete words, or obvious continuation
        if (
          firstRowText.length < 8 ||  // Short headers likely continue
          !firstRowText.includes(' ') ||  // Single words often continue
          this.isIncompleteHeader(firstRowText) ||  // Incomplete patterns
          this.isHeaderContinuation(firstRowText, secondRowText)  // Obvious continuation
        ) {
          headerText = `${word.text} ${secondRow[index].text}`.trim();
          multiLineDetected = true;
          rowCount = 2;
        }
      }
      
      return headerText;
    });

    // Check for third row if needed
    if (multiLineDetected && rows[2]) {
      // Additional logic for 3-line headers if needed
      rowCount = Math.min(3, rows.length);
    }

    return { headers: combinedHeaders, multiLineDetected, rowCount };
  }

  /**
   * Check if header text appears incomplete
   */
  private isIncompleteHeader(text: string): boolean {
    const incompletePatterns = [
      /^(prod|desc|quan|amo|tota|rat|bat|hsn|gst)$/i,  // Truncated common words
      /^[A-Z]{2,4}$/,  // Short acronyms that might continue
      /\w+\s*[\/\\-]\s*$/,  // Text ending with separator
    ];
    
    return incompletePatterns.some(pattern => pattern.test(text));
  }

  /**
   * Check if two header texts are continuation of each other
   */
  private isHeaderContinuation(first: string, second: string): boolean {
    // Common continuation patterns in invoices
    const continuationPatterns = [
      { first: /product/i, second: /name|description/i },
      { first: /unit/i, second: /price|rate/i },
      { first: /total/i, second: /amount|value/i },
      { first: /hsn/i, second: /code/i },
      { first: /gst/i, second: /rate|%/i },
      { first: /batch/i, second: /no|number/i },
    ];
    
    return continuationPatterns.some(pattern => 
      pattern.first.test(first) && pattern.second.test(second)
    );
  }

  /**
   * Clean and normalize header text
   */
  private cleanHeaderText(text: string): string {
    return text
      .replace(/[^\w\s]/g, ' ')  // Remove special characters
      .replace(/\s+/g, ' ')      // Normalize spaces
      .trim()
      .replace(/\b\w+/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Title case
      .replace(/\s+/g, '_');     // Convert to underscore format
  }

  /**
   * Save invoice extraction result to database
   */
  private async saveInvoiceExtractionResult(
    file: Express.Multer.File,
    extractedText: string,
    structuredData: any,
    confidence: number,
    ocrEngine: string,
    processingTime: number,
    requestInfo?: any
  ): Promise<ParsedFile> {
    
    // Create ParsedFile record
    const parsedFile = new ParsedFile();
    parsedFile.originalName = file.originalname;
    parsedFile.filename = `invoice_${Date.now()}_${file.originalname}`;
    parsedFile.fileType = FileType.IMAGE;
    parsedFile.fileSize = file.size;
    parsedFile.mimeType = file.mimetype;
    parsedFile.extractedText = extractedText;
    parsedFile.parsedContent = JSON.stringify(structuredData);
    parsedFile.processingStatus = ProcessingStatus.COMPLETED;
    parsedFile.processingDurationMs = processingTime;
    parsedFile.characterCount = extractedText.length;
    parsedFile.wordCount = extractedText.split(/\s+/).filter(w => w.length > 0).length;
    parsedFile.lineCount = extractedText.split('\n').length;
    parsedFile.hasStructuredData = structuredData.tableCount > 0;
    parsedFile.tableCount = structuredData.tableCount;
    parsedFile.averageConfidence = confidence;
    
    // Add request info
    if (requestInfo) {
      parsedFile.userAgent = requestInfo.userAgent;
      parsedFile.uploadedFromIp = requestInfo.ip;
      parsedFile.sessionId = requestInfo.sessionId;
    }
    
    // Save to database
    const savedFile = await this.parsedFileRepository.save(parsedFile);
    
    console.log(`💾 Invoice extraction result saved to database (ID: ${savedFile.id})`);
    
    return savedFile;
  }

  private async processPdfEnhanced(file: Express.Multer.File, parsedFileId: number): Promise<{ text: string; parsedContent: any; tables?: TableExtraction[] }> {
    try {
      const data = await pdfParse(file.buffer);
      const extractedText = data.text.trim();
      
      const parsedContent = {
        extractedText,
        type: 'text',
        metadata: {
          fileName: file.originalname,
          fileSize: file.size,
          processedAt: new Date().toISOString(),
          pages: data.numpages,
          version: data.version || 'unknown'
        }
      };

      return {
        text: extractedText,
        parsedContent: parsedContent
      };
    } catch (error) {
      throw new Error(`PDF processing failed: ${error.message}`);
    }
  }

  private async processExcelEnhanced(file: Express.Multer.File, parsedFileId: number): Promise<{ parsedContent: any; tables?: TableExtraction[] }> {
    try {
      console.log('📊 Processing Excel file...');
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const result: any = { sheets: {} };
      const tables: TableExtraction[] = [];

      console.log(`📋 Found ${workbook.SheetNames.length} sheets: ${workbook.SheetNames.join(', ')}`);

      // Process all sheets
      for (let i = 0; i < workbook.SheetNames.length; i++) {
        const sheetName = workbook.SheetNames[i];
        const worksheet = workbook.Sheets[sheetName];
        
        console.log(`📄 Processing sheet: ${sheetName}`);
        
        // Get range of the sheet
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
        console.log(`📐 Sheet range: ${worksheet['!ref'] || 'A1'}`);
        
        // Extract data with headers
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          raw: false, // Convert dates and numbers to strings for consistency
          dateNF: 'YYYY-MM-DD' // Standard date format
        });
        
        if (jsonData.length > 0) {
          // Clean headers - remove empty ones and ensure strings
          const rawHeaders = jsonData[0] as any[];
          const headers = rawHeaders.map((header, index) => {
            if (header === null || header === undefined || header === '') {
              return `Column_${index + 1}`;
            }
            return String(header).trim();
          });
          
          const dataRows = jsonData.slice(1);
          console.log(`📊 Sheet ${sheetName}: ${headers.length} columns, ${dataRows.length} data rows`);
          
          // Process data rows and clean them
          const processedData = dataRows.map((row: any[], rowIndex) => {
            const obj: any = {};
            headers.forEach((header, colIndex) => {
              let cellValue = row[colIndex];
              
              // Clean cell values
              if (cellValue === null || cellValue === undefined) {
                cellValue = '';
              } else if (typeof cellValue === 'number') {
                // Keep numbers as numbers but ensure they display correctly
                cellValue = cellValue;
              } else {
                // Convert to string and trim
                cellValue = String(cellValue).trim();
              }
              
              obj[header] = cellValue;
            });
            return obj;
          });

          // Store sheet data
          result.sheets[sheetName] = {
            headers: headers,
            data: processedData,
            rowCount: dataRows.length,
            columnCount: headers.length,
            sheetInfo: {
              name: sheetName,
              range: worksheet['!ref'],
              hasData: processedData.length > 0
            }
          };

          // Analyze data types in each column
          const columnTypes = this.analyzeColumnTypes(processedData, headers);
          
          // Calculate data statistics
          const dataStats = this.calculateExcelDataStats(processedData, headers);

          // Create detailed table extraction record
          const tableExtraction = new TableExtraction();
          tableExtraction.parsedFileId = parsedFileId;
          tableExtraction.tableIndex = i;
          tableExtraction.tableName = sheetName;
          tableExtraction.rowCount = dataRows.length;
          tableExtraction.columnCount = headers.length;
          tableExtraction.headers = headers;
          tableExtraction.tableData = JSON.stringify(processedData);
          tableExtraction.cellTypes = columnTypes;
          tableExtraction.dataCompleteness = this.calculateDataCompleteness(processedData);
          tableExtraction.hasHeaderRow = true;
          tableExtraction.hasNumericData = dataStats.hasNumericData;
          tableExtraction.hasDateData = dataStats.hasDateData;
          tableExtraction.extractionMethod = 'xlsx-enhanced-parser';
          tableExtraction.excelSheetName = sheetName;
          tableExtraction.excelRange = worksheet['!ref'];
          tableExtraction.columnStatistics = dataStats.columnStats;
          tableExtraction.dataPatterns = dataStats.patterns;
          tableExtraction.overallQuality = Math.min(
            100,
            (tableExtraction.dataCompleteness * 0.6) + 
            (dataStats.dataQuality * 0.4)
          );
          tableExtraction.emptyCells = dataStats.emptyCells;
          tableExtraction.emptyRows = dataStats.emptyRows;

          tables.push(tableExtraction);
          
          console.log(`✅ Sheet ${sheetName} processed: ${processedData.length} rows, ${Math.round(tableExtraction.dataCompleteness)}% complete`);
        } else {
          console.log(`⚠️ Sheet ${sheetName} is empty`);
          // Still create a record for empty sheets
          result.sheets[sheetName] = {
            headers: [],
            data: [],
            rowCount: 0,
            columnCount: 0,
            sheetInfo: {
              name: sheetName,
              range: 'A1',
              hasData: false
            }
          };
        }
      }

      const totalDataRows = Object.values(result.sheets).reduce((sum: number, sheet: any) => sum + sheet.rowCount, 0);
      console.log(`📈 Excel processing complete: ${workbook.SheetNames.length} sheets, ${totalDataRows} total data rows`);

      return {
        parsedContent: {
          type: 'spreadsheet',
          sheets: result.sheets,
          totalSheets: workbook.SheetNames.length,
          metadata: {
            fileName: file.originalname,
            fileSize: file.size,
            sheetNames: workbook.SheetNames,
            totalDataRows: totalDataRows,
            processedAt: new Date().toISOString()
          }
        },
        tables: tables
      };
    } catch (error) {
      console.error('❌ Excel processing failed:', error);
      throw new Error(`Excel processing failed: ${error.message}`);
    }
  }

  private calculateDataCompleteness(data: any[]): number {
    if (!data || data.length === 0) return 0;
    
    let totalCells = 0;
    let filledCells = 0;
    
    data.forEach(row => {
      Object.values(row).forEach(cell => {
        totalCells++;
        if (cell !== null && cell !== undefined && cell !== '') {
          filledCells++;
        }
      });
    });
    
    return totalCells > 0 ? (filledCells / totalCells) * 100 : 0;
  }

  private analyzeColumnTypes(data: any[], headers: string[]): any {
    const columnTypes: any = {};
    
    headers.forEach(header => {
      const values = data.map(row => row[header]).filter(val => val !== null && val !== undefined && val !== '');
      
      if (values.length === 0) {
        columnTypes[header] = 'empty';
        return;
      }

      let numberCount = 0;
      let dateCount = 0;
      let booleanCount = 0;
      let stringCount = 0;

      values.forEach(value => {
        if (typeof value === 'number' || (!isNaN(Number(value)) && !isNaN(parseFloat(value)))) {
          numberCount++;
        } else if (this.isDateString(value)) {
          dateCount++;
        } else if (typeof value === 'boolean' || value === 'true' || value === 'false') {
          booleanCount++;
        } else {
          stringCount++;
        }
      });

      const total = values.length;
      if (numberCount / total > 0.8) {
        columnTypes[header] = 'number';
      } else if (dateCount / total > 0.8) {
        columnTypes[header] = 'date';
      } else if (booleanCount / total > 0.8) {
        columnTypes[header] = 'boolean';
      } else {
        columnTypes[header] = 'text';
      }
    });

    return columnTypes;
  }

  private calculateExcelDataStats(data: any[], headers: string[]): any {
    const stats = {
      hasNumericData: false,
      hasDateData: false,
      dataQuality: 100,
      emptyCells: 0,
      emptyRows: 0,
      columnStats: {} as any,
      patterns: {} as any
    };

    // Count empty cells and rows
    let totalCells = 0;
    data.forEach(row => {
      let emptyCellsInRow = 0;
      headers.forEach(header => {
        totalCells++;
        const value = row[header];
        if (value === null || value === undefined || value === '') {
          stats.emptyCells++;
          emptyCellsInRow++;
        }
      });
      if (emptyCellsInRow === headers.length) {
        stats.emptyRows++;
      }
    });

    // Analyze each column
    headers.forEach(header => {
      const values = data.map(row => row[header]).filter(val => val !== null && val !== undefined && val !== '');
      
      stats.columnStats[header] = {
        totalValues: values.length,
        emptyValues: data.length - values.length,
        uniqueValues: new Set(values).size,
        dataType: this.getColumnDataType(values)
      };

      // Check for numeric and date data
      if (stats.columnStats[header].dataType === 'number') {
        stats.hasNumericData = true;
        const numericValues = values.map(v => Number(v)).filter(v => !isNaN(v));
        if (numericValues.length > 0) {
          stats.columnStats[header].min = Math.min(...numericValues);
          stats.columnStats[header].max = Math.max(...numericValues);
          stats.columnStats[header].average = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
        }
      } else if (stats.columnStats[header].dataType === 'date') {
        stats.hasDateData = true;
      }
    });

    // Calculate overall data quality
    const completeness = ((totalCells - stats.emptyCells) / totalCells) * 100;
    const uniqueness = headers.reduce((sum, header) => {
      const col = stats.columnStats[header];
      return sum + (col.uniqueValues / Math.max(col.totalValues, 1));
    }, 0) / headers.length * 100;

    stats.dataQuality = (completeness * 0.7) + (uniqueness * 0.3);

    return stats;
  }

  private isDateString(value: any): boolean {
    if (typeof value !== 'string') return false;
    const date = new Date(value);
    return !isNaN(date.getTime()) && value.length > 6; // Avoid matching simple numbers
  }

  private getColumnDataType(values: any[]): string {
    if (values.length === 0) return 'empty';

    let numberCount = 0;
    let dateCount = 0;
    let booleanCount = 0;

    values.forEach(value => {
      if (typeof value === 'number' || (!isNaN(Number(value)) && !isNaN(parseFloat(value)))) {
        numberCount++;
      } else if (this.isDateString(value)) {
        dateCount++;
      } else if (typeof value === 'boolean' || value === 'true' || value === 'false') {
        booleanCount++;
      }
    });

    const total = values.length;
    if (numberCount / total > 0.6) return 'number';
    if (dateCount / total > 0.6) return 'date';
    if (booleanCount / total > 0.6) return 'boolean';
    return 'text';
  }

  private async createFileMetadata(parsedFileId: number, file: Express.Multer.File, fileType: FileType, parsedContent: any): Promise<FileMetadata> {
    const metadata = new FileMetadata();
    metadata.parsedFileId = parsedFileId;
    metadata.fileExtension = path.extname(file.originalname).toLowerCase();
    metadata.fileMd5Hash = crypto.createHash('md5').update(file.buffer).digest('hex');
    metadata.fileSha256Hash = this.generateFileHash(file.buffer);
    metadata.processingServer = require('os').hostname();
    metadata.processingNodeVersion = process.version;

    // Set file-type specific metadata
    if (fileType === FileType.PDF && parsedContent.metadata) {
      metadata.pdfPageCount = parsedContent.metadata.pages;
      metadata.pdfVersion = parsedContent.metadata.version;
    } else if (fileType === FileType.EXCEL && parsedContent.sheets) {
      metadata.excelSheetCount = Object.keys(parsedContent.sheets).length;
      metadata.excelSheetNames = Object.keys(parsedContent.sheets);
    }

    return await this.fileMetadataRepository.save(metadata);
  }

  private async saveFileToDisk(buffer: Buffer, filePath: string): Promise<void> {
    try {
      // Ensure upload directory exists
      const uploadDir = path.dirname(filePath);
      if (!fs.existsSync(uploadDir)) {
        await mkdirAsync(uploadDir, { recursive: true });
      }

      // Save file to disk
      await writeFileAsync(filePath, buffer);
      console.log(`File saved to disk: ${filePath}`);
    } catch (error) {
      throw new Error(`Failed to save file to disk: ${error.message}`);
    }
  }

  private async processImage(file: Express.Multer.File): Promise<string> {
    console.log(`Processing image: ${file.originalname} (${(file.size / 1024).toFixed(2)} KB)`);
    
    // For now, disable OCR to prevent server crashes and return file info instead
    const fallbackMessage = `Image uploaded successfully: "${file.originalname}"\n\n` +
      `File Details:\n` +
      `• Size: ${(file.size / 1024).toFixed(2)} KB\n` +
      `• Type: ${file.mimetype}\n` +
      `• Dimensions: Processing...\n\n` +
      `[OCR PROCESSING TEMPORARILY DISABLED]\n` +
      `OCR functionality is temporarily disabled to ensure server stability.\n` +
      `Your image has been successfully saved to the database.\n` +
      `PDF and Excel processing are fully functional.\n\n` +
      `To enable OCR:\n` +
      `1. Ensure Tesseract.js is properly configured\n` +
      `2. Check image quality and format\n` +
      `3. Monitor server logs for OCR processing errors`;
    
    console.log('Image processed (OCR disabled for stability)');
    return fallbackMessage;
    
    /*
    // OCR CODE (DISABLED TO PREVENT CRASHES)
    try {
      console.log('Starting OCR processing...');
      
      // Add timeout to prevent hanging
      const ocrPromise = Tesseract.recognize(
        file.buffer,
        'eng',
        {
          logger: m => {
            if (m.status === 'recognizing text') {
              console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
            }
          }
        }
      );
      
      // Set 30 second timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('OCR processing timeout')), 30000);
      });
      
      const result = await Promise.race([ocrPromise, timeoutPromise]);
      const { data: { text } } = result as any;
      
      const extractedText = text.trim();
      console.log(`OCR completed successfully. Extracted ${extractedText.length} characters.`);
      
      if (!extractedText) {
        return 'No readable text was found in this image. The image may be too blurry, have poor contrast, or contain no text content.';
      }
      
      return extractedText;
    } catch (error) {
      console.error('OCR processing error:', error);
      
      const errorMessage = `OCR processing failed: ${error.message}.\n\n` +
        'The image has been saved, but text extraction failed.\n' +
        'Suggestions:\n' +
        '• Use high-resolution images (300+ DPI)\n' +
        '• Ensure good contrast\n' +
        '• Try PNG or JPEG formats\n\n' +
        `Image details: ${file.originalname} (${(file.size / 1024).toFixed(2)} KB, ${file.mimetype})`;
      
      return errorMessage;
    }
    */
  }

  private async processPdf(file: Express.Multer.File): Promise<string> {
    try {
      const data = await pdfParse(file.buffer);
      return data.text.trim();
    } catch (error) {
      throw new Error(`PDF processing failed: ${error.message}`);
    }
  }

  private async processExcel(file: Express.Multer.File): Promise<any> {
    try {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const result: any = {};

      // Process all sheets
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // Convert to more structured format
        if (jsonData.length > 0) {
          const headers = jsonData[0] as string[];
          const rows = jsonData.slice(1);
          
          result[sheetName] = {
            headers,
            data: rows.map(row => {
              const obj: any = {};
              headers.forEach((header, index) => {
                obj[header] = row[index] || null;
              });
              return obj;
            })
          };
        }
      }

      return {
        type: 'spreadsheet',
        sheets: result,
        totalSheets: workbook.SheetNames.length
      };
    } catch (error) {
      throw new Error(`Excel processing failed: ${error.message}`);
    }
  }

  async getAllParsedFiles(): Promise<ParsedFile[]> {
    return await this.parsedFileRepository.find({
      order: { createdAt: 'DESC' }
    });
  }

  async getParsedFileById(id: number): Promise<ParsedFile> {
    const file = await this.parsedFileRepository.findOne({ where: { id } });
    if (!file) {
      throw new Error('File not found');
    }
    return file;
  }

  private async createOcrStructuredData(extractedText: string, file: Express.Multer.File): Promise<any> {
    // Create structured data for OCR results suitable for table display
    const lines = extractedText.split('\n').filter(line => line.trim().length > 0);
    const words = extractedText.split(/\s+/).filter(word => word.trim().length > 0);
    
    // Enhanced table detection
    const tableAnalysis = this.analyzeOcrForTables(lines);
    const isTabularData = tableAnalysis.isTable;
    
    console.log(`🔍 OCR Analysis: ${isTabularData ? 'Tabular' : 'Text'} structure detected`);
    console.log(`   - Table confidence: ${Math.round(tableAnalysis.confidence * 100)}%`);
    console.log(`   - Detected ${tableAnalysis.columnCount} columns`);

    // If we detect a table structure, create Excel-like format
    if (isTabularData && tableAnalysis.structuredData) {
      console.log('📊 Converting OCR to Excel-like format...');
      return this.createExcelLikeStructureFromOcr(extractedText, tableAnalysis, file);
    }

    // For non-tabular data, create the standard OCR format but enhanced
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
        totalCharacters: extractedText.length,
        totalWords: words.length,
        totalLines: lines.length,
        averageWordsPerLine: Math.round(words.length / Math.max(lines.length, 1)),
        hasStructuredData: false
      },
      content: {
        rawText: extractedText,
        lines: lines.map((line, index) => ({
          lineNumber: index + 1,
          text: line.trim(),
          wordCount: line.trim().split(/\s+/).length,
          characterCount: line.trim().length
        })),
        words: words.map((word, index) => ({
          position: index + 1,
          text: word,
          length: word.length
        })),
        detectedStructure: 'paragraph',
        tableData: null
      }
    };
  }

  private analyzeOcrForTables(lines: string[]): { isTable: boolean; confidence: number; columnCount: number; structuredData: any[] | null; headers: string[] | null } {
    if (lines.length < 2) {
      return { isTable: false, confidence: 0, columnCount: 0, structuredData: null, headers: null };
    }

    let tableScore = 0;
    let maxColumns = 0;
    let consistentColumnCounts = 0;
    const columnDelimiters = ['\t', '|', '  ', '   ', '    '];
    
    // Analyze each line for table patterns
    const analyzedRows = lines.map((line, index) => {
      const trimmedLine = line.trim();
      
      // Count different types of separators
      let columnCount = 1; // Start with 1 column
      let bestDelimiter = null;
      let bestScore = 0;
      
      for (const delimiter of columnDelimiters) {
        const parts = trimmedLine.split(delimiter).map(p => p.trim()).filter(p => p.length > 0);
        if (parts.length > 1) {
          const score = parts.length * (delimiter.length === 1 ? 2 : 1); // Prefer single char delimiters
          if (score > bestScore) {
            bestScore = score;
            bestDelimiter = delimiter;
            columnCount = parts.length;
          }
        }
      }
      
      // Additional patterns for tables
      const hasNumbers = /\d/.test(trimmedLine);
      const hasConsistentSpacing = /\s{2,}/.test(trimmedLine);
      const hasPipeDelimiter = trimmedLine.includes('|');
      const hasTabDelimiter = trimmedLine.includes('\t');
      const looksLikeHeader = index === 0 && /^[A-Za-z\s]+$/.test(trimmedLine) && columnCount > 1;
      
      return {
        originalText: trimmedLine,
        columnCount,
        delimiter: bestDelimiter,
        hasNumbers,
        hasConsistentSpacing,
        hasPipeDelimiter,
        hasTabDelimiter,
        looksLikeHeader,
        columns: bestDelimiter ? trimmedLine.split(bestDelimiter).map(c => c.trim()).filter(c => c.length > 0) : [trimmedLine]
      };
    });

    // Calculate table confidence
    const rowCount = analyzedRows.length;
    maxColumns = Math.max(...analyzedRows.map(row => row.columnCount));
    
    // Count rows with consistent column numbers
    const targetColumnCount = maxColumns;
    consistentColumnCounts = analyzedRows.filter(row => 
      Math.abs(row.columnCount - targetColumnCount) <= 1
    ).length;
    
    // Score different table indicators
    tableScore += (consistentColumnCounts / rowCount) * 40; // Consistency is important
    tableScore += analyzedRows.filter(row => row.hasConsistentSpacing).length / rowCount * 20;
    tableScore += analyzedRows.filter(row => row.hasPipeDelimiter).length / rowCount * 30;
    tableScore += analyzedRows.filter(row => row.hasTabDelimiter).length / rowCount * 35;
    tableScore += analyzedRows.filter(row => row.hasNumbers).length / rowCount * 10;
    tableScore += analyzedRows[0]?.looksLikeHeader ? 15 : 0;

    const confidence = Math.min(tableScore / 100, 1);
    const isTable = confidence > 0.4 && maxColumns > 1 && consistentColumnCounts >= rowCount * 0.5;

    console.log(`📊 Table analysis details:`);
    console.log(`   - Consistent columns: ${consistentColumnCounts}/${rowCount}`);
    console.log(`   - Max columns: ${maxColumns}`);
    console.log(`   - Table score: ${Math.round(tableScore)}/100`);

    // If it's a table, extract structured data
    let structuredData = null;
    let headers = null;
    
    if (isTable) {
      // Assume first row might be headers if it looks like one
      const firstRow = analyzedRows[0];
      const hasHeaders = firstRow.looksLikeHeader || (firstRow.columnCount === maxColumns && !firstRow.hasNumbers);
      
      if (hasHeaders) {
        headers = firstRow.columns;
        structuredData = analyzedRows.slice(1).map((row, index) => {
          const rowData: any = { rowNumber: index + 1 };
          
          // Map columns to headers or generic column names
          const effectiveHeaders = headers!.length === row.columns.length ? headers! : 
            Array.from({ length: Math.max(headers!.length, row.columns.length) }, (_, i) => headers![i] || `Column_${i + 1}`);
          
          effectiveHeaders.forEach((header, colIndex) => {
            rowData[header] = row.columns[colIndex] || '';
          });
          
          return rowData;
        });
      } else {
        // No clear headers, use generic column names
        headers = Array.from({ length: maxColumns }, (_, i) => `Column_${i + 1}`);
        structuredData = analyzedRows.map((row, index) => {
          const rowData: any = { rowNumber: index + 1 };
          
          headers!.forEach((header, colIndex) => {
            rowData[header] = row.columns[colIndex] || '';
          });
          
          return rowData;
        });
      }
    }

    return {
      isTable,
      confidence,
      columnCount: maxColumns,
      structuredData,
      headers
    };
  }

  private createExcelLikeStructureFromOcr(extractedText: string, tableAnalysis: any, file: Express.Multer.File): any {
    const { structuredData, headers, columnCount } = tableAnalysis;
    
    // Create Excel-like structure for consistent handling
    const excelLikeStructure = {
      type: 'spreadsheet', // Change type to match Excel
      sheets: {
        'OCR_Data': {
          headers: headers || [],
          data: structuredData || [],
          rowCount: structuredData ? structuredData.length : 0,
          columnCount: columnCount,
          sheetInfo: {
            name: 'OCR_Data',
            range: `A1:${this.getExcelColumn(columnCount)}${structuredData ? structuredData.length + 1 : 1}`,
            hasData: structuredData && structuredData.length > 0,
            source: 'ocr_extraction'
          }
        }
      },
      totalSheets: 1,
      metadata: {
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        sheetNames: ['OCR_Data'],
        totalDataRows: structuredData ? structuredData.length : 0,
        processedAt: new Date().toISOString(),
        ocrEngine: 'tesseract',
        detectedStructure: 'tabular',
        confidence: Math.round(tableAnalysis.confidence * 100)
      },
      // Keep original OCR data for reference
      ocrSource: {
        rawText: extractedText,
        extractedLines: extractedText.split('\n').filter(l => l.trim()),
        statistics: {
          totalCharacters: extractedText.length,
          totalWords: extractedText.split(/\s+/).filter(w => w.trim()).length,
          totalLines: extractedText.split('\n').filter(l => l.trim()).length
        }
      }
    };

    console.log(`✅ Created Excel-like structure:`);
    console.log(`   - Headers: [${headers?.join(', ')}]`);
    console.log(`   - Data rows: ${structuredData?.length || 0}`);
    console.log(`   - Columns: ${columnCount}`);

    return excelLikeStructure;
  }

  private getExcelColumn(columnNumber: number): string {
    let result = '';
    while (columnNumber > 0) {
      columnNumber--; // Make it 0-based
      result = String.fromCharCode(65 + (columnNumber % 26)) + result;
      columnNumber = Math.floor(columnNumber / 26);
    }
    return result;
  }

  private parseTableData(tableRows: string[]): any[] {
    return tableRows.map((row, index) => {
      // Split by tabs, multiple spaces, or pipes
      const columns = row.split(/\t|\s{2,}|\|/).map(col => col.trim()).filter(col => col.length > 0);
      
      const rowData: any = {
        rowNumber: index + 1,
        originalText: row,
        cells: columns.map((cell, cellIndex) => ({
          columnNumber: cellIndex + 1,
          value: cell,
          isEmpty: !cell
        })),
        cellCount: columns.length
      };

      // Add numbered columns for easier access
      columns.forEach((col, colIndex) => {
        rowData[`column_${colIndex + 1}`] = col;
      });

      return rowData;
    });
  }

  private async createEnhancedStructuredTableData(parsedContent: any, fileType: FileType, extractedText: string): Promise<any> {
    try {
      console.log(`🔧 Creating enhanced structured table data for ${fileType} file...`);
      
      let structuredData: any = {
        fileType: fileType,
        processedAt: new Date().toISOString(),
        hasStructuredData: false,
        tableCount: 0,
        totalRows: 0,
        totalColumns: 0
      };

      switch (fileType) {
        case FileType.IMAGE:
          structuredData = await this.createImageStructuredTableData(parsedContent, extractedText);
          break;
        case FileType.PDF:
          structuredData = await this.createPdfStructuredTableData(parsedContent, extractedText);
          break;
        case FileType.EXCEL:
          structuredData = await this.createExcelStructuredTableData(parsedContent, extractedText);
          break;
        default:
          structuredData = await this.createGenericStructuredTableData(parsedContent, extractedText);
      }

      console.log(`✅ Enhanced structured data created: ${structuredData.tableCount} tables, ${structuredData.totalRows} total rows`);
      return structuredData;
    } catch (error) {
      console.error('Error creating enhanced structured table data:', error);
      return {
        fileType: fileType,
        processedAt: new Date().toISOString(),
        hasStructuredData: false,
        error: error.message,
        fallbackData: await this.createGenericStructuredTableData(parsedContent, extractedText)
      };
    }
  }

  private async createImageStructuredTableData(parsedContent: any, extractedText: string): Promise<any> {
    // Check if this is a payslip document
    if (this.isPayslipDocument(extractedText)) {
      console.log('💰 Detected payslip document in image, using specialized parser...');
      return await this.createPayslipStructuredData(extractedText, 'image');
    }

    const lines = extractedText.split('\n').filter(line => line.trim().length > 0);
    const tableAnalysis = this.analyzeOcrForTables(lines);
    
    if (tableAnalysis.isTable && tableAnalysis.structuredData) {
      return {
        fileType: 'image',
        processedAt: new Date().toISOString(),
        hasStructuredData: true,
        tableCount: 1,
        totalRows: tableAnalysis.structuredData.length,
        totalColumns: tableAnalysis.columnCount,
        tables: [{
          id: 'ocr_table_1',
          name: 'OCR Extracted Table',
          headers: tableAnalysis.headers || [],
          data: tableAnalysis.structuredData,
          rowCount: tableAnalysis.structuredData.length,
          columnCount: tableAnalysis.columnCount,
          confidence: tableAnalysis.confidence,
          source: 'ocr_extraction'
        }],
        metadata: {
          ocrEngine: 'tesseract',
          confidence: tableAnalysis.confidence,
          detectedStructure: 'tabular'
        }
      };
    }

    // For non-tabular data, create structured text format
    return {
      fileType: 'image',
      processedAt: new Date().toISOString(),
      hasStructuredData: true,
      tableCount: 1,
      totalRows: lines.length,
      totalColumns: 2,
      tables: [{
        id: 'text_content_1',
        name: 'Extracted Text Content',
        headers: ['Line Number', 'Text Content'],
        data: lines.map((line, index) => ({
          'Line Number': index + 1,
          'Text Content': line.trim()
        })),
        rowCount: lines.length,
        columnCount: 2,
        confidence: 1.0,
        source: 'text_extraction'
      }],
      metadata: {
        ocrEngine: 'tesseract',
        confidence: 1.0,
        detectedStructure: 'text'
      }
    };
  }

  private async createPdfStructuredTableData(parsedContent: any, extractedText: string): Promise<any> {
    console.log('🔍 Analyzing PDF content for structured data...');
    
    // Check if this is a payslip document
    if (this.isPayslipDocument(extractedText)) {
      console.log('💰 Detected payslip document, using specialized parser...');
      return await this.createPayslipStructuredData(extractedText, 'pdf');
    }
    
    // Regular table analysis for other PDFs
    const lines = extractedText.split('\n').filter(line => line.trim().length > 0);
    const tableAnalysis = this.analyzeOcrForTables(lines);
    
    if (tableAnalysis.isTable && tableAnalysis.structuredData) {
      return {
        fileType: 'pdf',
        processedAt: new Date().toISOString(),
        hasStructuredData: true,
        tableCount: 1,
        totalRows: tableAnalysis.structuredData.length,
        totalColumns: tableAnalysis.columnCount,
        tables: [{
          id: 'pdf_table_1',
          name: 'PDF Extracted Table',
          headers: tableAnalysis.headers || [],
          data: tableAnalysis.structuredData,
          rowCount: tableAnalysis.structuredData.length,
          columnCount: tableAnalysis.columnCount,
          confidence: tableAnalysis.confidence,
          source: 'pdf_extraction'
        }],
        metadata: {
          extractionMethod: 'pdf_parse',
          confidence: tableAnalysis.confidence,
          detectedStructure: 'tabular'
        }
      };
    }

    // For non-tabular PDF data
    return {
      fileType: 'pdf',
      processedAt: new Date().toISOString(),
      hasStructuredData: true,
      tableCount: 1,
      totalRows: lines.length,
      totalColumns: 2,
      tables: [{
        id: 'pdf_content_1',
        name: 'PDF Text Content',
        headers: ['Page/Line', 'Text Content'],
        data: lines.map((line, index) => ({
          'Page/Line': index + 1,
          'Text Content': line.trim()
        })),
        rowCount: lines.length,
        columnCount: 2,
        confidence: 1.0,
        source: 'pdf_text_extraction'
      }],
      metadata: {
        extractionMethod: 'pdf_parse',
        confidence: 1.0,
        detectedStructure: 'text'
      }
    };
  }

  private isPayslipDocument(text: string): boolean {
    const payslipKeywords = [
      'payslip', 'salary', 'employee', 'earnings', 'deductions', 
      'basic', 'allowance', 'pf', 'income tax', 'net salary',
      'payable days', 'paid days', 'joining date', 'employee code'
    ];
    
    const lowerText = text.toLowerCase();
    const keywordMatches = payslipKeywords.filter(keyword => 
      lowerText.includes(keyword)
    );
    
    return keywordMatches.length >= 5; // At least 5 keywords to be considered a payslip
  }

  private async createPayslipStructuredData(text: string, originalFileType?: string): Promise<any> {
    console.log(`💰 Creating structured payslip data from ${originalFileType || 'unknown'} file...`);
    
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    
    // Extract employee details (key-value pairs)
    const employeeDetails = this.extractPayslipEmployeeDetails(lines);
    
    // Extract earnings/deductions table
    const earningsTable = this.extractPayslipEarningsTable(lines);
    
    // Extract summary information
    const summaryInfo = this.extractPayslipSummary(lines);
    
    return {
      fileType: originalFileType || 'generic',
      processedAt: new Date().toISOString(),
      hasStructuredData: true,
      tableCount: 2,
      totalRows: (employeeDetails.length + earningsTable.length + (summaryInfo ? 1 : 0)),
      totalColumns: 4,
      tables: [
        {
          id: 'employee_details',
          name: 'Employee Details',
          headers: ['Field', 'Value', 'Category', 'Notes'],
          data: employeeDetails,
          rowCount: employeeDetails.length,
          columnCount: 4,
          confidence: 0.95,
          source: 'payslip_parsing'
        },
        {
          id: 'earnings_deductions',
          name: 'Earnings & Deductions',
          headers: ['Head', 'Current Month Earning', 'Current Month Deduction', 'April To Date Earning', 'April To Date Deduction'],
          data: earningsTable,
          rowCount: earningsTable.length,
          columnCount: 5,
          confidence: 0.9,
          source: 'payslip_parsing'
        },
        ...(summaryInfo ? [{
          id: 'summary_info',
          name: 'Summary Information',
          headers: ['Field', 'Value'],
          data: [summaryInfo],
          rowCount: 1,
          columnCount: 2,
          confidence: 0.95,
          source: 'payslip_parsing'
        }] : [])
      ],
      metadata: {
        extractionMethod: 'payslip_specialized_parser',
        confidence: 0.92,
        detectedStructure: 'payslip',
        documentType: 'payslip',
        sections: ['employee_details', 'earnings_deductions', 'summary']
      }
    };
  }

  private extractPayslipEmployeeDetails(lines: string[]): any[] {
    const details: any[] = [];
    const employeePatterns = [
      { pattern: /employee\s*name\s*:\s*(.+)/i, field: 'Employee Name', category: 'Personal' },
      { pattern: /employee\s*code\s*:\s*(.+)/i, field: 'Employee Code', category: 'Personal' },
      { pattern: /designation\s*:\s*(.+)/i, field: 'Designation', category: 'Professional' },
      { pattern: /department\s*:\s*(.+)/i, field: 'Department', category: 'Professional' },
      { pattern: /joining\s*date\s*:\s*(.+)/i, field: 'Joining Date', category: 'Professional' },
      { pattern: /bank\s*name\s*:\s*(.+)/i, field: 'Bank Name', category: 'Financial' },
      { pattern: /bank\s*account\s*no\s*:\s*(.+)/i, field: 'Bank Account No', category: 'Financial' },
      { pattern: /provident\s*fund\s*no\s*:\s*(.+)/i, field: 'Provident Fund No', category: 'Financial' },
      { pattern: /uan\s*:\s*(.+)/i, field: 'UAN', category: 'Financial' },
      { pattern: /pan\s*:\s*(.+)/i, field: 'PAN', category: 'Financial' },
      { pattern: /payable\s*days\s*:\s*(.+)/i, field: 'Payable Days', category: 'Attendance' },
      { pattern: /paid\s*days\s*:\s*(.+)/i, field: 'Paid Days', category: 'Attendance' },
      { pattern: /location\s*:\s*(.+)/i, field: 'Location', category: 'Professional' }
    ];

    for (const line of lines) {
      for (const pattern of employeePatterns) {
        const match = line.match(pattern.pattern);
        if (match) {
          details.push({
            'Field': pattern.field,
            'Value': match[1].trim(),
            'Category': pattern.category,
            'Notes': ''
          });
          break; // Found a match, move to next line
        }
      }
    }

    return details;
  }

  private async createExcelStructuredTableData(parsedContent: any, extractedText?: string): Promise<any> {
    if (!parsedContent.sheets) {
      return {
        fileType: 'excel',
        processedAt: new Date().toISOString(),
        hasStructuredData: false,
        tableCount: 0,
        totalRows: 0,
        totalColumns: 0,
        error: 'No sheet data found'
      };
    }

    // Check if this is a payslip document (if we have extracted text)
    if (extractedText && this.isPayslipDocument(extractedText)) {
      console.log('💰 Detected payslip document in Excel, using specialized parser...');
      return await this.createPayslipStructuredData(extractedText, 'excel');
    }

    const tables: any[] = [];
    let totalRows = 0;
    let totalColumns = 0;

    Object.entries(parsedContent.sheets).forEach(([sheetName, sheetData]: [string, any]) => {
      if (sheetData.data && Array.isArray(sheetData.data)) {
        const headers = sheetData.headers || [];
        const data = sheetData.data;
        
        tables.push({
          id: `excel_${sheetName.toLowerCase()}`,
          name: sheetName,
          headers: headers,
          data: data,
          rowCount: data.length,
          columnCount: headers.length,
          confidence: 1.0,
          source: 'excel_extraction'
        });

        totalRows += data.length;
        totalColumns = Math.max(totalColumns, headers.length);
      }
    });

    return {
      fileType: 'excel',
      processedAt: new Date().toISOString(),
      hasStructuredData: tables.length > 0,
      tableCount: tables.length,
      totalRows: totalRows,
      totalColumns: totalColumns,
      tables: tables,
      metadata: {
        extractionMethod: 'xlsx',
        confidence: 1.0,
        detectedStructure: 'spreadsheet'
      }
    };
  }

  private async createGenericStructuredTableData(parsedContent: any, extractedText: string): Promise<any> {
    // Check if this is a payslip document
    if (extractedText && this.isPayslipDocument(extractedText)) {
      console.log('💰 Detected payslip document in generic file, using specialized parser...');
      return await this.createPayslipStructuredData(extractedText, 'generic');
    }

    const lines = extractedText ? extractedText.split('\n').filter(line => line.trim().length > 0) : [];
    
    return {
      fileType: 'generic',
      processedAt: new Date().toISOString(),
      hasStructuredData: true,
      tableCount: 1,
      totalRows: lines.length,
      totalColumns: 2,
      tables: [{
        id: 'generic_content_1',
        name: 'File Content',
        headers: ['Line Number', 'Content'],
        data: lines.map((line, index) => ({
          'Line Number': index + 1,
          'Content': line.trim()
        })),
        rowCount: lines.length,
        columnCount: 2,
        confidence: 1.0,
        source: 'generic_extraction'
      }],
      metadata: {
        extractionMethod: 'generic',
        confidence: 1.0,
        detectedStructure: 'text'
      }
    };
  }

  private isTaxableIncome(line: string): string {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('exempt') || lowerLine.includes('non-taxable')) {
      return 'No';
    }
    return 'Yes';
  }

  private isForm16SectionHeader(line: string): boolean {
    const sectionPatterns = [
      /^[0-9]+\.\s*[A-Za-z\s]+$/i,           // "1. Section Name"
      /^[A-Za-z\s]+:$/i,                      // "Section Name:"
      /^[A-Za-z\s]+under section/i,           // "Deduction under section"
      /^Income chargeable under the head/i,    // "Income chargeable under the head"
      /^Total amount of deductions/i,          // "Total amount of deductions"
      /^Add:\s*[A-Za-z\s]+/i,                 // "Add: Any other income"
      /^Gross total income/i,                  // "Gross total income"
      /^Total income/i,                        // "Total income"
      /^Tax on total income/i,                 // "Tax on total income"
      /^Surcharge/i,                           // "Surcharge"
      /^Education cess/i,                      // "Education cess"
      /^Net tax payable/i                      // "Net tax payable"
    ];
    
    return sectionPatterns.some(pattern => pattern.test(line));
  }

  private extractPayslipEarningsTable(lines: string[]): any[] {
    const earningsTable: any[] = [];
    const earningsPatterns = [
      { pattern: /basic\s*salary\s*:\s*([\d,]+\.?\d*)/i, field: 'Basic Salary' },
      { pattern: /house\s*rent\s*allowance\s*:\s*([\d,]+\.?\d*)/i, field: 'House Rent Allowance' },
      { pattern: /conveyance\s*allowance\s*:\s*([\d,]+\.?\d*)/i, field: 'Conveyance Allowance' },
      { pattern: /medical\s*allowance\s*:\s*([\d,]+\.?\d*)/i, field: 'Medical Allowance' },
      { pattern: /special\s*allowance\s*:\s*([\d,]+\.?\d*)/i, field: 'Special Allowance' },
      { pattern: /performance\s*bonus\s*:\s*([\d,]+\.?\d*)/i, field: 'Performance Bonus' },
      { pattern: /overtime\s*:\s*([\d,]+\.?\d*)/i, field: 'Overtime' },
      { pattern: /incentive\s*:\s*([\d,]+\.?\d*)/i, field: 'Incentive' },
      { pattern: /professional\s*tax\s*:\s*([\d,]+\.?\d*)/i, field: 'Professional Tax' },
      { pattern: /income\s*tax\s*:\s*([\d,]+\.?\d*)/i, field: 'Income Tax' },
      { pattern: /provident\s*fund\s*:\s*([\d,]+\.?\d*)/i, field: 'Provident Fund' },
      { pattern: /insurance\s*:\s*([\d,]+\.?\d*)/i, field: 'Insurance' },
      { pattern: /loan\s*repayment\s*:\s*([\d,]+\.?\d*)/i, field: 'Loan Repayment' }
    ];

    for (const line of lines) {
      for (const pattern of earningsPatterns) {
        const match = line.match(pattern.pattern);
        if (match) {
          const amount = parseFloat(match[1].replace(/,/g, ''));
          earningsTable.push({
            'Head': pattern.field,
            'Current Month Earning': amount > 0 ? amount : 0,
            'Current Month Deduction': amount < 0 ? Math.abs(amount) : 0,
            'April To Date Earning': amount > 0 ? amount : 0,
            'April To Date Deduction': amount < 0 ? Math.abs(amount) : 0
          });
          break;
        }
      }
    }

    return earningsTable;
  }

  private extractPayslipSummary(lines: string[]): any {
    let grossPay = 0;
    let totalDeductions = 0;
    let netPay = 0;

    // Look for summary patterns
    const summaryPatterns = [
      { pattern: /gross\s*pay\s*:\s*([\d,]+\.?\d*)/i, field: 'Gross Pay' },
      { pattern: /total\s*deductions\s*:\s*([\d,]+\.?\d*)/i, field: 'Total Deductions' },
      { pattern: /net\s*pay\s*:\s*([\d,]+\.?\d*)/i, field: 'Net Pay' },
      { pattern: /take\s*home\s*:\s*([\d,]+\.?\d*)/i, field: 'Take Home' }
    ];

    for (const line of lines) {
      for (const pattern of summaryPatterns) {
        const match = line.match(pattern.pattern);
        if (match) {
          const amount = parseFloat(match[1].replace(/,/g, ''));
          if (pattern.field === 'Gross Pay') grossPay = amount;
          if (pattern.field === 'Total Deductions') totalDeductions = amount;
          if (pattern.field === 'Net Pay' || pattern.field === 'Take Home') netPay = amount;
        }
      }
    }

    return {
      'Field': 'Summary',
      'Value': `Gross: ${grossPay}, Deductions: ${totalDeductions}, Net: ${netPay}`
    };
  }
}
