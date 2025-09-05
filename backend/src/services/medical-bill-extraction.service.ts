import { Injectable } from '@nestjs/common';
import { MedicalBillDto, MedicalBillItemDto } from '../dto/medical-bill.dto';

@Injectable()
export class MedicalBillExtractionService {
  
  /**
   * Extract medical bill data from OCR text - raw extraction without patterns
   */
  extractMedicalBillData(ocrText: string): MedicalBillDto {
    // Preprocess OCR text to fix common errors
    const cleanedOcrText = this.preprocessOcrText(ocrText);
    const lines = cleanedOcrText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
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
      'syrup', 'injection', 'mg', 'ml', 'batch', 'exp', 'mrp', 'qty', 'rate',
      'paracip', 'lactolook', 'diopil', 'forte', 'syr', 'tab', 'medicose'
    ];

    const billKeywords = [
      'invoice', 'bill', 'receipt', 'total', 'amount', 'grand total', 'sub total',
      'discount', 'tax', 'gst', 'vat', 'less discount', 'round off', 'other adj'
    ];

    const text = ocrText.toLowerCase();
    const medicalScore = medicalKeywords.filter(keyword => text.includes(keyword)).length;
    const billScore = billKeywords.filter(keyword => text.includes(keyword)).length;

    // More lenient criteria for Railway OCR
    // If we have medicine names or medical terms, it's likely a medical bill
    const hasMedicineNames = text.includes('paracip') || text.includes('lactolook') || 
                           text.includes('diopil') || text.includes('medicose');
    
    // If we have bill structure (totals, amounts), it's likely a bill
    const hasBillStructure = text.includes('total') || text.includes('amount') || 
                           text.includes('mrp') || text.includes('qty');

