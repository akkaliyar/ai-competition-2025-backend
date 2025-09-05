import { Injectable } from '@nestjs/common';
import { MedicalBillDto, MedicalBillItemDto } from '../dto/medical-bill.dto';

@Injectable()
export class MedicalBillExtractionService {
  
  /**
   * Extract medical bill data from OCR text - raw extraction without patterns
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

    // Extract values by looking for keywords and taking the next available text
    this.extractRawValues(ocrText, lines, billData);

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

  private extractRawValues(ocrText: string, lines: string[], billData: MedicalBillDto): void {
    // Extract invoice number - look for "Invoice No" and take the next text
    const invoiceIndex = ocrText.toLowerCase().indexOf('invoice no');
    if (invoiceIndex !== -1) {
      const afterInvoice = ocrText.substring(invoiceIndex + 10).trim();
      const words = afterInvoice.split(/\s+/);
      if (words.length > 0) {
        // Skip dots and colons, take the first meaningful word
        for (const word of words) {
          if (word && word !== '.' && word !== ':' && word.length > 1) {
            billData.invoiceNo = word;
            break;
          }
        }
      }
    }

    // Extract date - look for "Date" and take the next text
    const dateIndex = ocrText.toLowerCase().indexOf('date');
    if (dateIndex !== -1) {
      const afterDate = ocrText.substring(dateIndex + 4).trim();
      const words = afterDate.split(/\s+/);
      if (words.length > 0) {
        // Skip colons, take the first meaningful word
        for (const word of words) {
          if (word && word !== ':' && word.length > 1) {
            billData.date = word;
            break;
          }
        }
      }
    }

    // Extract shop name - look for common shop name patterns
    for (const line of lines) {
      if (line.toLowerCase().includes('medicose') || 
          line.toLowerCase().includes('medical') || 
          line.toLowerCase().includes('pharmacy')) {
        // Take only the shop name part, not the entire line
        const words = line.split(/\s+/);
        const shopWords = [];
        for (const word of words) {
          if (word.toLowerCase().includes('medicose') || 
              word.toLowerCase().includes('medical') || 
              word.toLowerCase().includes('pharmacy')) {
            shopWords.push(word);
            break;
          }
          shopWords.push(word);
        }
        billData.shopName = shopWords.join(' ');
        break;
      }
    }

    // Extract shop address - look for address keywords
    for (const line of lines) {
      if (line.toLowerCase().includes('shop') || 
          line.toLowerCase().includes('address') ||
          line.toLowerCase().includes('floor')) {
        billData.shopAddress = line;
        break;
      }
    }

    // Extract phone numbers - find all 10-digit numbers
    const phoneMatches = ocrText.match(/\d{10}/g);
    if (phoneMatches) {
      billData.phone = [...new Set(phoneMatches)];
    }

    // Extract patient name - look for "Patient Name" and take the next text
    const patientIndex = ocrText.toLowerCase().indexOf('patient name');
    if (patientIndex !== -1) {
      const afterPatient = ocrText.substring(patientIndex + 12).trim();
      const words = afterPatient.split(/\s+/);
      if (words.length > 0) {
        // Skip colons, take the first meaningful words
        const nameWords = [];
        for (const word of words) {
          if (word && word !== ':' && word.length > 1) {
            // Clean up OCR errors
            const cleanWord = word.replace(/[|:;]/g, '').trim();
            if (cleanWord && cleanWord.length > 1) {
              nameWords.push(cleanWord);
              if (nameWords.length >= 2) break; // Take first 2 words
            }
          }
        }
        billData.patientName = nameWords.join(' ');
      }
    }

    // Extract patient phone - look for phone near patient name
    const patientPhoneIndex = ocrText.toLowerCase().indexOf('ph.no');
    if (patientPhoneIndex !== -1) {
      const afterPhone = ocrText.substring(patientPhoneIndex + 5).trim();
      const phoneMatch = afterPhone.match(/\d{10}/);
      if (phoneMatch) {
        billData.patientPhone = phoneMatch[0];
      }
    }

    // Extract doctor details - look for "Dr" or "Doctor"
    const doctorIndex = ocrText.toLowerCase().indexOf('dr');
    if (doctorIndex !== -1) {
      const afterDr = ocrText.substring(doctorIndex + 2).trim();
      const words = afterDr.split(/\s+/);
      if (words.length > 0) {
        // Skip dots, take the first meaningful word
        for (const word of words) {
          if (word && word !== '.' && word.length > 1) {
            billData.prescribedBy = 'Dr ' + word;
            billData.doctorName = word;
            break;
          }
        }
        // Look for specialization in the next words
        for (let i = 1; i < words.length; i++) {
          if (words[i] && words[i] !== '.' && words[i].length > 1) {
            billData.doctorSpecialization = words[i];
            break;
          }
        }
      }
    }

    // Extract doctor phone - look for phone near doctor info
    const doctorPhoneIndex = ocrText.toLowerCase().indexOf('dr');
    if (doctorPhoneIndex !== -1) {
      const doctorSection = ocrText.substring(doctorPhoneIndex, doctorPhoneIndex + 100);
      const phoneMatch = doctorSection.match(/\d{10}/);
      if (phoneMatch) {
        billData.doctorPhone = phoneMatch[0];
      }
    }

    // Extract items - look for lines that start with numbers
    this.extractRawItems(lines, billData);

    // Extract totals - look for total keywords
    this.extractRawTotals(ocrText, billData);

    // Extract amount in words - look for "Amount in Words" or similar
    const amountWordsIndex = ocrText.toLowerCase().indexOf('amount in words');
    if (amountWordsIndex !== -1) {
      const afterAmount = ocrText.substring(amountWordsIndex + 15).trim();
      const words = afterAmount.split(/\s+/);
      if (words.length > 0) {
        // Take the first few words that look like amount in words
        const amountWords = [];
        for (const word of words) {
          if (word && word.length > 1) {
            amountWords.push(word);
            if (amountWords.length >= 8) break; // Take first 8 words
          }
        }
        billData.amountInWords = amountWords.join(' ');
      }
    }
  }

  private extractRawItems(lines: string[], billData: MedicalBillDto): void {
    const items: MedicalBillItemDto[] = [];
    let itemIndex = 1;

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines
      if (!trimmedLine) continue;
      
      // Skip header lines (but not item lines that start with numbers)
      if (trimmedLine.toLowerCase().includes('s.no') && !/^\d+\s/.test(trimmedLine)) {
        continue;
      }
      if (trimmedLine.toLowerCase().includes('description') && !/^\d+\s/.test(trimmedLine)) {
        continue;
      }
      if (trimmedLine.toLowerCase().includes('pack') && !/^\d+\s/.test(trimmedLine)) {
        continue;
      }
      if (trimmedLine.toLowerCase().includes('mrp') && !/^\d+\s/.test(trimmedLine)) {
        continue;
      }
      if (trimmedLine.toLowerCase().includes('batch') && !/^\d+\s/.test(trimmedLine)) {
        continue;
      }
      if (trimmedLine.toLowerCase().includes('exp') && !/^\d+\s/.test(trimmedLine)) {
        continue;
      }
      if (trimmedLine.toLowerCase().includes('qty') && !/^\d+\s/.test(trimmedLine)) {
        continue;
      }
      if (trimmedLine.toLowerCase().includes('rate') && !/^\d+\s/.test(trimmedLine)) {
        continue;
      }
      if (trimmedLine.toLowerCase().includes('amount') && !/^\d+\s/.test(trimmedLine)) {
        continue;
      }

      // Look for lines that start with a number (item lines)
      // Also handle cases where OCR might have extra characters
      if (/^\d+[\s\|\:\-]/.test(trimmedLine)) {
        const item = this.parseRawItemLine(trimmedLine, itemIndex);
        if (item && item.itemDescription && item.itemDescription.length > 2) {
          items.push(item);
          itemIndex++;
        }
      }
    }

    billData.items = items;
  }

  private parseRawItemLine(line: string, sNo: number): MedicalBillItemDto | null {
    // Clean up the line - remove extra characters that OCR might add
    let cleanLine = line.trim();
    
    // Remove common OCR artifacts
    cleanLine = cleanLine.replace(/[|:;]/g, ' ');
    cleanLine = cleanLine.replace(/\s+/g, ' ');
    
    const parts = cleanLine.split(/\s+/);
    
    if (parts.length < 6) {
      return null;
    }

    try {
      // Helper function to safely parse numbers
      const safeParseFloat = (value: string): number => {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? 0 : parsed;
      };

      const safeParseInt = (value: string): number => {
        const parsed = parseInt(value);
        return isNaN(parsed) ? 0 : parsed;
      };

      // For the format: "1 PARACIP-650MG TAB 1*10 22.84 405 10/27 1 22.84 22.84"
      // Parts: [0: sNo, 1-2: description, 3: pack, 4: mrp, 5: batchNo, 6: exp, 7: qty, 8: rate, 9: amount]
      
      // Find where the numeric values start (MRP, Batch, Exp, Qty, Rate, Amount)
      let descriptionEndIndex = 1;
      let packIndex = -1;
      let mrpIndex = -1;
      
      // Look for the pack pattern (like "1*10", "1X200ML", "1X10")
      for (let i = 1; i < parts.length - 6; i++) {
        if (parts[i].match(/^\d+[\*X]\d+/)) {
          packIndex = i;
          descriptionEndIndex = i;
          break;
        }
      }
      
      // If no pack pattern found, try to find the first numeric value (MRP)
      if (packIndex === -1) {
        for (let i = 1; i < parts.length - 6; i++) {
          if (parts[i].match(/^\d+\.?\d*$/)) {
            mrpIndex = i;
            descriptionEndIndex = i;
            break;
          }
        }
      }
      
      // Extract description (everything between sNo and pack/mrp)
      const itemDescription = parts.slice(1, descriptionEndIndex).join(' ').trim();
      
      // Skip if description is too short or contains only special characters
      if (itemDescription.length < 3 || /^[^a-zA-Z0-9]*$/.test(itemDescription)) {
        return null;
      }
      
      // Extract pack
      const pack = packIndex !== -1 ? parts[packIndex] : '';
      
      // Find MRP (first decimal number after description)
      let actualMrpIndex = packIndex !== -1 ? packIndex + 1 : mrpIndex;
      if (actualMrpIndex === -1) {
        // Fallback: look for first decimal number
        for (let i = descriptionEndIndex; i < parts.length - 5; i++) {
          if (parts[i].match(/^\d+\.\d+$/)) {
            actualMrpIndex = i;
            break;
          }
        }
      }
      
      // Extract remaining fields based on the pattern
      const mrp = actualMrpIndex !== -1 ? safeParseFloat(parts[actualMrpIndex]) : 0;
      const batchNo = actualMrpIndex !== -1 && actualMrpIndex + 1 < parts.length ? parts[actualMrpIndex + 1] : '';
      const exp = actualMrpIndex !== -1 && actualMrpIndex + 2 < parts.length ? parts[actualMrpIndex + 2] : '';
      const qty = actualMrpIndex !== -1 && actualMrpIndex + 3 < parts.length ? safeParseInt(parts[actualMrpIndex + 3]) : 0;
      const rate = actualMrpIndex !== -1 && actualMrpIndex + 4 < parts.length ? safeParseFloat(parts[actualMrpIndex + 4]) : 0;
      const amount = actualMrpIndex !== -1 && actualMrpIndex + 5 < parts.length ? safeParseFloat(parts[actualMrpIndex + 5]) : 0;

      return {
        sNo: sNo,
        itemDescription: itemDescription,
        pack: pack,
        mrp: mrp,
        batchNo: batchNo,
        exp: exp,
        qty: qty,
        rate: rate,
        amount: amount
      };
    } catch (e) {
      return null;
    }
  }

  private extractRawTotals(ocrText: string, billData: MedicalBillDto): void {
    // Helper function to safely parse numbers
    const safeParseFloat = (value: string): number => {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    };

    const safeParseInt = (value: string): number => {
      const parsed = parseInt(value);
      return isNaN(parsed) ? 0 : parsed;
    };

    // Extract sub total
    const subTotalIndex = ocrText.toLowerCase().indexOf('sub total');
    if (subTotalIndex !== -1) {
      const afterSubTotal = ocrText.substring(subTotalIndex + 9).trim();
      const numberMatch = afterSubTotal.match(/[\d.]+/);
      if (numberMatch) {
        billData.subTotal = safeParseFloat(numberMatch[0]);
      }
    }

    // Extract total quantity
    const totalQtyIndex = ocrText.toLowerCase().indexOf('totalqty');
    if (totalQtyIndex !== -1) {
      const afterTotalQty = ocrText.substring(totalQtyIndex + 8).trim();
      const numberMatch = afterTotalQty.match(/\d+/);
      if (numberMatch) {
        billData.totalQty = safeParseInt(numberMatch[0]);
      }
    }

    // Extract less discount
    const discountIndex = ocrText.toLowerCase().indexOf('less discount');
    if (discountIndex !== -1) {
      const afterDiscount = ocrText.substring(discountIndex + 12).trim();
      const numberMatch = afterDiscount.match(/[\d.]+/);
      if (numberMatch) {
        billData.lessDiscount = safeParseFloat(numberMatch[0]);
      }
    }

    // Extract other adjustments
    const otherAdjIndex = ocrText.toLowerCase().indexOf('other adj');
    if (otherAdjIndex !== -1) {
      const afterOtherAdj = ocrText.substring(otherAdjIndex + 9).trim();
      const numberMatch = afterOtherAdj.match(/[\d.]+/);
      if (numberMatch) {
        billData.otherAdj = safeParseFloat(numberMatch[0]);
      }
    }

    // Extract round off
    const roundOffIndex = ocrText.toLowerCase().indexOf('round off');
    if (roundOffIndex !== -1) {
      const afterRoundOff = ocrText.substring(roundOffIndex + 8).trim();
      const numberMatch = afterRoundOff.match(/[\d.]+/);
      if (numberMatch) {
        billData.roundOff = safeParseFloat(numberMatch[0]);
      }
    }

    // Extract grand total
    const grandTotalIndex = ocrText.toLowerCase().indexOf('grand total');
    if (grandTotalIndex !== -1) {
      const afterGrandTotal = ocrText.substring(grandTotalIndex + 11).trim();
      const numberMatch = afterGrandTotal.match(/[\d.]+/);
      if (numberMatch) {
        billData.grandTotal = safeParseFloat(numberMatch[0]);
      }
    }
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
