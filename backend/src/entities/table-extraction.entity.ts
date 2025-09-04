import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { ParsedFile } from './parsed-file.entity';

@Entity('table_extractions')
@Index(['parsedFileId'])
export class TableExtraction {
  @PrimaryGeneratedColumn()
  id: number;

  // Foreign Key to ParsedFile
  @Column()
  parsedFileId: number;

  @ManyToOne(() => ParsedFile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parsedFileId' })
  parsedFile: ParsedFile;

  // Table Identification
  @Column({ type: 'int' })
  tableIndex: number; // Table number within the document

  @Column({ type: 'varchar', length: 255, nullable: true })
  tableName: string; // Sheet name for Excel, or detected title

  @Column({ type: 'int', nullable: true })
  pageNumber: number; // For PDFs with multiple pages

  // Table Structure
  @Column({ type: 'int' })
  rowCount: number;

  @Column({ type: 'int' })
  columnCount: number;

  @Column({ type: 'json' })
  headers: any; // Array of column headers

  @Column({ type: 'longtext' })
  tableData: string; // JSON string of table data

  @Column({ type: 'json', nullable: true })
  cellTypes: any; // Data types for each cell (string, number, date, etc.)

  @Column({ type: 'json', nullable: true })
  cellStyles: any; // Cell formatting information

  // Table Position (for images/PDFs)
  @Column({ type: 'json', nullable: true })
  boundingBox: any; // x, y, width, height coordinates

  @Column({ type: 'float', nullable: true })
  tableConfidence: number; // Confidence that this is actually a table

  // Data Quality Metrics
  @Column({ type: 'int', nullable: true })
  emptyRows: number;

  @Column({ type: 'int', nullable: true })
  emptyCells: number;

  @Column({ type: 'float', nullable: true })
  dataCompleteness: number; // Percentage of non-empty cells

  @Column({ type: 'boolean', default: false })
  hasHeaderRow: boolean;

  @Column({ type: 'boolean', default: false })
  hasFooterRow: boolean;

  @Column({ type: 'boolean', default: false })
  hasNumericData: boolean;

  @Column({ type: 'boolean', default: false })
  hasDateData: boolean;

  // Data Analysis
  @Column({ type: 'json', nullable: true })
  columnStatistics: any; // Min, max, avg, etc. for numeric columns

  @Column({ type: 'json', nullable: true })
  dataPatterns: any; // Detected patterns in data

  @Column({ type: 'json', nullable: true })
  duplicateRows: any; // Information about duplicate rows

  @Column({ type: 'json', nullable: true })
  outliers: any; // Statistical outliers in numeric data

  // Processing Information
  @Column({ type: 'varchar', length: 100, nullable: true })
  extractionMethod: string; // How the table was extracted

  @Column({ type: 'int', nullable: true })
  processingTimeMs: number;

  @Column({ type: 'json', nullable: true })
  extractionOptions: any; // Options used during extraction

  // Validation and Quality
  @Column({ type: 'json', nullable: true })
  validationErrors: any; // Data validation errors

  @Column({ type: 'json', nullable: true })
  dataWarnings: any; // Data quality warnings

  @Column({ type: 'float', nullable: true })
  overallQuality: number; // Overall table quality score

  // Excel Specific
  @Column({ type: 'varchar', length: 100, nullable: true })
  excelSheetName: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  excelRange: string; // Cell range (e.g., A1:Z100)

  @Column({ type: 'json', nullable: true })
  excelFormulas: any; // Formulas in cells

  @Column({ type: 'boolean', default: false })
  hasExcelCharts: boolean;

  @Column({ type: 'json', nullable: true })
  excelFormatting: any; // Cell formatting details

  // PDF Specific
  @Column({ type: 'json', nullable: true })
  pdfTextBlocks: any; // Text blocks that form the table

  @Column({ type: 'float', nullable: true })
  pdfTableDetectionScore: number;

  @Column({ type: 'json', nullable: true })
  pdfLayoutAnalysis: any; // Layout analysis results

  // Image/OCR Specific
  @Column({ type: 'json', nullable: true })
  ocrTableRegions: any; // OCR-detected table regions

  @Column({ type: 'float', nullable: true })
  ocrAverageConfidence: number;

  @Column({ type: 'json', nullable: true })
  cellBoundingBoxes: any; // Bounding boxes for each cell

  @CreateDateColumn()
  createdAt: Date;

  // Helper Methods
  getTableDensity(): number {
    const totalCells = this.rowCount * this.columnCount;
    const filledCells = totalCells - (this.emptyCells || 0);
    return totalCells > 0 ? (filledCells / totalCells) * 100 : 0;
  }

  isHighQuality(): boolean {
    return (
      this.getTableDensity() >= 70 &&
      this.dataCompleteness >= 80 &&
      (this.tableConfidence || 0) >= 0.8
    );
  }

  getTableSummary(): any {
    return {
      id: this.id,
      name: this.tableName,
      dimensions: `${this.rowCount}x${this.columnCount}`,
      density: `${this.getTableDensity().toFixed(1)}%`,
      completeness: `${this.dataCompleteness?.toFixed(1) || 0}%`,
      quality: this.isHighQuality() ? 'High' : 'Medium',
      hasHeaders: this.hasHeaderRow,
      dataTypes: {
        numeric: this.hasNumericData,
        dates: this.hasDateData,
      },
    };
  }

  getParsedTableData(): any[] {
    try {
      return JSON.parse(this.tableData);
    } catch (error) {
      return [];
    }
  }

  getHeaderRow(): string[] {
    if (Array.isArray(this.headers)) {
      return this.headers;
    }
    return [];
  }

  getColumnTypes(): { [key: string]: string } {
    if (this.cellTypes && typeof this.cellTypes === 'object') {
      const headers = this.getHeaderRow();
      const types: { [key: string]: string } = {};
      
      headers.forEach((header, index) => {
        types[header] = this.cellTypes[`col_${index}`] || 'string';
      });
      
      return types;
    }
    return {};
  }
}

