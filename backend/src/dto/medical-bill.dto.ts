import { IsString, IsNumber, IsArray, IsOptional, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class MedicalBillItemDto {
  @IsNumber()
  sNo: number;

  @IsString()
  itemDescription: string;

  @IsString()
  pack: string;

  @IsNumber()
  mrp: number;

  @IsString()
  batchNo: string;

  @IsString()
  exp: string;

  @IsNumber()
  qty: number;

  @IsNumber()
  rate: number;

  @IsNumber()
  amount: number;
}

export class MedicalBillDto {
  @IsNumber()
  @IsOptional()
  id?: number;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsNumber()
  fileSize?: number;

  @IsOptional()
  @IsString()
  processedStatus?: string;

  @IsOptional()
  @IsString()
  processedDate?: string;

  @IsString()
  invoiceNo: string;

  @IsString()
  date: string;

  @IsString()
  shopName: string;

  @IsString()
  shopAddress: string;

  @IsArray()
  @IsString({ each: true })
  phone: string[];

  @IsString()
  patientName: string;

  @IsOptional()
  @IsString()
  patientPhone?: string;

  @IsOptional()
  @IsString()
  prescribedBy?: string;

  @IsOptional()
  @IsString()
  doctorName?: string;

  @IsOptional()
  @IsString()
  doctorSpecialization?: string;

  @IsOptional()
  @IsString()
  doctorPhone?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicalBillItemDto)
  items: MedicalBillItemDto[];

  @IsNumber()
  totalQty: number;

  @IsNumber()
  subTotal: number;

  @IsNumber()
  lessDiscount: number;

  @IsNumber()
  otherAdj: number;

  @IsNumber()
  roundOff: number;

  @IsNumber()
  grandTotal: number;

  @IsString()
  amountInWords: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  termsAndConditions?: string[];
}

export class MedicalBillResponseDto {
  success: boolean;
  message: string;
  data: MedicalBillDto;
  metadata?: {
    extractionMethod: string;
    confidence: number;
    processingTime: number;
    documentType: string;
  };
}
