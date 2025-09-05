import { Injectable } from '@nestjs/common';
import { MedicalBillDto, MedicalBillItemDto } from '../dto/medical-bill.dto';

@Injectable()
export class MedicalBillExtractionService {
  
  /**
   * Extract medical bill data from OCR text
   */
  extractMedicalBillData(ocrText: string): MedicalBillDto {
    const lines = ocrText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    const billData: MedicalBillDto = {
      invoiceNo: '',
      date: '',
      shopName: '',
      shopAddress: '',
      phone: [],
      patientName: '',
      items: [],
      totalQty: 0,
      subTotal: 0,
      lessDiscount: 0,
      otherAdj: 0,
      roundOff: 0,
      grandTotal: 0,
      amountInWords: ''
    };

    // Extract invoice number
    const invoicePatterns = [
      /Invoice\s+No\.\.\s+([A-Z0-9]+)/i,
      /(?:invoice\s*no\.?|bill\s*no\.?)\s*:?\s*([A-Z0-9]+)/i,
      /(?:invoice|bill)\s*no[.:\s]*([A-Z0-9]+)/i
    ];
    
    for (const pattern of invoicePatterns) {
      const match = ocrText.match(pattern);
      if (match) {
        billData.invoiceNo = match[1] ? match[1].trim() : match[0].trim();
        break;
      }
    }

    // Extract date
    const datePatterns = [
      /Date\s*:\s*(\d{1,2}-\d{1,2}-\d{4})/i,
      /(?:date)\s*:?\s*(\d{1,2}-\d{1,2}-\d{4})/i,
      /(\d{1,2}-\d{1,2}-\d{4})/i
    ];
    
    for (const pattern of datePatterns) {
      const match = ocrText.match(pattern);
      if (match) {
        billData.date = match[1] ? match[1].trim() : match[0].trim();
        break;
      }
    }

    // Extract shop name
    const shopNamePatterns = [
      /([A-Z\s]+(?:MEDICOSE|MEDICAL|PHARMACY|CLINIC|HOSPITAL))/i,
      /([A-Z\s]+(?:PRIVATE|LIMITED|LTD))/i
    ];
    
    for (const pattern of shopNamePatterns) {
      const match = ocrText.match(pattern);
      if (match) {
        billData.shopName = match[1].trim();
        break;
      }
    }

    // Extract shop address
    const addressPatterns = [
      /(?:Address|ADDRESS)\s*:?\s*([^]*?)(?=Phone|Ph\.|Contact|$)/i,
      /(?:SHOP|Shop)\s+\d+[^]*?(?=Phone|Ph\.|Contact|$)/i
    ];
    
    for (const pattern of addressPatterns) {
      const match = ocrText.match(pattern);
      if (match) {
        billData.shopAddress = match[1].trim().replace(/\s+/g, ' ');
        break;
      }
    }

    // Extract phone numbers - dynamic extraction only
    const phonePatterns = [
      /(\d{10})/g,
      /(\d{3,4}[-.\s]?\d{3,4}[-.\s]?\d{4})/g
    ];
    
    const phoneNumbers: string[] = [];
    for (const pattern of phonePatterns) {
      const matches = ocrText.matchAll(pattern);
      for (const match of matches) {
        const phone = match[1].replace(/[-.\s]/g, '');
        if (phone.length >= 10) {
          phoneNumbers.push(phone);
        }
      }
    }
    billData.phone = [...new Set(phoneNumbers)]; // Remove duplicates

    // Extract patient name - improved patterns
    const patientPatterns = [
      /Patient\s+Name\s*:\s*([A-Z\s]+?)(?=\s*Ph\.|Phone|$)/i,
      /Patient\s+Name\s*:\s*([A-Z\s]+)/i,
      /Name\s*:\s*([A-Z\s]+?)(?=\s*Ph\.|Phone|$)/i
    ];
    
    for (const pattern of patientPatterns) {
      const match = ocrText.match(pattern);
      if (match) {
        let patientName = match[1] ? match[1].trim() : match[0].trim();
        // Clean up any extra text that might be captured
        patientName = patientName.replace(/\s+Ph\.|Phone.*$/i, '').trim();
        // Only set if we have a valid name (at least 3 characters, no newlines)
        if (patientName && !patientName.includes('\n') && patientName.length >= 3) {
          billData.patientName = patientName;
          break;
        }
      }
    }

    // Extract patient phone - dynamic extraction only
    const patientPhonePatterns = [
      /(?:Patient|Name)[^]*?(\d{10})/i,
      /Ph\.No\.s?\s*(\d{10})/i
    ];
    
    for (const pattern of patientPhonePatterns) {
      const match = ocrText.match(pattern);
      if (match) {
        billData.patientPhone = match[1].trim();
        break;
      }
    }

    // Extract doctor details - only if "by Dr" is present
    const doctorPatterns = [
      /(?:Prescribed|by)\s+Dr\.?\s*([^]*?)(?=S\.No|Item|$)/i,
      /Dr\.?\s*([A-Z\s]+?)(?=S\.No|Item|$)/i
    ];
    
    for (const pattern of doctorPatterns) {
      const match = ocrText.match(pattern);
      if (match) {
        const doctorInfo = match[1].trim();
        if (doctorInfo && doctorInfo.length > 0) {
          const doctorDetails = this.extractDoctorDetails(doctorInfo);
          billData.prescribedBy = doctorInfo;
          billData.doctorName = doctorDetails.name;
          billData.doctorSpecialization = doctorDetails.specialization;
          break;
        }
      }
    }

    // Extract doctor phone - dynamic extraction only
    const doctorPhonePatterns = [
      /(?:Dr\.?|Doctor)[^]*?(\d{10})/i
    ];
    
    for (const pattern of doctorPhonePatterns) {
      const match = ocrText.match(pattern);
      if (match) {
        billData.doctorPhone = match[1].trim();
        break;
      }
    }

    // Extract items
    billData.items = this.extractItems(lines);

    // Extract totals
    this.extractTotals(ocrText, billData);

    // Extract amount in words - dynamic extraction only
    const amountInWordsPatterns = [
      /(?:Amount\s+in\s+Words|Amountin\s+Words)\s*:?\s*([^]*?)(?=Sub\s+Total|Total|$)/i,
      /(?:Rs\.?\s+[^]*?only)/i
    ];
    
    for (const pattern of amountInWordsPatterns) {
      const match = ocrText.match(pattern);
      if (match) {
        let amountText = match[1] ? match[1].trim() : match[0].trim();
        // Clean up OCR artifacts
        amountText = amountText.replace(/[^\w\s.,]/g, ' ').replace(/\s+/g, ' ').trim();
        if (amountText && amountText.length > 10) {
          billData.amountInWords = amountText;
          break;
        }
      }
    }

    return billData;
  }