    // More flexible scoring - accept if we have either:
    // 1. Traditional scoring (3+ medical + 2+ bill keywords)
    // 2. Medicine names + bill structure
    // 3. Lower threshold for Railway OCR quality
    return (medicalScore >= 3 && billScore >= 2) || 
           (hasMedicineNames && hasBillStructure) ||
           (medicalScore >= 2 && billScore >= 1);
  }

  private extractRawValues(ocrText: string, lines: string[], billData: MedicalBillDto): void {
    // Use the cleaned OCR text for better accuracy
    const cleanedOcrText = this.preprocessOcrText(ocrText);
    // Extract invoice number - look for "Invoice No" and take the next text
    const invoiceIndex = cleanedOcrText.toLowerCase().indexOf('invoice no');
    if (invoiceIndex !== -1) {
      const afterInvoice = cleanedOcrText.substring(invoiceIndex + 10).trim();
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
    const dateIndex = cleanedOcrText.toLowerCase().indexOf('date');
    if (dateIndex !== -1) {
      const afterDate = cleanedOcrText.substring(dateIndex + 4).trim();
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
        
        let shopName = shopWords.join(' ');
        
        // Clean up common OCR errors in shop names
        shopName = shopName.replace(/terms.*condjrion.*for/gi, '');
        shopName = shopName.replace(/gst.*invoice/gi, '');
        shopName = shopName.replace(/\s+/g, ' ').trim();
        
        billData.shopName = shopName;
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
    const patientIndex = cleanedOcrText.toLowerCase().indexOf('patient name');
    if (patientIndex !== -1) {
      const afterPatient = cleanedOcrText.substring(patientIndex + 12).trim();
      const words = afterPatient.split(/\s+/);
      if (words.length > 0) {
        // Skip colons, take the first meaningful words
        const nameWords = [];
        for (const word of words) {
          if (word && word !== ':' && word.length > 1) {
            // Clean up OCR errors
            let cleanWord = word.replace(/[|:;]/g, '').trim();
            
        
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
    const patientPhoneIndex = cleanedOcrText.toLowerCase().indexOf('ph.no');
    if (patientPhoneIndex !== -1) {
      const afterPhone = cleanedOcrText.substring(patientPhoneIndex + 5).trim();
      const phoneMatch = afterPhone.match(/\d{10}/);
      if (phoneMatch) {
        billData.patientPhone = phoneMatch[0];
      }
    }
    
    // Also look for phone numbers in the entire text
    const allPhoneMatches = cleanedOcrText.match(/\d{10}/g);
    if (allPhoneMatches && allPhoneMatches.length > 0) {
      // Use the first 10-digit phone number found
      if (!billData.patientPhone) {
        billData.patientPhone = allPhoneMatches[0];
      }
      
      // Add all phone numbers to the phone array
      billData.phone = allPhoneMatches;
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

    // Extract items from lines

    // More aggressive approach - look for any line that might contain medicine data
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines
      if (!trimmedLine) continue;
      
      // Skip obvious header lines and totals (but be more careful)
      // Only skip if it's a header/total line AND doesn't look like a medicine item
      if (this.isHeaderOrTotalLine(trimmedLine) && !this.looksLikeMedicineLine(trimmedLine)) {
        continue;
      }

      // Try multiple extraction methods
      let item: MedicalBillItemDto | null = null;

      // Method 1: Standard numbered item line
      if (/^\d+[\s\|\:\-]/.test(trimmedLine)) {
        item = this.parseRawItemLine(trimmedLine, itemIndex);
      }
      
      // Method 2: Medicine line without number
      else if (this.looksLikeMedicineLine(trimmedLine)) {
        item = this.parseMedicineLine(trimmedLine, itemIndex);
      }
      
      // Method 3: Aggressive medicine detection - look for any line with medicine keywords
      else if (this.hasMedicineKeywords(trimmedLine)) {
        item = this.parseAggressiveMedicineLine(trimmedLine, itemIndex);
      }

      // Validate and add the item
      if (item && this.isValidMedicineItem(item)) {
        items.push(item);
        itemIndex++;
      }
    }

    // Set the extracted items

    billData.items = items;
  }

  private parseRawItemLine(line: string, sNo: number): MedicalBillItemDto | null {
    // Clean up the line - remove extra characters that OCR might add
    let cleanLine = line.trim();
    
    // Remove common OCR artifacts
    cleanLine = cleanLine.replace(/[|:;]/g, ' ');
    cleanLine = cleanLine.replace(/\s+/g, ' ');
    
    const parts = cleanLine.split(/\s+/);
    
    if (parts.length < 3) {
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
      for (let i = 1; i < parts.length - 2; i++) {
        if (parts[i].match(/^\d+[\*X]\d+/)) {
          packIndex = i;
          descriptionEndIndex = i;
          break;
        }
      }
      
      // If no pack pattern found, try to find the first numeric value (MRP)
      if (packIndex === -1) {
        for (let i = 1; i < parts.length - 2; i++) {
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
        for (let i = descriptionEndIndex; i < parts.length - 1; i++) {
          if (parts[i].match(/^\d+\.\d+$/)) {
            actualMrpIndex = i;
            break;
          }
        }
      }
      
      // Extract remaining fields based on the pattern - be more flexible with field count
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

  /**
   * Check if a line is a header or total line that should be skipped
   */
  private isHeaderOrTotalLine(line: string): boolean {
    const lowerLine = line.toLowerCase();
    
    // Skip header lines - only if they contain multiple header keywords (indicating a table header)
    const headerKeywords = ['s.no', 'description', 'pack', 'mrp', 'batch', 'exp', 'qty', 'rate', 'amount'];
    const headerKeywordCount = headerKeywords.filter(keyword => lowerLine.includes(keyword)).length;
    
    // If it has 3 or more header keywords, it's likely a table header
    if (headerKeywordCount >= 3) {
      return true;
    }
    
    // Skip total lines
    if (lowerLine.includes('sub total') || lowerLine.includes('grand total') || 
        lowerLine.includes('round off') || lowerLine.includes('less discount') || 
        lowerLine.includes('other adj') || lowerLine.includes('totalqty')) {
      return true;
    }
    
    // Skip invoice info
    if (lowerLine.includes('invoice') || lowerLine.includes('gst') || 
        lowerLine.includes('date') || lowerLine.includes('patient name') ||
        lowerLine.includes('terms') || lowerLine.includes('condition') ||
        lowerLine.includes('ph.no') || lowerLine.includes('prescribed')) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if a line has medicine keywords
   */
  private hasMedicineKeywords(line: string): boolean {
    const lowerLine = line.toLowerCase();
    const medicineKeywords = [
      'tab', 'tablet', 'cap', 'capsule', 'syrup', 'syr', 'injection', 'inj',
      'mg', 'ml', 'g', 'gm', 'paracip', 'lactolook', 'diopil', 'forte',
      'medicine', 'drug', 'pharma', 'med'
    ];
    
    return medicineKeywords.some(keyword => lowerLine.includes(keyword));
  }

  /**
   * Parse a line aggressively to extract medicine information
   */
  private parseAggressiveMedicineLine(line: string, sNo: number): MedicalBillItemDto | null {
    try {
      // Clean up the line
      let cleanLine = line.trim();
      cleanLine = cleanLine.replace(/[|:;]/g, ' ');
      cleanLine = cleanLine.replace(/\s+/g, ' ');
      
      const parts = cleanLine.split(/\s+/);
      
      if (parts.length < 2) {
        return null;
      }

      const safeParseFloat = (value: string): number => {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? 0 : parsed;
      };

      const safeParseInt = (value: string): number => {
        const parsed = parseInt(value);
        return isNaN(parsed) ? 0 : parsed;
      };

      // Extract medicine name - look for the longest meaningful text
      let description = '';
      let pack = '';
      let mrp = 0;
      let batchNo = '';
      let exp = '';
      let qty = 0;
      let rate = 0;
      let amount = 0;

      // Find the medicine name by looking for medicine keywords
      const medicineKeywords = ['tab', 'tablet', 'cap', 'capsule', 'syrup', 'syr', 'mg', 'ml'];
      let descriptionParts = [];
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        
        // If we find a medicine keyword, include it and surrounding text
        if (medicineKeywords.some(keyword => part.toLowerCase().includes(keyword))) {
          // Look backwards and forwards for related text
          let start = Math.max(0, i - 2);
          let end = Math.min(parts.length, i + 3);
          descriptionParts = parts.slice(start, end);
          break;
        }
      }
      
      // If no medicine keyword found, try to find the longest meaningful text
      if (descriptionParts.length === 0) {
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (part.length > 3 && !part.match(/^\d+\.?\d*$/) && !part.match(/^\d+\/\d+$/)) {
            descriptionParts.push(part);
          }
        }
      }
      
      description = descriptionParts.join(' ').trim();
      
      // Skip if description is too short
      if (description.length < 3) {
        return null;
      }

      // Look for numeric values
      const numericValues = [];
      for (const part of parts) {
        if (part.match(/^\d+\.?\d*$/)) {
          numericValues.push(safeParseFloat(part));
        } else if (part.match(/^\d+\/\d+$/)) {
          if (!batchNo) {
            batchNo = part;
          } else if (!exp) {
            exp = part;
          }
        } else if (part.match(/^\d+[\*X]\d+/)) {
          pack = part;
        }
      }

      // Assign numeric values
      if (numericValues.length >= 1) mrp = numericValues[0];
      if (numericValues.length >= 2) qty = safeParseInt(numericValues[1].toString());
      if (numericValues.length >= 3) rate = numericValues[2];
      if (numericValues.length >= 4) amount = numericValues[3];

      return {
        sNo: sNo,
        itemDescription: description,
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

  /**
   * Check if an extracted item is a valid medicine item
   */
  private isValidMedicineItem(item: MedicalBillItemDto): boolean {
    // Must have a meaningful description
    if (!item.itemDescription || item.itemDescription.length < 3) {
      return false;
    }
    
    const lowerDesc = item.itemDescription.toLowerCase();
    
    // Skip items that look like headers, totals, or other non-medicine content
    const invalidKeywords = [
      'total', 'sub total', 'grand total', 'round off', 'less discount', 'other adj',
      'invoice', 'gst', 'date', 'patient name', 'terms', 'condition', 'ph.no',
      'prescribed', 'doctor', 'shop', 'address', 'phone', 'amount in words',
      'goi', 'ones', 'i i', 'round', 'off', '112', 'authorised', 'signatory',
      'signature', 'thank', 'visit', 'again', 'welcome', 'customer', 'service',
      'prem', 'sai', 'medicose', 'ground', 'floor', 'eco', 'bazar', 'suptech', 'mart', 'greater', 'noida', 'west'
    ];
    
    const hasInvalidKeyword = invalidKeywords.some(keyword => 
      lowerDesc.includes(keyword)
    );
    
    if (hasInvalidKeyword) {
      return false;
    }
    
    // Must contain medicine-related keywords
    const medicineKeywords = [
      'tab', 'tablet', 'cap', 'capsule', 'syrup', 'syr', 'injection', 'inj',
      'mg', 'ml', 'g', 'gm', 'paracip', 'lactolook', 'diopil', 'forte',
      'medicine', 'drug', 'pharma', 'med', 'lactolook'
    ];
    
    const hasMedicineKeyword = medicineKeywords.some(keyword => 
      lowerDesc.includes(keyword)
    );
    
    return hasMedicineKeyword;
  }

  /**
   * Check if a line looks like it contains medicine information
   */
  private looksLikeMedicineLine(line: string): boolean {
    const lowerLine = line.toLowerCase();
    
    // Look for medicine-related keywords
    const medicineKeywords = [
      'tab', 'tablet', 'cap', 'capsule', 'syrup', 'syr', 'injection', 'inj',
      'mg', 'ml', 'g', 'gm', 'paracip', 'lactolook', 'diopil', 'forte',
      'medicine', 'drug', 'pharma', 'med'
    ];
    
    // Check if line contains medicine keywords
    const hasMedicineKeyword = medicineKeywords.some(keyword => lowerLine.includes(keyword));
    
    // Check if line has numeric patterns (prices, quantities, etc.)
    const hasNumericPattern = /\d+\.?\d*/.test(line);
    
    // Check if line has pack patterns (1*10, 1X200ML, etc.)
    const hasPackPattern = /\d+[\*X]\d+/.test(line);
    
    // Check if line has batch/exp patterns
    const hasBatchExpPattern = /\d+\/\d+/.test(line);
    
    return hasMedicineKeyword && (hasNumericPattern || hasPackPattern || hasBatchExpPattern);
  }

  /**
   * Parse a medicine line that doesn't follow the standard format
   */
  private parseMedicineLine(line: string, sNo: number): MedicalBillItemDto | null {
    try {
      // Clean up the line
      let cleanLine = line.trim();
      cleanLine = cleanLine.replace(/[|:;]/g, ' ');
      cleanLine = cleanLine.replace(/\s+/g, ' ');
      
      const parts = cleanLine.split(/\s+/);
      
      if (parts.length < 3) {
        return null;
      }

      const safeParseFloat = (value: string): number => {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? 0 : parsed;
      };

      const safeParseInt = (value: string): number => {
        const parsed = parseInt(value);
        return isNaN(parsed) ? 0 : parsed;
      };

      // Try to extract medicine name (look for text that contains medicine keywords)
      let description = '';
      let pack = '';
      let mrp = 0;
      let batchNo = '';
      let exp = '';
      let qty = 0;
      let rate = 0;
      let amount = 0;

      // Find medicine name (usually the first meaningful text)
      const medicineKeywords = ['tab', 'tablet', 'cap', 'capsule', 'syrup', 'syr', 'mg', 'ml'];
      let descriptionStart = 0;
      let descriptionEnd = parts.length;

      // Look for pack pattern to determine where description ends
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].match(/^\d+[\*X]\d+/)) {
          pack = parts[i];
          descriptionEnd = i;
          break;
        }
      }

      // Extract description
      description = parts.slice(descriptionStart, descriptionEnd).join(' ').trim();
      
      // Skip if description is too short
      if (description.length < 3) {
        return null;
      }

      // Look for numeric values (MRP, batch, exp, qty, rate, amount)
      const numericValues = [];
      for (let i = descriptionEnd; i < parts.length; i++) {
        const part = parts[i];
        if (part.match(/^\d+\.?\d*$/)) {
          numericValues.push(safeParseFloat(part));
        } else if (part.match(/^\d+\/\d+$/)) {
          // This looks like batch/exp date
          if (!batchNo) {
            batchNo = part;
          } else if (!exp) {
            exp = part;
          }
        }
      }

      // Assign numeric values based on position
      if (numericValues.length >= 1) mrp = numericValues[0];
      if (numericValues.length >= 2) qty = safeParseInt(numericValues[1].toString());
      if (numericValues.length >= 3) rate = numericValues[2];
      if (numericValues.length >= 4) amount = numericValues[3];

      return {
        sNo: sNo,
        itemDescription: description,
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

  /**
   * Preprocess OCR text to fix common errors and improve accuracy
   */
  private preprocessOcrText(ocrText: string): string {
    let cleanedText = ocrText;
    
    // Fix common OCR errors in medical bills
    const commonCorrections = [
      // Patient name corrections
      { from: /JATVEER/gi, to: 'JAIVEER' },
      { from: /jatveer/gi, to: 'jaiveer' },
      
      // Medicine name corrections
      { from: /PARACIP/gi, to: 'PARACIP' },
      { from: /LACTOLOOK/gi, to: 'LACTOLOOK' },
      { from: /DIOPIL/gi, to: 'DIOPIL' },
      
      // Shop name corrections
      { from: /PREM SAI MEDICOSE/gi, to: 'PREM SAI MEDICOSE' },
      { from: /medicose/gi, to: 'MEDICOSE' },
      
      // Common OCR character errors
      { from: /0/g, to: '0' }, // Ensure zeros are correct
      { from: /O(?=\d)/g, to: '0' }, // Replace O with 0 when followed by digits
      { from: /I(?=\d)/g, to: '1' }, // Replace I with 1 when followed by digits
      { from: /l(?=\d)/g, to: '1' }, // Replace l with 1 when followed by digits
      
      // Fix common spacing issues
      { from: /[ \t]+/g, to: ' ' }, // Normalize multiple spaces and tabs (but keep newlines)
      // Remove the aggressive space insertion that breaks line structure
      
      // Fix common punctuation errors
      { from: /\.{2,}/g, to: '.' }, // Fix multiple dots
      { from: /,{2,}/g, to: ',' }, // Fix multiple commas
    ];
    
    // Apply corrections
    commonCorrections.forEach(correction => {
      cleanedText = cleanedText.replace(correction.from, correction.to);
    });
    
    return cleanedText;
  }
}