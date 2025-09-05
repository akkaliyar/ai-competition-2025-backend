import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillData, BillType, BillStatus } from '../entities/bill-data.entity';
import { ParsedFile } from '../entities/parsed-file.entity';

@Injectable()
export class BillExtractionService {
  constructor(
    @InjectRepository(BillData)
    private billDataRepository: Repository<BillData>,
    @InjectRepository(ParsedFile)
    private parsedFileRepository: Repository<ParsedFile>,
  ) {}

  async extractAndStoreBillData(parsedFile: ParsedFile): Promise<BillData> {
    // console.log(`🔍 Extracting bill data from file: ${parsedFile.originalName}`);

    try {
      // Determine bill type based on content
      const billType = this.detectBillType(parsedFile);
      // console.log(`📋 Detected bill type: ${billType}`);

      // Extract structured data
      let extractedData: any = {};
      if (parsedFile.parsedContent) {
        try {
          extractedData = JSON.parse(parsedFile.parsedContent);
        } catch (e) {
          // console.warn('Failed to parse parsedContent JSON:', e.message);
        }
      }

      // Create bill data entity
      const billData = new BillData();
      billData.processedFileId = parsedFile.id;
      billData.billType = billType;
      billData.billStatus = BillStatus.PROCESSED;
      billData.confidence = parsedFile.averageConfidence || 0.8;
      billData.extractedFields = extractedData;
      billData.processedAt = new Date();

      // Extract specific data based on bill type
      if (billType === BillType.PAYSLIP) {
        await this.extractPayslipData(billData, extractedData, parsedFile.extractedText);
      } else if (billType === BillType.INVOICE) {
        await this.extractInvoiceData(billData, extractedData, parsedFile.extractedText);
      } else {
        await this.extractGenericBillData(billData, extractedData, parsedFile.extractedText);
      }

      // Save to database
      const savedBillData = await this.billDataRepository.save(billData);
      // console.log(`✅ Bill data extracted and saved with ID: ${savedBillData.id}`);

      return savedBillData;
    } catch (error) {
      // console.error('❌ Error extracting bill data:', error);
      throw new Error(`Bill data extraction failed: ${error.message}`);
    }
  }

  private detectBillType(parsedFile: ParsedFile): BillType {
    const text = parsedFile.extractedText || '';
    const lowerText = text.toLowerCase();

    // Check for payslip indicators
    if (this.isPayslipDocument(lowerText)) {
      return BillType.PAYSLIP;
    }

    // Check for invoice indicators
    if (this.isInvoiceDocument(lowerText)) {
      return BillType.INVOICE;
    }

    // Check for receipt indicators
    if (this.isReceiptDocument(lowerText)) {
      return BillType.RECEIPT;
    }

    // Check for expense bill indicators
    if (this.isExpenseBill(lowerText)) {
      return BillType.EXPENSE;
    }

    return BillType.OTHER;
  }

  private isPayslipDocument(text: string): boolean {
    const payslipKeywords = [
      'payslip', 'salary', 'employee', 'earnings', 'deductions',
      'basic', 'allowance', 'pf', 'income tax', 'net salary',
      'payable days', 'paid days', 'joining date', 'employee code'
    ];
    
    const keywordMatches = payslipKeywords.filter(keyword => 
      text.includes(keyword)
    );
    
    return keywordMatches.length >= 3;
  }

  private isInvoiceDocument(text: string): boolean {
    const invoiceKeywords = [
      'invoice', 'bill to', 'ship to', 'due date', 'payment terms',
      'subtotal', 'tax', 'total amount', 'invoice number', 'po number'
    ];
    
    const keywordMatches = invoiceKeywords.filter(keyword => 
      text.includes(keyword)
    );
    
    return keywordMatches.length >= 3;
  }

  private isReceiptDocument(text: string): boolean {
    const receiptKeywords = [
      'receipt', 'thank you', 'payment received', 'transaction id',
      'amount paid', 'change', 'balance', 'receipt number'
    ];
    
    const keywordMatches = receiptKeywords.filter(keyword => 
      text.includes(keyword)
    );
    
    return keywordMatches.length >= 2;
  }

  private isExpenseBill(text: string): boolean {
    const expenseKeywords = [
      'expense', 'reimbursement', 'travel', 'meal', 'transport',
      'office supplies', 'utilities', 'rent', 'maintenance'
    ];
    
    const keywordMatches = expenseKeywords.filter(keyword => 
      text.includes(keyword)
    );
    
    return keywordMatches.length >= 2;
  }

