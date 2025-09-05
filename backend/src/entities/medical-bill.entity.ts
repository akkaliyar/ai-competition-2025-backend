import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ParsedFile } from './parsed-file.entity';

@Entity('medical_bills')
export class MedicalBill {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'parsed_file_id' })
  parsedFileId: number;

  @ManyToOne(() => ParsedFile)
  @JoinColumn({ name: 'parsed_file_id' })
  parsedFile: ParsedFile;

  @Column({ name: 'file_name', length: 255, nullable: true })
  fileName: string;

  @Column({ name: 'file_size', type: 'bigint', nullable: true })
  fileSize: number;

  @Column({ name: 'processed_status', length: 50, default: 'completed' })
  processedStatus: string;

  @Column({ name: 'processed_date', type: 'datetime', nullable: true })
  processedDate: Date;

  @Column({ name: 'invoice_no', length: 100 })
  invoiceNo: string;

  @Column({ name: 'date', length: 50 })
  date: string;

  @Column({ name: 'shop_name', length: 255 })
  shopName: string;

  @Column({ name: 'shop_address', type: 'text', nullable: true })
  shopAddress: string;

  @Column({ name: 'phone', type: 'json', nullable: true })
  phone: string[];

  @Column({ name: 'patient_name', length: 255 })
  patientName: string;

  @Column({ name: 'patient_phone', length: 20, nullable: true })
  patientPhone: string;

  @Column({ name: 'prescribed_by', length: 255, nullable: true })
  prescribedBy: string;

  @Column({ name: 'doctor_name', length: 255, nullable: true })
  doctorName: string;

  @Column({ name: 'doctor_specialization', length: 255, nullable: true })
  doctorSpecialization: string;

  @Column({ name: 'doctor_phone', length: 20, nullable: true })
  doctorPhone: string;

  @Column({ name: 'items', type: 'json' })
  items: any[];

  @Column({ name: 'total_qty', type: 'int' })
  totalQty: number;

  @Column({ name: 'sub_total', type: 'decimal', precision: 10, scale: 2 })
  subTotal: number;

  @Column({ name: 'less_discount', type: 'decimal', precision: 10, scale: 2, default: 0 })
  lessDiscount: number;

  @Column({ name: 'other_adj', type: 'decimal', precision: 10, scale: 2, default: 0 })
  otherAdj: number;

  @Column({ name: 'round_off', type: 'decimal', precision: 10, scale: 2, default: 0 })
  roundOff: number;

  @Column({ name: 'grand_total', type: 'decimal', precision: 10, scale: 2 })
  grandTotal: number;

  @Column({ name: 'amount_in_words', type: 'text' })
  amountInWords: string;

  @Column({ name: 'message', type: 'text', nullable: true })
  message: string;

  @Column({ name: 'terms_and_conditions', type: 'json', nullable: true })
  termsAndConditions: string[];

  @Column({ name: 'extraction_confidence', type: 'decimal', precision: 5, scale: 2, nullable: true })
  extractionConfidence: number;

  @Column({ name: 'extraction_method', length: 100, nullable: true })
  extractionMethod: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