  /**
   * Check if the OCR text appears to be a medical bill
   */
  isMedicalBill(ocrText: string): boolean {
    const medicalKeywords = [
      'medical', 'medicine', 'pharmacy', 'pharmacist', 'prescription', 'prescribed',
      'doctor', 'dr.', 'patient', 'clinic', 'hospital', 'medicose', 'tab', 'cap',
      'syrup', 'injection', 'mg', 'ml', 'batch', 'exp', 'mrp', 'qty', 'rate'
    ];

    const billKeywords = [
      'invoice', 'bill', 'receipt', 'total', 'amount', 'grand total', 'sub total',
      'discount', 'tax', 'gst', 'vat'
    ];

    const text = ocrText.toLowerCase();
    const medicalScore = medicalKeywords.filter(keyword => text.includes(keyword)).length;
    const billScore = billKeywords.filter(keyword => text.includes(keyword)).length;

    return medicalScore >= 3 && billScore >= 2;
  }

  private extractItems(lines: string[]): MedicalBillItemDto[] {
    const items: MedicalBillItemDto[] = [];
    let itemIndex = 1;

    // Look for item table patterns
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Skip header lines (but not item lines that start with numbers)
      if (trimmedLine.includes('S.No') && !trimmedLine.match(/^\d+\s/)) {
        continue;
      }
      if (trimmedLine.includes('Description') && !trimmedLine.match(/^\d+\s/)) {
        continue;
      }
      if (trimmedLine.includes('Pack') && !trimmedLine.match(/^\d+\s/)) {
        continue;
      }
      if (trimmedLine.includes('MRP') && !trimmedLine.match(/^\d+\s/)) {
        continue;
      }
      if (trimmedLine.includes('Batch') && !trimmedLine.match(/^\d+\s/)) {
        continue;
      }
      if (trimmedLine.includes('Exp') && !trimmedLine.match(/^\d+\s/)) {
        continue;
      }
      if (trimmedLine.includes('Qty') && !trimmedLine.match(/^\d+\s/)) {
        continue;
      }
      if (trimmedLine.includes('Rate') && !trimmedLine.match(/^\d+\s/)) {
        continue;
      }
      if (trimmedLine.includes('Amount') && !trimmedLine.match(/^\d+\s/)) {
        continue;
      }

      // Try different item patterns
      const item = this.parseItemLine(trimmedLine, itemIndex);
      if (item) {
        items.push(item);
        itemIndex++;
      }
    }

