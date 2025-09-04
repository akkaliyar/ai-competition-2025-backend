export interface ProcessedFile {
  id: number;
  filename: string;
  originalName: string;
  fileType: 'image' | 'pdf' | 'excel';
  fileSize: number;
  parsedContent?: any;
  structuredTableData?: any;
  extractedText?: string;
  createdAt: string;
  updatedAt?: string;
  
  // New fields for JSON response and key-value data
  jsonResponse?: any; // Raw API response data
  keyValueData?: Record<string, any>; // Structured key-value format
  processingStatus?: string;
  processingDurationMs?: number;
  characterCount?: number;
  wordCount?: number;
  lineCount?: number;
  hasStructuredData?: boolean;
  tableCount?: number;
  averageConfidence?: number;
  mimeType?: string;
  showFormattedJson?: boolean; // For JSON view formatting toggle
  showStructuredData?: boolean; // For generic structured data view toggle
  showSimpleFormat?: boolean; // For simple format view toggle
  showEnhancedText?: boolean; // For enhanced text view toggle
  structuredDocumentData?: any; // Generic structured document data from backend
}

export interface ExcelSheet {
  headers: string[];
  data: Record<string, any>[];
}

export interface ExcelData {
  type: 'spreadsheet';
  sheets: Record<string, ExcelSheet>;
  totalSheets: number;
}

export interface TextData {
  extractedText: string;
  type: 'text';
}

