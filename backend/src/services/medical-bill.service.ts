import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MedicalBill } from '../entities/medical-bill.entity';
import { MedicalBillDto } from '../dto/medical-bill.dto';

@Injectable()
export class MedicalBillService {
  constructor(
    @InjectRepository(MedicalBill)
    private medicalBillRepository: Repository<MedicalBill>,
  ) {}

  /**
   * Save medical bill data to database
   */
  async saveMedicalBill(parsedFileId: number, medicalBillData: MedicalBillDto, confidence: number, fileInfo?: { fileName?: string, fileSize?: number, processedStatus?: string }): Promise<MedicalBill> {
    const medicalBill = this.medicalBillRepository.create({
      parsedFileId,
      fileName: fileInfo?.fileName || medicalBillData.fileName,
      fileSize: fileInfo?.fileSize || medicalBillData.fileSize,
      processedStatus: fileInfo?.processedStatus || medicalBillData.processedStatus || 'completed',
      processedDate: new Date(),
      invoiceNo: medicalBillData.invoiceNo,
      date: medicalBillData.date,
      shopName: medicalBillData.shopName,
      shopAddress: medicalBillData.shopAddress || '',
      phone: medicalBillData.phone || [],
      patientName: medicalBillData.patientName,
      patientPhone: medicalBillData.patientPhone || '',
      prescribedBy: medicalBillData.prescribedBy || '',
      doctorName: medicalBillData.doctorName || '',
      doctorSpecialization: medicalBillData.doctorSpecialization || '',
      doctorPhone: medicalBillData.doctorPhone || '',
      items: medicalBillData.items,
      totalQty: medicalBillData.totalQty,
      subTotal: medicalBillData.subTotal,
      lessDiscount: medicalBillData.lessDiscount,
      otherAdj: medicalBillData.otherAdj,
      roundOff: medicalBillData.roundOff,
      grandTotal: medicalBillData.grandTotal,
      amountInWords: medicalBillData.amountInWords,
      message: medicalBillData.message || '',
      termsAndConditions: medicalBillData.termsAndConditions || [],
      extractionConfidence: confidence,
      extractionMethod: 'medical_bill_specialized_parser',
    });

    return await this.medicalBillRepository.save(medicalBill);
  }

  /**
   * Get medical bill by parsed file ID
   */
  async getMedicalBillByParsedFileId(parsedFileId: number): Promise<MedicalBill | null> {
    return await this.medicalBillRepository.findOne({
      where: { parsedFileId },
      relations: ['parsedFile']
    });
  }

  /**
   * Get medical bill by ID
   */
  async getMedicalBillById(id: number): Promise<MedicalBill | null> {
    return await this.medicalBillRepository.findOne({
      where: { id },
      relations: ['parsedFile']
    });
  }

  /**
   * Get all medical bills
   */
  async getAllMedicalBills(): Promise<MedicalBill[]> {
    return await this.medicalBillRepository.find({
      relations: ['parsedFile'],
      order: { createdAt: 'DESC' }
    });
  }

  /**
   * Convert MedicalBill entity to MedicalBillDto format
   */
  convertToDto(medicalBill: MedicalBill): MedicalBillDto {
    return {
      id: medicalBill.id,
      fileName: medicalBill.fileName,
      fileSize: medicalBill.fileSize,
      processedStatus: medicalBill.processedStatus,
      processedDate: medicalBill.processedDate ? medicalBill.processedDate.toISOString() : undefined,
      invoiceNo: medicalBill.invoiceNo,
      date: medicalBill.date,
      shopName: medicalBill.shopName,
      shopAddress: medicalBill.shopAddress,
      phone: medicalBill.phone,
      patientName: medicalBill.patientName,
      patientPhone: medicalBill.patientPhone,
      prescribedBy: medicalBill.prescribedBy,
      doctorName: medicalBill.doctorName,
      doctorSpecialization: medicalBill.doctorSpecialization,
      doctorPhone: medicalBill.doctorPhone,
      items: medicalBill.items,
      totalQty: medicalBill.totalQty,
      subTotal: medicalBill.subTotal,
      lessDiscount: medicalBill.lessDiscount,
      otherAdj: medicalBill.otherAdj,
      roundOff: medicalBill.roundOff,
      grandTotal: medicalBill.grandTotal,
      amountInWords: medicalBill.amountInWords,
      message: medicalBill.message,
      termsAndConditions: medicalBill.termsAndConditions,
    };
  }

  /**
   * Check if medical bill exists for parsed file
   */
  async existsForParsedFile(parsedFileId: number): Promise<boolean> {
    const count = await this.medicalBillRepository.count({
      where: { parsedFileId }
    });
    return count > 0;
  }
}
