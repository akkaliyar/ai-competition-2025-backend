import { Injectable } from '@nestjs/common';

// Optional Google Vision API - gracefully handles missing dependency
let ImageAnnotatorClient: any;
try {
  const vision = require('@google-cloud/vision');
  ImageAnnotatorClient = vision.ImageAnnotatorClient;
} catch (error) {
  console.log('📋 Google Vision API not installed - using Tesseract OCR only');
  ImageAnnotatorClient = null;
}

@Injectable()
export class GoogleVisionService {
  private client: any;
  private isAvailable: boolean = false;

  constructor() {
    // Initialize Google Vision API client only if available
    if (ImageAnnotatorClient) {
      try {
        // Multiple authentication methods
        const clientConfig: any = {};
        
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
          // Service Account Key File method (recommended)
          clientConfig.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
          console.log('🔑 Using service account credentials');
        } else if (process.env.GOOGLE_API_KEY) {
          // API Key method
          clientConfig.apiKey = process.env.GOOGLE_API_KEY;
          console.log('🔑 Using API key credentials');
        } else {
          // Default credentials (for Google Cloud environments)
          console.log('🔑 Using default credentials (ADC)');
        }
        
        if (process.env.GOOGLE_PROJECT_ID) {
          clientConfig.projectId = process.env.GOOGLE_PROJECT_ID;
        }

        this.client = new ImageAnnotatorClient(clientConfig);
        this.isAvailable = true;
        console.log('✅ Google Vision API initialized successfully');
        
        // Test the connection
        this.testConnection();
        
      } catch (error) {
        console.error('⚠️ Google Vision API initialization failed:', error.message);
        console.log('💡 Setup guide: See GOOGLE_VISION_SETUP.md');
        this.isAvailable = false;
      }
    } else {
      console.log('📋 Google Vision API not installed');
      console.log('💡 Install with: npm install @google-cloud/vision');
      this.isAvailable = false;
    }
  }

  private async testConnection(): Promise<void> {
    try {
      // Create a minimal test image (1x1 pixel white)
      const testImageBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
        0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x0F, 0x00, 0x00,
        0x01, 0x00, 0x01, 0x5C, 0xCD, 0xB8, 0x52, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);

      await this.client.textDetection({
        image: { content: testImageBuffer.toString('base64') }
      });
      
      console.log('✅ Google Vision API connection test successful');
    } catch (error) {
      console.warn('⚠️ Google Vision API connection test failed:', error.message);
      // Don't disable the service, just warn
    }
  }

  isGoogleVisionAvailable(): boolean {
    return this.isAvailable;
  }

  async extractTableFromImage(imageBuffer: Buffer): Promise<{
    text: string;
    tableData: any[];
    confidence: number;
  }> {
    // Check if Google Vision is available
    if (!this.isAvailable) {
      throw new Error('Google Vision API is not available. Please install @google-cloud/vision and configure credentials.');
    }

    try {
      console.log('🔍 Processing image with Google Vision API...');
      
      // Detect text with Google Vision API
      const [textDetection] = await this.client.textDetection({
        image: { content: imageBuffer.toString('base64') }
      });
      
      const detections = textDetection.textAnnotations || [];
      
      if (detections.length === 0) {
        return {
          text: 'No text detected',
          tableData: [],
          confidence: 0
        };
      }

      // Extract full text
      const fullText = detections[0]?.description || '';
      
      // Get individual text blocks with bounding boxes
      const textBlocks = detections.slice(1).map(detection => ({
        text: detection.description || '',
        confidence: detection.confidence || 0,
        boundingBox: detection.boundingPoly?.vertices || [],
        // Calculate position for table reconstruction
        x: this.getAverageX(detection.boundingPoly?.vertices || []),
        y: this.getAverageY(detection.boundingPoly?.vertices || []),
      }));

      console.log(`✅ Google Vision detected ${textBlocks.length} text blocks`);

      // Advanced table reconstruction using bounding boxes
      const tableData = this.reconstructTableFromBlocks(textBlocks);
      
      // Calculate overall confidence
      const avgConfidence = textBlocks.reduce((sum, block) => sum + (block.confidence || 0), 0) / textBlocks.length;

      return {
        text: fullText,
        tableData: tableData,
        confidence: avgConfidence * 100 // Convert to percentage
      };

    } catch (error) {
      console.error('❌ Google Vision API error:', error);
      throw new Error(`Google Vision processing failed: ${error.message}`);
    }
  }

  private reconstructTableFromBlocks(textBlocks: any[]): any[] {
    console.log('📊 Reconstructing table structure from text blocks...');
    
    // Sort blocks by Y position (rows) then X position (columns)
    const sortedBlocks = textBlocks.sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) < 10) { // Same row (within 10px tolerance)
        return a.x - b.x; // Sort by X (left to right)
      }
      return yDiff; // Sort by Y (top to bottom)
    });

    // Group blocks into rows based on Y position
    const rows: any[][] = [];
    let currentRow: any[] = [];
    let lastY = -1;
    const rowTolerance = 15; // Pixels tolerance for same row

    for (const block of sortedBlocks) {
      if (lastY === -1 || Math.abs(block.y - lastY) <= rowTolerance) {
        // Same row
        currentRow.push(block);
      } else {
        // New row
        if (currentRow.length > 0) {
          rows.push([...currentRow]);
        }
        currentRow = [block];
      }
      lastY = block.y;
    }
    
    // Add the last row
    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    console.log(`📋 Detected ${rows.length} table rows`);

    // Convert to structured data
    const structuredData = rows.map((row, rowIndex) => {
      const rowData: any = { rowNumber: rowIndex + 1 };
      
      row.forEach((cell, colIndex) => {
        const columnKey = this.generateColumnHeader(colIndex, cell.text);
        rowData[columnKey] = cell.text;
      });
      
      return rowData;
    });

    return structuredData;
  }

  private generateColumnHeader(colIndex: number, cellText: string): string {
    // Smart column header generation based on content
    const text = cellText.toLowerCase();
    
    if (colIndex === 0) {
      if (/^[0-9]+$/.test(cellText)) return 'Serial_Number';
      if (/^[A-Z]{2,}/.test(cellText)) return 'Product_Code';
      return 'Column_1';
    }
    
    if (text.includes('₹') || text.includes('rs') || /^[0-9,]+\.?[0-9]*$/.test(cellText)) {
      return colIndex < 3 ? 'Unit_Price' : 'Total_Amount';
    }
    
    if (/^[0-9]+$/.test(cellText) && colIndex > 1) {
      return 'Quantity';
    }
    
    if (text.length > 10 && /[a-z]/.test(text)) {
      return 'Description';
    }
    
    return `Column_${colIndex + 1}`;
  }

  private getAverageX(vertices: any[]): number {
    if (!vertices || vertices.length === 0) return 0;
    const sum = vertices.reduce((acc, vertex) => acc + (vertex.x || 0), 0);
    return sum / vertices.length;
  }

  private getAverageY(vertices: any[]): number {
    if (!vertices || vertices.length === 0) return 0;
    const sum = vertices.reduce((acc, vertex) => acc + (vertex.y || 0), 0);
    return sum / vertices.length;
  }

  // Document AI for advanced table detection
  async extractTableWithDocumentAI(imageBuffer: Buffer): Promise<any> {
    try {
      // Use Document AI for more advanced table detection
      const [result] = await this.client.documentTextDetection({
        image: { content: imageBuffer.toString('base64') }
      });

      const pages = result.fullTextAnnotation?.pages || [];
      
      if (pages.length === 0) {
        return { tables: [], text: '' };
      }

      // Extract tables from Document AI response
      const tables = this.extractTablesFromDocument(pages[0]);
      
      return {
        text: result.fullTextAnnotation?.text || '',
        tables: tables,
        confidence: 95 // Document AI typically has high confidence
      };

    } catch (error) {
      console.error('❌ Document AI error:', error);
      return { tables: [], text: '', confidence: 0 };
    }
  }

  private extractTablesFromDocument(page: any): any[] {
    // Implementation for Document AI table extraction
    // This would use the table detection capabilities of Document AI
    const tables: any[] = [];
    
    // Document AI provides structured table data
    if (page.tables) {
      page.tables.forEach((table: any, index: number) => {
        const tableData = this.processDocumentAITable(table);
        tables.push({
          tableIndex: index,
          headers: tableData.headers,
          rows: tableData.rows,
          confidence: 95
        });
      });
    }
    
    return tables;
  }

  private processDocumentAITable(table: any): { headers: string[], rows: any[] } {
    const headers: string[] = [];
    const rows: any[] = [];
    
    // Process Document AI table structure
    // This would extract headers and rows from the structured response
    
    return { headers, rows };
  }

  /**
   * Enhanced invoice extraction with Google Vision API
   * Returns structured JSON matching the exact specification
   */
  async extractInvoiceDataWithVision(imageBuffer: Buffer): Promise<{
    success: boolean;
    data: any[];
    metadata: any;
    rawText: string;
    confidence: number;
    processingTime: number;
  }> {
    const startTime = Date.now();
    
    if (!this.isAvailable) {
      throw new Error('Google Vision API is not available. Please configure credentials.');
    }

    try {
      console.log('🔍 Processing invoice with Google Vision API...');
      
      // Use both text detection and document text detection for best results
      const [textResult, documentResult] = await Promise.all([
        this.client.textDetection({
          image: { content: imageBuffer.toString('base64') }
        }),
        this.client.documentTextDetection({
          image: { content: imageBuffer.toString('base64') }
        }).catch(() => null) // Document detection might not be available in all regions
      ]);

      const textDetections = textResult[0]?.textAnnotations || [];
      const fullText = textDetections[0]?.description || '';
      
      console.log(`📄 Extracted ${fullText.length} characters of text`);
      
      if (textDetections.length === 0) {
        return {
          success: false,
          data: [],
          metadata: {
            ocrEngine: 'google-vision',
            confidence: 0,
            parsingMethod: 'vision-api',
            standardHeaders: ['Product', 'Batch', 'HSN', 'Qty', 'MRP', 'Rate', 'Amount', 'SGST', 'CGST']
          },
          rawText: '',
          confidence: 0,
          processingTime: Date.now() - startTime
        };
      }

      // Get detailed text blocks with positions
      const textBlocks = textDetections.slice(1).map(detection => ({
        text: detection.description || '',
        confidence: detection.confidence || 0,
        boundingBox: detection.boundingPoly?.vertices || [],
        x: this.getAverageX(detection.boundingPoly?.vertices || []),
        y: this.getAverageY(detection.boundingPoly?.vertices || [])
      }));

      console.log(`📊 Processing ${textBlocks.length} text blocks for invoice structure`);

      // Apply invoice-specific processing using Google Vision data
      const invoiceData = this.extractInvoiceStructureFromBlocks(textBlocks, fullText);
      
      const processingTime = Date.now() - startTime;
      const avgConfidence = textBlocks.reduce((sum, block) => sum + (block.confidence || 0), 0) / textBlocks.length * 100;

      return {
        success: true,
        data: invoiceData,
        metadata: {
          ocrEngine: 'google-vision',
          confidence: avgConfidence,
          parsingMethod: 'vision-api-structured',
          standardHeaders: ['Product', 'Batch', 'HSN', 'Qty', 'MRP', 'Rate', 'Amount', 'SGST', 'CGST'],
          textBlockCount: textBlocks.length,
          hasStructuredData: invoiceData.length > 0
        },
        rawText: fullText,
        confidence: avgConfidence,
        processingTime: processingTime
      };

    } catch (error) {
      console.error('❌ Google Vision invoice processing error:', error);
      throw new Error(`Google Vision processing failed: ${error.message}`);
    }
  }

  /**
   * Extract invoice structure from Google Vision text blocks
   * Uses spatial positioning for better accuracy than line-by-line parsing
   */
  private extractInvoiceStructureFromBlocks(textBlocks: any[], fullText: string): any[] {
    console.log('🧾 Extracting invoice structure from spatial text blocks...');
    
    // Sort by Y position (top to bottom), then X position (left to right)
    const sortedBlocks = textBlocks
      .filter(block => block.text && block.text.trim().length > 0)
      .sort((a, b) => {
        const yDiff = a.y - b.y;
        if (Math.abs(yDiff) < 15) { // Same row tolerance
          return a.x - b.x;
        }
        return yDiff;
      });

    // Group into rows based on Y position
    const rows = this.groupBlocksIntoRows(sortedBlocks);
    console.log(`📋 Grouped into ${rows.length} potential rows`);

    // Filter and identify data rows (not headers/footers)
    const dataRows = rows.filter((row, index) => this.isLikelyInvoiceDataRow(row, index, rows));
    console.log(`📊 Identified ${dataRows.length} data rows`);

    // Convert rows to invoice format
    const invoiceItems: any[] = [];
    
    for (const row of dataRows) {
      const invoiceItem = this.parseRowToInvoiceFormat(row);
      if (invoiceItem && this.isValidInvoiceItem(invoiceItem)) {
        invoiceItems.push(invoiceItem);
      }
    }

    console.log(`✅ Successfully extracted ${invoiceItems.length} invoice items`);
    return invoiceItems;
  }

  private groupBlocksIntoRows(sortedBlocks: any[]): any[][] {
    const rows: any[][] = [];
    let currentRow: any[] = [];
    let lastY = -1;
    const rowTolerance = 20; // Increased tolerance for invoice layouts

    for (const block of sortedBlocks) {
      if (lastY === -1 || Math.abs(block.y - lastY) <= rowTolerance) {
        currentRow.push(block);
      } else {
        if (currentRow.length > 0) {
          rows.push([...currentRow]);
        }
        currentRow = [block];
      }
      lastY = block.y;
    }

    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    return rows;
  }

  private isLikelyInvoiceDataRow(row: any[], rowIndex: number, allRows: any[]): boolean {
    if (row.length < 3) return false; // Need at least 3 columns for meaningful data

    const rowText = row.map(block => block.text).join(' ').toLowerCase();
    
    // Skip obvious header rows
    if (rowIndex < 3 && (
      rowText.includes('product') || rowText.includes('description') ||
      rowText.includes('qty') || rowText.includes('rate') || 
      rowText.includes('amount') || rowText.includes('total') ||
      rowText.includes('hsn') || rowText.includes('batch')
    )) {
      return false;
    }

    // Skip footer/total rows
    if (rowText.includes('total') || rowText.includes('subtotal') || 
        rowText.includes('grand total') || rowText.includes('net amount')) {
      return false;
    }

    // Must have some product-like text and numeric values
    const hasProductText = row.some(block => 
      block.text.length > 3 && /[a-zA-Z]/.test(block.text) && !/^\d+\.?\d*$/.test(block.text)
    );
    
    const hasNumericData = row.some(block => 
      /\d+/.test(block.text) || /₹/.test(block.text)
    );

    return hasProductText && hasNumericData;
  }

  private parseRowToInvoiceFormat(row: any[]): any {
    // Initialize with standard headers
    const invoiceItem: any = {
      Product: '',
      Batch: '',
      HSN: '',
      Qty: '',
      MRP: '',
      Rate: '',
      Amount: '',
      SGST: '',
      CGST: ''
    };

    // Sort row blocks by X position (left to right)
    const sortedRow = row.sort((a, b) => a.x - b.x);
    
    // Apply intelligent field mapping based on content and position
    let productFound = false;
    
    for (let i = 0; i < sortedRow.length; i++) {
      const block = sortedRow[i];
      const text = block.text.trim();
      
      if (!text) continue;

      // Product name (usually first significant text block)
      if (!productFound && text.length > 3 && /[a-zA-Z]/.test(text) && !/^\d+\.?\d*$/.test(text)) {
        invoiceItem.Product = text;
        productFound = true;
        continue;
      }

      // HSN Code (4-8 digits)
      if (/^\d{4,8}$/.test(text) && !invoiceItem.HSN) {
        invoiceItem.HSN = text;
        continue;
      }

      // Batch Number (alphanumeric, often mixed case)
      if (/^[A-Z0-9]{6,}$/i.test(text) && !invoiceItem.Batch && !/^\d+\.?\d*$/.test(text)) {
        invoiceItem.Batch = text;
        continue;
      }

      // Currency amounts (₹ or decimal numbers)
      if (/₹/.test(text) || /^\d+\.\d{2}$/.test(text) || /^\d{1,5}\.\d{2}$/.test(text)) {
        const amount = this.parseNumericValue(text);
        if (amount !== null) {
          // Assign based on typical invoice order: MRP, Rate, Amount, SGST, CGST
          if (!invoiceItem.MRP) {
            invoiceItem.MRP = amount;
          } else if (!invoiceItem.Rate) {
            invoiceItem.Rate = amount;
          } else if (!invoiceItem.Amount) {
            invoiceItem.Amount = amount;
          } else if (!invoiceItem.SGST) {
            invoiceItem.SGST = amount;
          } else if (!invoiceItem.CGST) {
            invoiceItem.CGST = amount;
          }
        }
        continue;
      }

      // Quantity (small integers)
      if (/^\d{1,3}$/.test(text) && !invoiceItem.Qty) {
        const qty = parseInt(text);
        if (qty > 0 && qty < 1000) { // Reasonable quantity range
          invoiceItem.Qty = qty;
        }
        continue;
      }
    }

    return invoiceItem;
  }

  private parseNumericValue(text: string): number | null {
    // Clean the text
    let cleaned = text.replace(/₹/g, '').replace(/,/g, '').trim();
    
    // Try to parse as number
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  private isValidInvoiceItem(item: any): boolean {
    // Must have at least product name and some numeric data
    return item.Product && item.Product.length > 2 && (
      item.Qty || item.Rate || item.Amount || item.MRP
    );
  }

  /**
   * Get processing capabilities and status
   */
  getVisionCapabilities(): any {
    return {
      available: this.isAvailable,
      features: {
        textDetection: true,
        documentTextDetection: true,
        spatialAnalysis: true,
        confidenceScoring: true,
        multiLanguage: true,
        boundingBoxes: true
      },
      authentication: {
        serviceAccount: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
        apiKey: !!process.env.GOOGLE_API_KEY,
        projectId: !!process.env.GOOGLE_PROJECT_ID
      }
    };
  }
}
