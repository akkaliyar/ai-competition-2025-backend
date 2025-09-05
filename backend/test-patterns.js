// Test the extraction patterns
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

console.log('Testing extraction patterns...\n');

// Test patient name patterns
const patientPatterns = [
  /Patient\s+Name\s*:\s*MR\s+JATVEER\s*[a-z]*/i,
  /Patient\s+Name\s*:\s*MR\s+JAIVEER\s*[a-z]*/i,
  /Patient\s+Name\s*:\s*([A-Z\s]+[a-z]*)/i,
  /(?:patient\s*name|name)\s*:?\s*([A-Z\s]+[a-z]*)/i
];

console.log('Patient Name Patterns:');
for (let i = 0; i < patientPatterns.length; i++) {
  const match = ocrText.match(patientPatterns[i]);
  console.log(`Pattern ${i + 1}: ${match ? match[0] : 'No match'}`);
}

// Test patient phone patterns
const patientPhonePatterns = [
  /Ph\.No\.s\s*7\s*763496/i,
  /Ph\.No\.s\s*(\d{10})/i,
  /(?:patient\s*phone|ph\.?\s*no\.?)\s*:?\s*(\d{10})/i,
  /(\d{10})/g
];

console.log('\nPatient Phone Patterns:');
for (let i = 0; i < patientPhonePatterns.length; i++) {
  const match = ocrText.match(patientPhonePatterns[i]);
  console.log(`Pattern ${i + 1}: ${match ? match[0] : 'No match'}`);
}

// Test amount in words patterns
const amountWordsPatterns = [
  /Amountin\s+Words\s*7s\s*ome\s+Thousand\s+One\s+Hundred\s+and\s+Forty\s+Lo\s+YR\s+SR\s+a/i,
  /Amountin\s+Words\s*([^0-9]+(?:thousand|hundred|forty)[^0-9]*)/i,
  /(?:amount\s*in\s*words|rs\.?\s*[^0-9]+only)/i,
  /(rs\.?\s*[^0-9]+only)/i,
  /(one\s+thousand[^0-9]*only)/i,
  /(thousand[^0-9]*only)/i,
  /(rs\.?\s*one\s+thousand\s+one\s+hundred\s+and\s+forty\s+only)/i,
  /(one\s+thousand\s+one\s+hundred\s+and\s+forty\s+only)/i
];

console.log('\nAmount in Words Patterns:');
for (let i = 0; i < amountWordsPatterns.length; i++) {
  const match = ocrText.match(amountWordsPatterns[i]);
  console.log(`Pattern ${i + 1}: ${match ? match[0] : 'No match'}`);
}

// Test specific checks
console.log('\nSpecific Checks:');
console.log('Contains "763496":', ocrText.includes('763496'));
console.log('Contains "Ph.No.s 7 763496":', ocrText.includes('Ph.No.s 7 763496'));
console.log('Contains "Thousand One Hundred and Forty":', ocrText.includes('Thousand One Hundred and Forty'));