  private async extractPayslipData(billData: BillData, extractedData: any, rawText: string): Promise<void> {
    // console.log('💰 Extracting payslip data...');

    // Extract employee details
    if (extractedData.tables) {
      const employeeTable = extractedData.tables.find((t: any) => 
        t.name?.toLowerCase().includes('employee') || 
        t.id?.toLowerCase().includes('employee')
      );

      if (employeeTable && employeeTable.data) {
        for (const row of employeeTable.data) {
          if (row.Field && row.Value) {
            const field = row.Field.toLowerCase();
            const value = row.Value;

            if (field.includes('name')) {
              billData.customerName = value;
            } else if (field.includes('code') || field.includes('id')) {
              billData.customerId = value;
            } else if (field.includes('department')) {
              billData.customerDepartment = value;
            } else if (field.includes('designation')) {
              billData.customerDesignation = value;
            }
          }
        }
      }

      // Extract earnings/deductions
      const earningsTable = extractedData.tables.find((t: any) => 
        t.name?.toLowerCase().includes('earnings') || 
        t.id?.toLowerCase().includes('earnings')
      );

      if (earningsTable && earningsTable.data) {
        let totalEarnings = 0;
        let totalDeductions = 0;

        for (const row of earningsTable.data) {
          if (row.Head && row['Current Month Earning']) {
            const earning = parseFloat(row['Current Month Earning']) || 0;
            const deduction = parseFloat(row['Current Month Deduction']) || 0;

            if (row.Head.toLowerCase().includes('basic')) {
              billData.basicSalary = earning;
            }

            totalEarnings += earning;
            totalDeductions += deduction;
          }
        }

        billData.allowances = totalEarnings - (billData.basicSalary || 0);
        billData.deductions = totalDeductions;
        billData.netSalary = totalEarnings - totalDeductions;
        billData.totalAmount = billData.netSalary;
      }
    }

    // Extract dates and other info from raw text
    this.extractDatesFromText(billData, rawText);
    this.extractVendorInfoFromText(billData, rawText);
  }

  private async extractInvoiceData(billData: BillData, extractedData: any, rawText: string): Promise<void> {
    // console.log('📄 Extracting invoice data...');

    // Extract vendor information
    if (extractedData.tables) {
      const vendorTable = extractedData.tables.find((t: any) => 
        t.name?.toLowerCase().includes('vendor') || 
        t.name?.toLowerCase().includes('company') ||
        t.name?.toLowerCase().includes('from')
      );

      if (vendorTable && vendorTable.data) {
        for (const row of vendorTable.data) {
          if (row.Field && row.Value) {
            const field = row.Field.toLowerCase();
            const value = row.Value;

            if (field.includes('name') || field.includes('company')) {
              billData.vendorName = value;
            } else if (field.includes('address')) {
              billData.vendorAddress = value;
            } else if (field.includes('phone')) {
              billData.vendorPhone = value;
            } else if (field.includes('email')) {
              billData.vendorEmail = value;
            } else if (field.includes('tax') || field.includes('gst') || field.includes('pan')) {
              billData.vendorTaxId = value;
            }
          }
        }
      }

      // Extract line items
      const itemsTable = extractedData.tables.find((t: any) => 
        t.name?.toLowerCase().includes('item') || 
        t.name?.toLowerCase().includes('description') ||
        t.headers?.some((h: string) => h.toLowerCase().includes('item') || h.toLowerCase().includes('description'))
      );

      if (itemsTable && itemsTable.data) {
        billData.lineItems = itemsTable.data;
        billData.itemDescription = itemsTable.data.map((row: any) => 
          row.Description || row.Item || row.ItemDescription || 'Unknown Item'
        ).join(', ');
      }
    }

    // Extract amounts and dates
    this.extractAmountsFromText(billData, rawText);
    this.extractDatesFromText(billData, rawText);
    this.extractDocumentNumberFromText(billData, rawText);
  }

  private async extractGenericBillData(billData: BillData, extractedData: any, rawText: string): Promise<void> {
    // console.log('📋 Extracting generic bill data...');

    // Try to extract any structured data available
    if (extractedData.tables && extractedData.tables.length > 0) {
      const firstTable = extractedData.tables[0];
      if (firstTable.data && firstTable.data.length > 0) {
        // Look for key-value pairs
        for (const row of firstTable.data) {
          if (row.Field && row.Value) {
            const field = row.Field.toLowerCase();
            const value = row.Value;

            if (field.includes('amount') || field.includes('total')) {
              const amount = this.extractAmount(value);
              if (amount > 0) {
                billData.totalAmount = amount;
              }
            } else if (field.includes('date')) {
              const date = this.extractDate(value);
              if (date) {
                billData.billDate = date;
              }
            } else if (field.includes('name') || field.includes('company')) {
              billData.vendorName = value;
            }
          }
        }
      }
    }

    // Extract from raw text as fallback
    this.extractAmountsFromText(billData, rawText);
    this.extractDatesFromText(billData, rawText);
    this.extractVendorInfoFromText(billData, rawText);
  }