    return items;
  }

  private parseItemLine(line: string, sNo: number): MedicalBillItemDto | null {
    // Pattern 1: More flexible pattern that handles hyphens and numbers in descriptions
    const pattern1 = /^(\d+)\s+([A-Z0-9\s\-]+?)\s+([A-Z0-9\*X]+)\s+([\d.]+)\s+([A-Z0-9]+)\s+([\d\/]+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)$/i;
    const match1 = line.match(pattern1);
    if (match1) {
      return {
        sNo: sNo,
        itemDescription: match1[2].trim(),
        pack: match1[3].trim(),
        mrp: parseFloat(match1[4]),
        batchNo: match1[5].trim(),
        exp: match1[6].trim(),
        qty: parseInt(match1[7]),
        rate: parseFloat(match1[8]),
        amount: parseFloat(match1[9])
      };
    }

    // Pattern 2: Alternative pattern for different spacing
    const pattern2 = /^(\d+)\s+([A-Z0-9\s\-]+?)\s+([A-Z0-9\*X]+)\s+([\d.]+)\s+([A-Z0-9]+)\s+([\d\/]+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)$/i;
    const match2 = line.match(pattern2);
    if (match2) {
      return {
        sNo: sNo,
        itemDescription: match2[2].trim(),
        pack: match2[3].trim(),
        mrp: parseFloat(match2[4]),
        batchNo: match2[5].trim(),
        exp: match2[6].trim(),
        qty: parseInt(match2[7]),
        rate: parseFloat(match2[8]),
        amount: parseFloat(match2[9])
      };
    }

    // Pattern 3: Split by spaces and try to parse manually
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 9 && /^\d+$/.test(parts[0])) {
      try {
        return {
          sNo: sNo,
          itemDescription: parts.slice(1, -8).join(' ').trim(),
          pack: parts[parts.length - 8] || '',
          mrp: parseFloat(parts[parts.length - 7]) || 0,
          batchNo: parts[parts.length - 6] || '',
          exp: parts[parts.length - 5] || '',
          qty: parseInt(parts[parts.length - 4]) || 0,
          rate: parseFloat(parts[parts.length - 3]) || 0,
          amount: parseFloat(parts[parts.length - 2]) || 0
        };
      } catch (e) {
        // If parsing fails, return null
      }
    }

    return null;
  }

  private extractItemDescriptionFromContext(line: string): string {
    // Try to extract item description from the line context
    const medicalTerms = /(?:TAB|CAP|SYR|INJ|DROPS|OINT|GEL|POWDER|SACHET|ML|MG)/i;
    if (medicalTerms.test(line)) {
      const match = line.match(/([A-Z\-\d]+(?:TAB|CAP|SYR|INJ|DROPS|OINT|GEL|POWDER|SACHET|ML|MG)[A-Z\-\d\s]*)/i);
      if (match) {
        return match[1].trim();
      }
    }
    
    // Try to extract from the full line context
    const fullLineMatch = line.match(/([A-Z\-\d\s]+(?:TAB|CAP|SYR|INJ|DROPS|OINT|GEL|POWDER|SACHET|ML|MG))/i);
    if (fullLineMatch) {
      return fullLineMatch[1].trim();
    }

    // Fallback: extract any text that looks like a medicine name
    const textMatch = line.match(/([A-Z\-\d\s]{5,})/);
    if (textMatch) {
      return textMatch[1].trim();
    }

    return `Item ${line.substring(0, 20)}...`;
  }

  private extractTotals(ocrText: string, billData: MedicalBillDto): void {
    // Extract sub total
    const subTotalPatterns = [
      /Sub\s+Total\s*:?\s*([\d.]+)/i,
      /Sub\s*Total\s*([\d.]+)/i
    ];
    
    for (const pattern of subTotalPatterns) {
      const match = ocrText.match(pattern);
      if (match) {
        billData.subTotal = parseFloat(match[1]);
        break;
      }
    }

    // Extract total quantity
    const totalQtyPatterns = [
      /Total\s*Qty\s*:?\s*(\d+)/i,
      /Total\s*Quantity\s*:?\s*(\d+)/i
    ];
    
    for (const pattern of totalQtyPatterns) {
      const match = ocrText.match(pattern);
      if (match) {
        billData.totalQty = parseInt(match[1]);
        break;
      }
    }

    // Extract less discount
    const lessDiscountPatterns = [
      /Less\s+Discount\s*:?\s*([\d.]+)/i,
      /Discount\s*:?\s*([\d.]+)/i
    ];
    
    for (const pattern of lessDiscountPatterns) {
      const match = ocrText.match(pattern);
      if (match) {
        billData.lessDiscount = parseFloat(match[1]);
        break;
      }
    }

    // Extract other adjustments
    const otherAdjPatterns = [
      /Other\s+Adj\s*:?\s*([\d.]+)/i,
      /Other\s+Adjustment\s*:?\s*([\d.]+)/i
    ];
    
    for (const pattern of otherAdjPatterns) {
      const match = ocrText.match(pattern);
      if (match) {
        billData.otherAdj = parseFloat(match[1]);
        break;
      }
    }

    // Extract round off
    const roundOffPatterns = [
      /Round\s+Off\s*:?\s*([\d.]+)/i,
      /Round\s*Off\s*([\d.]+)/i
    ];
    
    for (const pattern of roundOffPatterns) {
      const match = ocrText.match(pattern);
      if (match) {
        billData.roundOff = parseFloat(match[1]);
        break;
      }
    }

    // Extract grand total
    const grandTotalPatterns = [
      /Grand\s+Total\s*:?\s*([\d.]+)/i,
      /GRAND\s+TOTAL\s*:?\s*([\d.]+)/i,
      /Total\s*:?\s*([\d.]+)/i
    ];
    
    for (const pattern of grandTotalPatterns) {
      const match = ocrText.match(pattern);
      if (match) {
        billData.grandTotal = parseFloat(match[1]);
        break;
      }
    }
  }

  private extractDoctorDetails(doctorInfo: string): { name: string, specialization: string } {
    // Common doctor specializations
    const specializations = [
      'MD', 'MBBS', 'MS', 'MCh', 'DM', 'DNB', 'FRCS', 'MRCP',
      'Cardiologist', 'Dermatologist', 'Neurologist', 'Orthopedist',
      'Pediatrician', 'Gynecologist', 'Psychiatrist', 'General Physician',
      'ENT', 'Ophthalmologist', 'Urologist', 'Gastroenterologist'
    ];

    let name = doctorInfo;
    let specialization = '';

    // Try to extract specialization
    for (const spec of specializations) {
      if (doctorInfo.includes(spec)) {
        specialization = spec;
        name = doctorInfo.replace(spec, '').trim();
        break;
      }
    }

    // Clean up the name
    name = name.replace(/^(dr\.?\s*|doctor\s*)/i, '').trim();

    return { name, specialization };
  }

  /**
   * Validate medical bill data - non-mandatory validation
   */
  validateMedicalBill(billData: MedicalBillDto): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Only validate if we have some data to work with
    if (!billData.invoiceNo && !billData.date && !billData.shopName && 
        !billData.patientName && (!billData.items || billData.items.length === 0)) {
      errors.push('No medical bill data found');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Calculate confidence score for extracted data
   */
  calculateConfidence(billData: MedicalBillDto): number {
    let score = 0;
    let totalFields = 0;

    // Check available fields (not mandatory)
    const availableFields = [
      { field: billData.invoiceNo, weight: 10 },
      { field: billData.date, weight: 10 },
      { field: billData.shopName, weight: 10 },
      { field: billData.patientName, weight: 10 },
      { field: billData.grandTotal, weight: 15 }
    ];

    availableFields.forEach(({ field, weight }) => {
      if (field && (typeof field === 'string' ? field.trim() !== '' : field > 0)) {
        totalFields += weight;
        score += weight;
      }
    });

    // Check items
    if (billData.items && billData.items.length > 0) {
      totalFields += 20;
      score += 20;
      
      // Additional points for complete item data
      const completeItems = billData.items.filter(item => 
        item.itemDescription && item.itemDescription.trim() !== '' &&
        item.qty > 0 && item.rate > 0 && item.amount > 0
      );
      
      if (completeItems.length === billData.items.length) {
        score += 10;
        totalFields += 10;
      }
    }

    // Check phone numbers
    if (billData.phone && billData.phone.length > 0) {
      totalFields += 5;
      score += 5;
    }

    // Check amount in words
    if (billData.amountInWords && billData.amountInWords.trim() !== '') {
      totalFields += 5;
      score += 5;
    }

    return totalFields > 0 ? Math.round((score / totalFields) * 100) : 0;
  }
}