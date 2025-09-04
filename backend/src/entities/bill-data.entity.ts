import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ParsedFile } from './parsed-file.entity';

export enum BillType {
  PAYSLIP = 'payslip',
  INVOICE = 'invoice',
  RECEIPT = 'receipt',
  BILL = 'bill',
  EXPENSE = 'expense',
  OTHER = 'other'
}

export enum BillStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  VERIFIED = 'verified',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

@Entity('bill_data')
@Index(['billType', 'billStatus'])
@Index(['processedFileId'])
@Index(['createdAt'])
export class BillData {
  @PrimaryGeneratedColumn()
  id: number;

  // Reference to the processed file
  @Column()
  processedFileId: number;

  @ManyToOne(() => ParsedFile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'processedFileId' })
  processedFile: ParsedFile;

  // Bill Classification
  @Column({
    type: 'enum',
    enum: BillType,
    default: BillType.OTHER
  })
  billType: BillType;

  @Column({
    type: 'enum',
    enum: BillStatus,
    default: BillStatus.PENDING
  })
  billStatus: BillStatus;

  // Document Information
  @Column({ length: 200, nullable: true })
  documentNumber: string; // Invoice number, receipt number, etc.

  @Column({ type: 'date', nullable: true })
  billDate: Date;

  @Column({ type: 'date', nullable: true })
  dueDate: Date;

  @Column({ length: 200, nullable: true })
  vendorName: string; // Company/individual who issued the bill

  @Column({ length: 200, nullable: true })
  vendorAddress: string;

  @Column({ length: 100, nullable: true })
  vendorPhone: string;

  @Column({ length: 100, nullable: true })
  vendorEmail: string;

  @Column({ length: 100, nullable: true })
  vendorTaxId: string; // GST, PAN, etc.

  // Customer/Employee Information (for payslips)
  @Column({ length: 200, nullable: true })
  customerName: string; // Employee name for payslips

  @Column({ length: 100, nullable: true })
  customerId: string; // Employee ID

  @Column({ length: 100, nullable: true })
  customerDepartment: string;

  @Column({ length: 100, nullable: true })
  customerDesignation: string;

  // Financial Information
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  subtotal: number; // Amount before tax

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  discountAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  totalAmount: number; // Final amount

  @Column({ length: 10, nullable: true })
  currency: string; // INR, USD, etc.

  // Payslip Specific Fields
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  basicSalary: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  allowances: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  deductions: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  netSalary: number;

  @Column({ type: 'int', nullable: true })
  payableDays: number;

  @Column({ type: 'int', nullable: true })
  paidDays: number;

  // Invoice Specific Fields
  @Column({ type: 'text', nullable: true })
  itemDescription: string; // List of items/services

  @Column({ type: 'json', nullable: true })
  lineItems: any; // Detailed line items with quantities and prices

  // Processing Information
  @Column({ type: 'float', nullable: true })
  confidence: number; // How confident the system is about the extraction

  @Column({ type: 'json', nullable: true })
  extractedFields: any; // All extracted key-value pairs

  @Column({ type: 'json', nullable: true })
  validationErrors: any; // Any validation issues found

  @Column({ type: 'text', nullable: true })
  notes: string; // Additional notes or comments

  // Timestamps
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date;

  // Helper Methods
  isPayslip(): boolean {
    return this.billType === BillType.PAYSLIP;
  }

  isInvoice(): boolean {
    return this.billType === BillType.INVOICE;
  }

  getTotalAmount(): number {
    return this.totalAmount || 0;
  }

  getFormattedAmount(): string {
    if (!this.totalAmount) return '0.00';
    return `${this.currency || 'INR'} ${this.totalAmount.toFixed(2)}`;
  }

  needsVerification(): boolean {
    return this.billStatus === BillStatus.PROCESSED;
  }

  isApproved(): boolean {
    return this.billStatus === BillStatus.APPROVED;
  }

  isRejected(): boolean {
    return this.billStatus === BillStatus.REJECTED;
  }
}
