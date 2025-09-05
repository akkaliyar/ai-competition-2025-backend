const axios = require('axios');

async function testExtraction() {
  try {
    console.log('Testing medical bill extraction...');
    
    // Test with the actual OCR text from the image
    const ocrText = `ek YL BN
S ha
hi =
PREM co re GST INVOICE Invoice No.. R006183 Date : 13-05-2025 /
TSA DICOSE Patient Name : MR JATVEER y
' Ph.No.s 7 763496
S— Prescribed by Dr
S.No Item Ben To — a —
Description ————{ Pack. , MRP. [Batch No. Exp.| Qty. [Rate | Amount
2 : g 1*10 22.84 | 405 1027 10 22.84 22.84
| 1X200Mm1 257.88 | 24200 9.26 1 257.8% 257.88
[1X10 101.50 | MPF242581 | 5/26 | 30 101.50 304.50
[1X10 101.50 | MP1243501 | 826 70 | 10150 710.50
|
|
| Be i RTE
[Amountin Words 7s ome Thousand One Hundred and Forty Lo YR SR a —
| **CETWELL soon Sub Total 1295.72
| TotalQty: 111 Less Discount Be" J
Other Adj 0.( [|
Terms & Condjrion For PREM SAI MEDICOSE > -0.23 |
| Goi ones i i Round Off 112 .00 ||
Bois not paid due 4 Vi inter GRAND TOTAL ory -
Rd i Authorised signatory } ay. RE. —— ——`;

    const response = await axios.post('http://localhost:8080/api/medical-bills/extract-from-text', {
      text: ocrText
    });

    console.log('Extraction Result:');
    console.log(JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testExtraction();
