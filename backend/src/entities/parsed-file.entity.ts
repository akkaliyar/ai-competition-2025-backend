import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum FileType {
  IMAGE = 'image',
  PDF = 'pdf',
  EXCEL = 'excel'
}

export enum ProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

@Entity('parsed_files')
@Index(['fileType', 'processingStatus'])
@Index(['createdAt'])
export class ParsedFile {
  @PrimaryGeneratedColumn()
  id: number;

  // Basic File Information
  @Column({ length: 200 })
  filename: string; // Generated filename on server

  @Column({ length: 200 })
  originalName: string; // Original uploaded filename

  @Column({
    type: 'enum',
    enum: FileType
  })
  fileType: FileType;

  @Column({ length: 100 })
  mimeType: string; // e.g., 'image/jpeg', 'application/pdf'

  @Column({ type: 'bigint' })
  fileSize: number; // File size in bytes

  @Column({ length: 64, nullable: true })
  fileHash: string; // SHA-256 hash for deduplication

  // File Path and Storage
  @Column({ length: 300 })
  filePath: string; // Relative path to stored file

  @Column({ length: 200, nullable: true })
  thumbnailPath: string; // Path to thumbnail (for images)

  // Processing Information
  @Column({
    type: 'enum',
    enum: ProcessingStatus,
    default: ProcessingStatus.PENDING
  })
  processingStatus: ProcessingStatus;

  @Column({ type: 'timestamp', nullable: true })
  processingStartedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  processingCompletedAt: Date;

  @Column({ type: 'int', nullable: true })
  processingDurationMs: number;

  // OCR and Content Data
  @Column({ type: 'longtext', nullable: true })
  extractedText: string; // Raw extracted text

  @Column({ type: 'longtext', nullable: true })
  ocrData: string; // Complete OCR JSON data with confidence scores, bounding boxes, etc.

  @Column({ type: 'json', nullable: true })
  ocrMetadata: any; // OCR processing metadata (language, confidence, etc.)

  @Column({ type: 'longtext', nullable: true })
  parsedContent: string; // Structured parsed content JSON

  @Column({ type: 'longtext', nullable: true })
  structuredTableData: string; // Structured table data for easy table display

  @Column({ type: 'json', nullable: true })
  contentMetadata: any; // Content-specific metadata

  // Statistics
  @Column({ type: 'int', nullable: true })
  characterCount: number;

  @Column({ type: 'int', nullable: true })
  wordCount: number;

  @Column({ type: 'int', nullable: true })
  lineCount: number;

  @Column({ type: 'float', nullable: true })
  averageConfidence: number; // Average OCR confidence score

  // Error Handling
  @Column({ type: 'text', nullable: true })
  errorMessage: string; // Error message if processing failed

  @Column({ type: 'text', nullable: true })
  errorStack: string; // Error stack trace for debugging

  @Column({ type: 'int', default: 0 })
  retryCount: number; // Number of processing retries

  // Additional Metadata
  @Column({ type: 'json', nullable: true })
  imageMetadata: any; // Image dimensions, DPI, color space, etc.

  @Column({ type: 'json', nullable: true })
  pdfMetadata: any; // PDF page count, author, title, etc.

  @Column({ type: 'json', nullable: true })
  excelMetadata: any; // Sheet count, sheet names, etc.

  @Column({ type: 'varchar', length: 50, nullable: true })
  detectedLanguage: string; // Detected text language

  @Column({ type: 'boolean', default: false })
  hasStructuredData: boolean; // Whether file contains tables/structured data

  @Column({ type: 'int', nullable: true })
  tableCount: number; // Number of detected tables

  // User and Session Information
  @Column({ type: 'text', nullable: true })
  userAgent: string; // Browser user agent

  @Column({ length: 45, nullable: true })
  uploadedFromIp: string; // IP address of uploader

  @Column({ length: 100, nullable: true })
  sessionId: string; // Session identifier

  // Timestamps
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastAccessedAt: Date;

  // Computed Properties
  getProcessingDuration(): number | null {
    if (this.processingStartedAt && this.processingCompletedAt) {
      return this.processingCompletedAt.getTime() - this.processingStartedAt.getTime();
    }
    return null;
  }

  isProcessingComplete(): boolean {
    return this.processingStatus === ProcessingStatus.COMPLETED;
  }

  isProcessingFailed(): boolean {
    return this.processingStatus === ProcessingStatus.FAILED;
  }

  getFileSizeFormatted(): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (this.fileSize === 0) return '0 Bytes';
    const i = Math.floor(Math.log(this.fileSize) / Math.log(1024));
    return Math.round((this.fileSize / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