  private extractAmountsFromText(billData: BillData, text: string): void {
    // Look for currency amounts
    const amountPatterns = [
      /(?:total|amount|sum|payable|due|balance)[\s:]*[₹$]?\s*([\d,]+\.?\d*)/gi,
      /[₹$]\s*([\d,]+\.?\d*)/g,
      /([\d,]+\.?\d*)\s*(?:rupees?|rs|dollars?|usd)/gi
    ];

    for (const pattern of amountPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          const amount = this.extractAmount(match);
          if (amount > 0 && (!billData.totalAmount || amount > billData.totalAmount)) {
            billData.totalAmount = amount;
          }
        }
      }
    }
  }

  private extractDatesFromText(billData: BillData, text: string): void {
    // Look for dates
    const datePatterns = [
      /(?:date|issued|created|due)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g,
      /(\d{4}[\-]\d{1,2}[\-]\d{1,2})/g
    ];

    for (const pattern of datePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          const date = this.extractDate(match);
          if (date) {
            if (!billData.billDate) {
              billData.billDate = date;
            } else if (!billData.dueDate && match.toLowerCase().includes('due')) {
              billData.dueDate = date;
            }
          }
        }
      }
    }
  }

  private extractVendorInfoFromText(billData: BillData, text: string): void {
    // Look for company/vendor names
    const vendorPatterns = [
      /(?:from|company|vendor|issued by)[\s:]*([A-Z][A-Za-z\s&]+(?:Ltd|Inc|Corp|Company|Pvt|Limited))/gi,
      /([A-Z][A-Za-z\s&]+(?:Ltd|Inc|Corp|Company|Pvt|Limited))/g
    ];

    for (const pattern of vendorPatterns) {
      const matches = text.match(pattern);
      if (matches && !billData.vendorName) {
        billData.vendorName = matches[0].trim();
        break;
      }
    }
  }

  private extractDocumentNumberFromText(billData: BillData, text: string): void {
    // Look for document numbers
    const numberPatterns = [
      /(?:invoice|bill|receipt|document)[\s#]*number[\s:]*([A-Z0-9\-]+)/gi,
      /(?:inv|bill|rec)[\s#]*([A-Z0-9\-]+)/gi,
      /([A-Z]{2,3}[\-]?\d{4,8})/g
    ];

    for (const pattern of numberPatterns) {
      const matches = text.match(pattern);
      if (matches && !billData.documentNumber) {
        billData.documentNumber = matches[0].trim();
        break;
      }
    }
  }

  private extractAmount(text: string): number {
    const cleanText = text.replace(/[^\d.,]/g, '');
    if (cleanText.includes(',')) {
      return parseFloat(cleanText.replace(/,/g, ''));
    }
    return parseFloat(cleanText) || 0;
  }

  private extractDate(text: string): Date | null {
    try {
      // Handle various date formats
      const cleanText = text.trim();
      
      // DD/MM/YYYY or MM/DD/YYYY
      if (cleanText.includes('/')) {
        const parts = cleanText.split('/');
        if (parts.length === 3) {
          // Assume DD/MM/YYYY for Indian format
          const day = parseInt(parts[0]);
          const month = parseInt(parts[1]) - 1;
          let year = parseInt(parts[2]);
          
          if (year < 100) {
            year += 2000; // Convert YY to YYYY
          }
          
          return new Date(year, month, day);
        }
      }
      
      // YYYY-MM-DD
      if (cleanText.includes('-')) {
        return new Date(cleanText);
      }
      
      return null;
    } catch (e) {
      return null;
    }
  }

  async getAllBillData(): Promise<BillData[]> {
    return await this.billDataRepository.find({
      relations: ['processedFile'],
      order: { createdAt: 'DESC' }
    });
  }

  async getBillDataById(id: number): Promise<BillData> {
    return await this.billDataRepository.findOne({
      where: { id },
      relations: ['processedFile']
    });
  }

  async updateBillStatus(id: number, status: BillStatus, notes?: string): Promise<BillData> {
    const billData = await this.billDataRepository.findOne({ where: { id } });
    if (!billData) {
      throw new Error('Bill data not found');
    }

    billData.billStatus = status;
    if (notes) {
      billData.notes = notes;
    }

    return await this.billDataRepository.save(billData);
  }

  async getBillDataByType(billType: BillType): Promise<BillData[]> {
    return await this.billDataRepository.find({
      where: { billType },
      relations: ['processedFile'],
      order: { createdAt: 'DESC' }
    });
  }

  async getBillDataByStatus(status: BillStatus): Promise<BillData[]> {
    return await this.billDataRepository.find({
      where: { billStatus: status },
      relations: ['processedFile'],
      order: { createdAt: 'DESC' }
    });
  }
}
