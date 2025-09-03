import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ParsedFile } from './parsed-file.entity';

@Entity('file_metadata')
export class FileMetadata {
  @PrimaryGeneratedColumn()
  id: number;

  // Foreign Key to ParsedFile
  @Column()
  parsedFileId: number;

  @OneToOne(() => ParsedFile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parsedFileId' })
  parsedFile: ParsedFile;

  // Image Specific Metadata
  @Column({ type: 'int', nullable: true })
  imageWidth: number;

  @Column({ type: 'int', nullable: true })
  imageHeight: number;

  @Column({ type: 'int', nullable: true })
  imageDpi: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  imageColorSpace: string; // RGB, CMYK, Grayscale, etc.

  @Column({ type: 'int', nullable: true })
  imageBitDepth: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  imageFormat: string; // JPEG, PNG, TIFF, etc.

  @Column({ type: 'varchar', length: 100, nullable: true })
  imageCompression: string;

  @Column({ type: 'json', nullable: true })
  imageExifData: any; // EXIF metadata for images

  @Column({ type: 'varchar', length: 100, nullable: true })
  cameraModel: string; // From EXIF

  @Column({ type: 'timestamp', nullable: true })
  imageDateTaken: Date; // From EXIF

  @Column({ type: 'json', nullable: true })
  imageGpsData: any; // GPS coordinates from EXIF

  // PDF Specific Metadata
  @Column({ type: 'int', nullable: true })
  pdfPageCount: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  pdfVersion: string; // PDF version (1.4, 1.7, etc.)

  @Column({ type: 'text', nullable: true })
  pdfTitle: string;

  @Column({ type: 'text', nullable: true })
  pdfAuthor: string;

  @Column({ type: 'text', nullable: true })
  pdfSubject: string;

  @Column({ type: 'text', nullable: true })
  pdfCreator: string; // Software that created the PDF

  @Column({ type: 'text', nullable: true })
  pdfProducer: string; // Software that produced the PDF

  @Column({ type: 'timestamp', nullable: true })
  pdfCreationDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  pdfModificationDate: Date;

  @Column({ type: 'boolean', default: false })
  pdfIsEncrypted: boolean;

  @Column({ type: 'boolean', default: false })
  pdfHasImages: boolean;

  @Column({ type: 'boolean', default: false })
  pdfHasForms: boolean;

  @Column({ type: 'json', nullable: true })
  pdfPageSizes: any; // Array of page dimensions

  @Column({ type: 'json', nullable: true })
  pdfFonts: any; // Fonts used in PDF

  @Column({ type: 'json', nullable: true })
  pdfBookmarks: any; // PDF bookmarks/outline

  // Excel Specific Metadata
  @Column({ type: 'int', nullable: true })
  excelSheetCount: number;

  @Column({ type: 'json', nullable: true })
  excelSheetNames: any; // Array of sheet names

  @Column({ type: 'text', nullable: true })
  excelTitle: string;

  @Column({ type: 'text', nullable: true })
  excelAuthor: string;

  @Column({ type: 'text', nullable: true })
  excelCompany: string;

  @Column({ type: 'text', nullable: true })
  excelApplication: string; // Excel version

  @Column({ type: 'timestamp', nullable: true })
  excelCreationDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  excelModificationDate: Date;

  @Column({ type: 'int', nullable: true })
  excelTotalCells: number;

  @Column({ type: 'int', nullable: true })
  excelUsedCells: number;

  @Column({ type: 'json', nullable: true })
  excelSheetStatistics: any; // Per-sheet statistics

  @Column({ type: 'boolean', default: false })
  excelHasFormulas: boolean;

  @Column({ type: 'boolean', default: false })
  excelHasCharts: boolean;

  @Column({ type: 'boolean', default: false })
  excelHasMacros: boolean;

  @Column({ type: 'json', nullable: true })
  excelDataTypes: any; // Types of data found

  // General File System Metadata
  @Column({ type: 'varchar', length: 20, nullable: true })
  fileExtension: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  fileMd5Hash: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  fileSha256Hash: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  fileEncoding: string; // Text encoding if applicable

  @Column({ type: 'int', nullable: true })
  fileLineEndings: number; // 1=Unix, 2=Windows, 3=Mac

  @Column({ type: 'boolean', default: false })
  fileHasBom: boolean; // Byte Order Mark

  // Content Analysis
  @Column({ type: 'json', nullable: true })
  detectedLanguages: any; // Multiple language detection results

  @Column({ type: 'float', nullable: true })
  textComplexity: number; // Readability score

  @Column({ type: 'json', nullable: true })
  keywordDensity: any; // Most frequent words

  @Column({ type: 'json', nullable: true })
  entityExtraction: any; // Named entities (dates, names, etc.)

  @Column({ type: 'json', nullable: true })
  sentimentAnalysis: any; // Basic sentiment if applicable

  // Processing Environment
  @Column({ type: 'varchar', length: 100, nullable: true })
  processingServer: string; // Server that processed the file

  @Column({ type: 'varchar', length: 50, nullable: true })
  processingNodeVersion: string;

  @Column({ type: 'json', nullable: true })
  processingLibraryVersions: any; // JSON of library versions

  @Column({ type: 'json', nullable: true })
  processingConfiguration: any; // Processing settings used

  // Custom Fields for Extensibility
  @Column({ type: 'json', nullable: true })
  customMetadata: any; // User-defined metadata

  @Column({ type: 'json', nullable: true })
  tags: any; // User or system tags

  @Column({ type: 'text', nullable: true })
  notes: string; // User notes

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Helper Methods
  getImageAspectRatio(): number | null {
    if (this.imageWidth && this.imageHeight) {
      return this.imageWidth / this.imageHeight;
    }
    return null;
  }

  getImageMegapixels(): number | null {
    if (this.imageWidth && this.imageHeight) {
      return (this.imageWidth * this.imageHeight) / 1000000;
    }
    return null;
  }

  getPdfAveragePageSize(): { width: number; height: number } | null {
    if (this.pdfPageSizes && Array.isArray(this.pdfPageSizes)) {
      const total = this.pdfPageSizes.reduce(
        (acc, page) => ({
          width: acc.width + page.width,
          height: acc.height + page.height,
        }),
        { width: 0, height: 0 }
      );
      return {
        width: total.width / this.pdfPageSizes.length,
        height: total.height / this.pdfPageSizes.length,
      };
    }
    return null;
  }

  getExcelDataUtilization(): number | null {
    if (this.excelTotalCells && this.excelUsedCells) {
      return (this.excelUsedCells / this.excelTotalCells) * 100;
    }
    return null;
  }
}

