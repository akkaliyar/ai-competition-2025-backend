import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { ParsedFile } from './parsed-file.entity';

@Entity('ocr_results')
@Index(['parsedFileId'])
export class OcrResult {
  @PrimaryGeneratedColumn()
  id: number;

  // Foreign Key to ParsedFile
  @Column()
  parsedFileId: number;

  @ManyToOne(() => ParsedFile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parsedFileId' })
  parsedFile: ParsedFile;

  // OCR Engine Information
  @Column({ length: 50 })
  ocrEngine: string; // 'tesseract', 'google-vision', etc.

  @Column({ length: 50 })
  ocrVersion: string; // Engine version

  @Column({ length: 10 })
  language: string; // Language code (e.g., 'eng', 'spa')

  // Page/Region Information
  @Column({ type: 'int', default: 1 })
  pageNumber: number;

  @Column({ type: 'int', nullable: true })
  regionId: number; // For multi-region processing

  // Raw OCR Results
  @Column({ type: 'longtext' })
  rawText: string; // Complete extracted text

  @Column({ type: 'json', nullable: true })
  wordLevelData: any; // Word-level bounding boxes and confidence

  @Column({ type: 'json', nullable: true })
  lineLevelData: any; // Line-level data

  @Column({ type: 'json', nullable: true })
  paragraphLevelData: any; // Paragraph-level data

  @Column({ type: 'json', nullable: true })
  blockLevelData: any; // Block-level data

  // Confidence and Quality Metrics
  @Column({ type: 'float', nullable: true })
  overallConfidence: number; // Overall confidence score (0-100)

  @Column({ type: 'float', nullable: true })
  averageWordConfidence: number;

  @Column({ type: 'float', nullable: true })
  averageLineConfidence: number;

  @Column({ type: 'int', nullable: true })
  lowConfidenceWordCount: number; // Words below threshold

  @Column({ type: 'float', nullable: true })
  confidenceThreshold: number; // Threshold used

  // Processing Information
  @Column({ type: 'int' })
  processingTimeMs: number;

  @Column({ type: 'json', nullable: true })
  processingOptions: any; // OCR options used

  @Column({ type: 'json', nullable: true })
  imagePreprocessing: any; // Image preprocessing applied

  // Text Analysis
  @Column({ type: 'int' })
  characterCount: number;

  @Column({ type: 'int' })
  wordCount: number;

  @Column({ type: 'int' })
  lineCount: number;

  @Column({ type: 'int', nullable: true })
  sentenceCount: number;

  @Column({ type: 'int', nullable: true })
  paragraphCount: number;

  // Detected Features
  @Column({ type: 'boolean', default: false })
  hasNumericData: boolean;

  @Column({ type: 'boolean', default: false })
  hasTabularData: boolean;

  @Column({ type: 'boolean', default: false })
  hasFormData: boolean;

  @Column({ type: 'json', nullable: true })
  detectedTables: any; // Table structure information

  @Column({ type: 'json', nullable: true })
  detectedFields: any; // Form fields detected

  // Quality Indicators
  @Column({ type: 'varchar', length: 50, nullable: true })
  imageQuality: string; // 'high', 'medium', 'low', 'poor'

  @Column({ type: 'varchar', length: 50, nullable: true })
  textOrientation: string; // 'normal', 'rotated', 'skewed'

  @Column({ type: 'boolean', default: false })
  hasNoise: boolean;

  @Column({ type: 'boolean', default: false })
  hasBlur: boolean;

  @Column({ type: 'float', nullable: true })
  skewAngle: number; // Detected skew angle in degrees

  // Error Information
  @Column({ type: 'text', nullable: true })
  warnings: string; // Processing warnings

  @Column({ type: 'text', nullable: true })
  errors: string; // Processing errors

  @CreateDateColumn()
  createdAt: Date;

  // Helper Methods
  getQualityScore(): number {
    let score = 0;
    if (this.overallConfidence) score += (this.overallConfidence / 100) * 40;
    if (!this.hasNoise) score += 20;
    if (!this.hasBlur) score += 20;
    if (this.imageQuality === 'high') score += 20;
    else if (this.imageQuality === 'medium') score += 10;
    return Math.min(100, score);
  }

  isHighQuality(): boolean {
    return this.getQualityScore() >= 80 && this.overallConfidence >= 80;
  }

  needsReprocessing(): boolean {
    return this.getQualityScore() < 50 || this.overallConfidence < 60;
  }
}

