import React, { useState } from 'react';
import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType } from 'docx';
import { saveAs } from 'file-saver';

interface DataTableProps {
  data: any;
  fileName: string;
  fileType: 'image' | 'pdf' | 'excel';
}

const DataTable: React.FC<DataTableProps> = ({ data, fileName, fileType }) => {
  const [activeTab, setActiveTab] = useState<string>('material-ui'); // Default to Material-UI for invoice data

  // Handle case where data is undefined or null
  if (!data) {
    return (
      <div className="data-table-container">
        <div className="data-table-header">
          <div className="table-title">
            <h3>📄 No Data Available: {fileName}</h3>
          </div>
        </div>
        <div className="tab-content">
          <div className="empty-state">
            <p>No processed data available for this file.</p>
          </div>
        </div>
      </div>
    );
  }

  const renderOcrData = () => {
    if (data.type !== 'ocr') return null;

    const tabs = [
      { id: 'overview', label: '📊 Overview', icon: '📊' },
      { id: 'lines', label: '📝 Lines', icon: '📝' },
      { id: 'words', label: '🔤 Words', icon: '🔤' },
      { id: 'raw', label: '📄 Raw Text', icon: '📄' }
    ];

    if (data.content.tableData && data.content.tableData.length > 0) {
      tabs.splice(1, 0, { id: 'table', label: '📋 Table Data', icon: '📋' });
    }

    return (
      <div className="data-table-container">
        <div className="data-table-header">
          <div className="table-title">
            <h3>🖼️ OCR Results: {fileName}</h3>
            <div className="export-buttons">
              <button onClick={() => exportToPDF()} className="export-btn pdf-btn">
                📕 Export PDF
              </button>
            </div>
          </div>
          
          <div className="tab-navigation">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="tab-icon">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="tab-content">
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'table' && renderTableData()}
          {activeTab === 'lines' && renderLinesTable()}
          {activeTab === 'words' && renderWordsTable()}
          {activeTab === 'raw' && renderRawText()}
        </div>
      </div>
    );
  };

  const renderOverview = () => (
    <div className="overview-section">
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h4>Statistics</h4>
            <p><strong>Characters:</strong> {data.statistics.totalCharacters.toLocaleString()}</p>
            <p><strong>Words:</strong> {data.statistics.totalWords.toLocaleString()}</p>
            <p><strong>Lines:</strong> {data.statistics.totalLines}</p>
            <p><strong>Avg Words/Line:</strong> {data.statistics.averageWordsPerLine}</p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">📄</div>
          <div className="stat-content">
            <h4>File Info</h4>
            <p><strong>Name:</strong> {data.metadata.fileName}</p>
            <p><strong>Size:</strong> {(data.metadata.fileSize / 1024).toFixed(2)} KB</p>
            <p><strong>Type:</strong> {data.metadata.mimeType}</p>
            <p><strong>Processed:</strong> {new Date(data.metadata.processedAt).toLocaleString()}</p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">🔍</div>
          <div className="stat-content">
            <h4>Content Analysis</h4>
            <p><strong>Structure:</strong> {data.content.detectedStructure}</p>
            <p><strong>Has Tables:</strong> {data.content.tableData ? 'Yes' : 'No'}</p>
            <p><strong>Quality:</strong> {getContentQuality()}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTableData = () => {
    if (!data.content.tableData) return <p>No table data detected.</p>;

    return (
      <div className="table-section">
        <h4>📋 Detected Table Data ({data.content.tableData.length} rows)</h4>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Row #</th>
                <th>Original Text</th>
                {getTableColumns().map((col, idx) => (
                  <th key={idx}>Column {idx + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.content.tableData.map((row: any, idx: number) => (
                <tr key={idx}>
                  <td>{row.rowNumber}</td>
                  <td className="original-text">{row.originalText}</td>
                  {getTableColumns().map((col, colIdx) => (
                    <td key={colIdx}>{row[`column_${colIdx + 1}`] || ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderLinesTable = () => (
    <div className="table-section">
      <h4>📝 Text Lines ({data.content.lines.length} lines)</h4>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Line #</th>
              <th>Text Content</th>
              <th>Words</th>
              <th>Characters</th>
            </tr>
          </thead>
          <tbody>
            {data.content.lines.map((line: any) => (
              <tr key={line.lineNumber}>
                <td>{line.lineNumber}</td>
                <td className="text-content">{line.text}</td>
                <td>{line.wordCount}</td>
                <td>{line.characterCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderWordsTable = () => (
    <div className="table-section">
      <h4>🔤 Words ({data.content.words.length} words)</h4>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Position</th>
              <th>Word</th>
              <th>Length</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {data.content.words.slice(0, 100).map((word: any) => (
              <tr key={word.position}>
                <td>{word.position}</td>
                <td className="word-text">{word.text}</td>
                <td>{word.length}</td>
                <td>{getWordType(word.text)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.content.words.length > 100 && (
        <p className="showing-note">Showing first 100 words of {data.content.words.length} total</p>
      )}
    </div>
  );

  const renderRawText = () => (
    <div className="raw-text-section">
      <h4>📄 Raw Extracted Text</h4>
      <div className="raw-text-container">
        <pre className="raw-text">{data.content.rawText}</pre>
      </div>
      <div className="raw-text-actions">
        <button 
          onClick={() => navigator.clipboard.writeText(data.content.rawText)}
          className="copy-btn"
        >
          📋 Copy Text
        </button>
      </div>
    </div>
  );

  const getTableColumns = () => {
    if (!data.content.tableData || data.content.tableData.length === 0) return [];
    const firstRow = data.content.tableData[0];
    return Object.keys(firstRow).filter(key => key.startsWith('column_'));
  };

  const getContentQuality = () => {
    const ratio = data.statistics.totalWords / Math.max(data.statistics.totalLines, 1);
    if (ratio > 10) return 'High';
    if (ratio > 5) return 'Medium';
    return 'Low';
  };

  const getWordType = (word: string) => {
    if (/^\d+$/.test(word)) return 'Number';
    if (/^[A-Z]+$/.test(word)) return 'Uppercase';
    if (/^[a-z]+$/.test(word)) return 'Lowercase';
    if (/^[A-Z][a-z]+$/.test(word)) return 'Capitalized';
    return 'Mixed';
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPosition = 20;

    // Title
    doc.setFontSize(16);
    doc.text(`OCR Results: ${fileName}`, 20, yPosition);
    yPosition += 20;

    // Statistics
    doc.setFontSize(12);
    doc.text('Statistics:', 20, yPosition);
    yPosition += 10;
    doc.setFontSize(10);
    doc.text(`Characters: ${data.statistics.totalCharacters}`, 20, yPosition);
    yPosition += 7;
    doc.text(`Words: ${data.statistics.totalWords}`, 20, yPosition);
    yPosition += 7;
    doc.text(`Lines: ${data.statistics.totalLines}`, 20, yPosition);
    yPosition += 15;

    // Raw text
    doc.setFontSize(12);
    doc.text('Extracted Text:', 20, yPosition);
    yPosition += 10;
    
    doc.setFontSize(9);
    const splitText = doc.splitTextToSize(data.content.rawText, pageWidth - 40);
    doc.text(splitText, 20, yPosition);

    doc.save(`${fileName}_OCR_Results.pdf`);
  };

  const exportToDOCX = async () => {
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({
            text: `OCR Results: ${fileName}`,
            heading: 'Title'
          }),
          new Paragraph({
            text: `Statistics: ${data.statistics.totalCharacters} characters, ${data.statistics.totalWords} words, ${data.statistics.totalLines} lines`
          }),
          new Paragraph({
            text: 'Extracted Text:',
            heading: 'Heading1'
          }),
          new Paragraph({
            text: data.content.rawText
          })
        ]
      }]
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${fileName}_OCR_Results.docx`);
  };

  const renderExcelData = () => {
  if (data.type !== 'spreadsheet') return null;

  return (
    <div className="data-table-container">
              <div className="data-table-header">
          <div className="table-title">
            <h3>
              {data.metadata?.ocrEngine ? '🖼️ OCR Table Data: ' : '📊 Excel Data: '}{fileName}
              {data.metadata?.ocrEngine && (
                <span className="confidence-badge">{data.metadata.confidence}% confidence</span>
              )}
            </h3>
            <div className="export-buttons">
            <button onClick={() => exportExcelToPDF()} className="export-btn pdf-btn">
              📕 Export Table PDF
            </button>
          </div>
        </div>
      </div>

      <div className="tab-content">
        {/* Enhanced Overview Section */}
        <div className="overview-section">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">{data.metadata?.ocrEngine ? '🖼️' : '📊'}</div>
              <div className="stat-content">
                <h4>{data.metadata?.ocrEngine ? 'OCR Table Data' : 'Spreadsheet Overview'}</h4>
                <p><strong>Total Sheets:</strong> {data.totalSheets}</p>
                <p><strong>File:</strong> {fileName}</p>
                {data.metadata && (
                  <>
                    <p><strong>Total Rows:</strong> {data.metadata.totalDataRows?.toLocaleString() || 0}</p>
                    <p><strong>Processed:</strong> {new Date(data.metadata.processedAt).toLocaleDateString()}</p>
                    {data.metadata.ocrEngine && (
                      <>
                        <p><strong>OCR Engine:</strong> {data.metadata.ocrEngine}</p>
                        <p><strong>Detection Confidence:</strong> {data.metadata.confidence}%</p>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">📋</div>
              <div className="stat-content">
                <h4>Sheet Summary</h4>
                {Object.entries(data.sheets).map(([sheetName, sheetInfo]: [string, any]) => (
                  <p key={sheetName}>
                    <strong>{sheetName}:</strong> {sheetInfo.rowCount} rows × {sheetInfo.columnCount} cols
                  </p>
                ))}
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">🔍</div>
              <div className="stat-content">
                <h4>Data Quality</h4>
                <p><strong>Non-empty Sheets:</strong> {Object.values(data.sheets).filter((sheet: any) => sheet.rowCount > 0).length}</p>
                <p><strong>Total Columns:</strong> {Object.values(data.sheets).reduce((sum: number, sheet: any) => sum + sheet.columnCount, 0)}</p>
                <p><strong>Status:</strong> <span className="status-success">✅ Parsed</span></p>
                {data.metadata?.ocrEngine && (
                  <p><strong>Source:</strong> OCR Extraction</p>
                )}
              </div>
            </div>
            
            {/* OCR Source Information */}
            {data.ocrSource && (
              <div className="stat-card ocr-source">
                <div className="stat-icon">📝</div>
                <div className="stat-content">
                  <h4>Original OCR Text</h4>
                  <p><strong>Characters:</strong> {data.ocrSource.statistics.totalCharacters.toLocaleString()}</p>
                  <p><strong>Words:</strong> {data.ocrSource.statistics.totalWords.toLocaleString()}</p>
                  <p><strong>Lines:</strong> {data.ocrSource.statistics.totalLines}</p>
                  <p><strong>Structure:</strong> {data.metadata.detectedStructure}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Enhanced Sheet Display */}
        {Object.entries(data.sheets).map(([sheetName, sheetData]: [string, any]) => (
          <div key={sheetName} className="table-section">
            <div className="sheet-header">
              <h4>📋 Sheet: {sheetName}</h4>
              <div className="sheet-stats">
                <span className="stat-badge">{sheetData.rowCount} rows</span>
                <span className="stat-badge">{sheetData.columnCount} columns</span>
                {sheetData.sheetInfo?.range && (
                  <span className="stat-badge">Range: {sheetData.sheetInfo.range}</span>
                )}
              </div>
            </div>
            
            {sheetData.data && sheetData.data.length > 0 ? (
              <>
                <div className="table-wrapper">
                  <table className="data-table excel-table">
                    <thead>
                      <tr>
                        <th className="row-number-header">#</th>
                        {sheetData.headers.map((header: string, idx: number) => (
                          <th key={idx} title={`Column ${idx + 1}: ${header}`}>
                            {header || `Column ${idx + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheetData.data.slice(0, 100).map((row: any, idx: number) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'even-row' : 'odd-row'}>
                          <td className="row-number">{idx + 1}</td>
                          {sheetData.headers.map((header: string, colIdx: number) => {
                            const cellValue = (row as any)[header];
                            return (
                              <td 
                                key={colIdx} 
                                className={getCellClass(cellValue)}
                                title={`${header}: ${cellValue}`}
                              >
                                {formatCellValue(cellValue)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {sheetData.data.length > 100 && (
                  <div className="showing-note">
                    📊 Displaying first 100 of {sheetData.data.length.toLocaleString()} rows
                    <button 
                      className="view-all-btn"
                      onClick={() => exportSheetData(sheetName, sheetData)}
                      title="Export complete sheet data as formatted table PDF"
                    >
                      📤 Export Complete Table
                    </button>
                  </div>
                )}

                {/* Data Preview Summary */}
                <div className="data-summary">
                  <h5>📈 Data Summary for {sheetName}</h5>
                  <div className="summary-stats">
                    <span>Total Rows: <strong>{sheetData.data.length.toLocaleString()}</strong></span>
                    <span>Columns: <strong>{sheetData.headers.length}</strong></span>
                    <span>Data Range: <strong>{sheetData.sheetInfo?.range || 'N/A'}</strong></span>
                    {sheetData.sheetInfo?.source === 'ocr_extraction' && (
                      <span>Source: <strong>OCR Table Detection</strong></span>
                    )}
                  </div>
                </div>

                {/* OCR Raw Text Display for OCR-extracted tables */}
                {data.ocrSource && sheetData.sheetInfo?.source === 'ocr_extraction' && (
                  <div className="ocr-raw-text">
                    <h5>📝 Original OCR Text</h5>
                    <div className="raw-text-content">
                      <div className="text-stats">
                        <span>📊 {data.ocrSource.statistics.totalCharacters} chars</span>
                        <span>🔤 {data.ocrSource.statistics.totalWords} words</span>
                        <span>📄 {data.ocrSource.statistics.totalLines} lines</span>
                        <span>🎯 {data.metadata.confidence}% confidence</span>
                      </div>
                      <div className="raw-text-display">
                        <pre>{data.ocrSource.rawText}</pre>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-sheet">
                <p>📋 This sheet appears to be empty or contains no readable data.</p>
                {sheetData.sheetInfo?.range && (
                  <p>Sheet range: {sheetData.sheetInfo.range}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const getCellClass = (value: any): string => {
  if (value === null || value === undefined || value === '') return 'cell-empty';
  if (typeof value === 'number') return 'cell-number';
  if (typeof value === 'string' && !isNaN(Number(value))) return 'cell-number';
  if (typeof value === 'string' && new Date(value).toString() !== 'Invalid Date') return 'cell-date';
  return 'cell-text';
};

const formatCellValue = (value: any): string => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  }
  return String(value);
};

const exportSheetData = async (sheetName: string, sheetData: any) => {
  // Create a comprehensive export for the full sheet with proper table formatting
  const doc = new jsPDF('landscape');
  let yPosition = 20;
  const margin = 20;
  const usableWidth = doc.internal.pageSize.getWidth() - 2 * margin;
  
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(`Sheet: ${sheetName}`, margin, yPosition);
  yPosition += 15;
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`${sheetData.data?.length || 0} rows × ${sheetData.headers?.length || 0} columns`, margin, yPosition);
  yPosition += 8;
  doc.text(`Range: ${sheetData.sheetInfo?.range || 'N/A'}`, margin, yPosition);
  yPosition += 8;
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, yPosition);
  yPosition += 20;

  if (sheetData.data && sheetData.data.length > 0 && sheetData.headers) {
    // Create multiple tables if needed to show all data
    const maxRowsPerTable = 30;
    const totalRows = sheetData.data.length;
    let processedRows = 0;
    
    while (processedRows < totalRows) {
      if (yPosition > 150) {
        doc.addPage();
        yPosition = 20;
      }
      
      const remainingRows = totalRows - processedRows;
      const rowsInThisTable = Math.min(maxRowsPerTable, remainingRows);
      const currentData = sheetData.data.slice(processedRows, processedRows + rowsInThisTable);
      
      if (processedRows > 0) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`Continued (rows ${processedRows + 1}-${processedRows + rowsInThisTable})`, margin, yPosition);
        yPosition += 10;
      }
      
      yPosition = createTableInPDF(doc, sheetData.headers, currentData, yPosition, margin, usableWidth);
      processedRows += rowsInThisTable;
    }
    
    // Add summary at the end
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 20;
    }
    
    yPosition += 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', margin, yPosition);
    yPosition += 10;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`• Total Records: ${totalRows}`, margin, yPosition);
    yPosition += 6;
    doc.text(`• Total Columns: ${sheetData.headers.length}`, margin, yPosition);
    yPosition += 6;
    doc.text(`• Column Names: ${sheetData.headers.join(', ')}`, margin, yPosition);
    
  } else {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'italic');
    doc.text('No data available in this sheet', margin, yPosition);
  }
  
  // Add footer to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Page ${i} of ${totalPages} • ${sheetName} • Generated by AI CRM`, margin, 200);
  }
  
  doc.save(`${fileName}_${sheetName}_Complete_Table.pdf`);
};

  const renderPdfData = () => {
  return (
    <div className="data-table-container">
      <div className="data-table-header">
        <div className="table-title">
          <h3>📕 PDF Content: {fileName}</h3>
          <div className="export-buttons">
            <button onClick={() => exportPdfToPDF()} className="export-btn pdf-btn">
              📕 Export PDF
            </button>
          </div>
        </div>
      </div>

      <div className="tab-content">
        <div className="overview-section">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">📄</div>
              <div className="stat-content">
                <h4>PDF Statistics</h4>
                <p><strong>Characters:</strong> {data.extractedText?.length || 0}</p>
                <p><strong>Words:</strong> {data.extractedText?.split(/\s+/).length || 0}</p>
                <p><strong>Lines:</strong> {data.extractedText?.split('\n').length || 0}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="raw-text-section">
          <h4>📄 Extracted PDF Text</h4>
          <div className="raw-text-container">
            <pre className="raw-text">{data.extractedText}</pre>
          </div>
          <div className="raw-text-actions">
            <button 
              onClick={() => navigator.clipboard.writeText(data.extractedText)}
              className="copy-btn"
            >
              📋 Copy Text
            </button>
          </div>
        </div>
      </div>
    </div>
  );
  };

  // Helper function to create a proper table in PDF
  const createTableInPDF = (doc: any, headers: string[], rows: any[][], startY: number, margin: number, usableWidth: number): number => {
    if (!headers || headers.length === 0 || !rows || rows.length === 0) {
      return startY;
    }

    let currentY = startY;
    const cellPadding = 3;
    const rowHeight = 12;
    const headerHeight = 14;
    
    // Calculate column widths dynamically
    const maxColumns = Math.min(headers.length, 8); // Limit for better readability
    const columnWidth = usableWidth / maxColumns;
    
    // Function to draw table borders and content
    const drawTableRow = (y: number, height: number, isHeader = false) => {
      const actualHeaders = headers.slice(0, maxColumns);
      
      // Draw horizontal lines
      doc.line(margin, y, margin + usableWidth, y);
      doc.line(margin, y + height, margin + usableWidth, y + height);
      
      // Draw vertical lines
      for (let i = 0; i <= actualHeaders.length; i++) {
        const x = margin + (i * columnWidth);
        doc.line(x, y, x, y + height);
      }
      
      return y + height;
    };
    
    // Draw header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    currentY = drawTableRow(currentY, headerHeight, true);
    
    headers.slice(0, maxColumns).forEach((header, i) => {
      const x = margin + (i * columnWidth) + cellPadding;
      const text = doc.splitTextToSize(String(header || ''), columnWidth - 2 * cellPadding);
      doc.text(text, x, currentY - headerHeight + 10);
    });
    
    // Draw data rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    
    const maxRows = Math.min(rows.length, 25); // Limit rows per table
    
    for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
      if (currentY + rowHeight > 270) { // Check if we need a new page
        doc.addPage();
        currentY = 20;
      }
      
      const row = rows[rowIndex];
      currentY = drawTableRow(currentY, rowHeight);
      
      headers.slice(0, maxColumns).forEach((header, colIndex) => {
        const x = margin + (colIndex * columnWidth) + cellPadding;
        const cellValue = (row as any)[header];
        let displayValue = '';
        
        if (cellValue !== null && cellValue !== undefined) {
          if (typeof cellValue === 'number') {
            displayValue = Number.isInteger(cellValue) ? cellValue.toString() : cellValue.toFixed(2);
          } else {
            displayValue = String(cellValue).substring(0, 20); // Truncate long text
          }
        }
        
        const text = doc.splitTextToSize(displayValue, columnWidth - 2 * cellPadding);
        doc.text(text, x, currentY - rowHeight + 8);
      });
    }
    
    if (rows.length > maxRows) {
      currentY += 10;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.text(`... and ${rows.length - maxRows} more rows (${headers.length > maxColumns ? `${headers.length - maxColumns} more columns` : 'full data available in original file'})`, margin, currentY);
      currentY += 10;
    }
    
    if (headers.length > maxColumns) {
      currentY += 5;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.text(`Note: Only showing first ${maxColumns} of ${headers.length} columns. Full data: ${headers.slice(maxColumns).join(', ')}`, margin, currentY);
      currentY += 10;
    }
    
    return currentY + 10;
  };

  const exportExcelToPDF = () => {
    const doc = new jsPDF('landscape'); // Use landscape for better table display
    let yPosition = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const usableWidth = pageWidth - 2 * margin;

    // Title Page
    const isOcrData = data.metadata?.ocrEngine;
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(isOcrData ? 'OCR Table Analysis Report' : 'Excel Data Export', margin, yPosition);
    yPosition += 15;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`File: ${fileName}`, margin, yPosition);
    yPosition += 8;
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin, yPosition);
    yPosition += 8;
    doc.text(`Total Sheets: ${data.totalSheets}`, margin, yPosition);
    yPosition += 15;
    
    if (isOcrData) {
      doc.text(`OCR Engine: ${data.metadata.ocrEngine} | Confidence: ${data.metadata.confidence}%`, margin, yPosition);
      yPosition += 8;
      doc.text(`Detected Structure: ${data.metadata.detectedStructure}`, margin, yPosition);
      yPosition += 15;
    }

    // Export each sheet as a proper table
    Object.entries(data.sheets).forEach(([sheetName, sheetData]: [string, any], index) => {
      // Check if we need a new page for the sheet
      if (yPosition > 150) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(`Sheet: ${sheetName}`, margin, yPosition);
      yPosition += 10;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`${sheetData.rowCount || sheetData.data?.length || 0} rows × ${sheetData.columnCount || sheetData.headers?.length || 0} columns`, margin, yPosition);
      yPosition += 15;

      if (sheetData.data && sheetData.data.length > 0 && sheetData.headers) {
        // Create the actual data table
        yPosition = createTableInPDF(doc, sheetData.headers, sheetData.data, yPosition, margin, usableWidth);
      } else {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        doc.text('No data available in this sheet', margin, yPosition);
        yPosition += 20;
      }
      
      yPosition += 10; // Extra space between sheets
    });

    // Add footer to all pages
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Page ${i} of ${totalPages} • Generated by AI CRM`, margin, 200);
    }

    doc.save(`${fileName}_Excel_Table_Export.pdf`);
  };

  const exportExcelToDOCX = async () => {
  const sections: Paragraph[] = [];
  
  Object.entries(data.sheets).forEach(([sheetName, sheetData]: [string, any]) => {
    sections.push(
      new Paragraph({
        text: `Sheet: ${sheetName}`,
        heading: 'Heading1'
      }),
      new Paragraph({
        text: `Headers: ${(sheetData as any).headers.join(', ')}`
      }),
      new Paragraph({
        text: `Total Rows: ${(sheetData as any).data.length}`
      })
    );
  });

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          text: `Excel Data: ${fileName}`,
          heading: 'Title'
        }),
        ...sections
      ]
    }]
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${fileName}_Excel_Data.docx`);
  };

  const exportPdfToPDF = () => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFontSize(16);
  doc.text(`PDF Content: ${fileName}`, 20, 20);
  
  doc.setFontSize(9);
  const splitText = doc.splitTextToSize(data.extractedText, pageWidth - 40);
  doc.text(splitText, 20, 40);

  doc.save(`${fileName}_PDF_Content.pdf`);
  };

  const exportPdfToDOCX = async () => {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          text: `PDF Content: ${fileName}`,
          heading: 'Title'
        }),
        new Paragraph({
          text: data.extractedText
        })
      ]
    }]
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${fileName}_PDF_Content.docx`);
  };

  // Render different data types
  if (fileType === 'excel') {
    return renderExcelData();
  }

  if (fileType === 'pdf') {
    return renderPdfData();
  }

  // Check if this is invoice data from the new extraction endpoint
  if (data && (data.type === 'invoice' || data.tables)) {
    return renderInvoiceData(data, fileName);
  }

  // Check if this is the new structured invoice data format (per specification)
  if (data && Array.isArray(data.data) && data.metadata?.standardHeaders) {
    // New format: { data: [...], metadata: {...} }
    // Offer both Material-UI DataGrid and standard table options
    return (
      <div>
        <div style={{ 
          background: '#f8f9fa', 
          padding: '16px', 
          marginBottom: '20px',
          borderRadius: '8px',
          border: '1px solid #dee2e6' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ margin: 0, color: '#495057' }}>🧾 Invoice Processing Complete</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.9em', color: '#6c757d' }}>
                📊 {data.data.length} items • {data.metadata.ocrEngine} • {data.metadata.confidence?.toFixed(1)}% confidence
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={() => setActiveTab('material-ui')}
                style={{
                  background: activeTab === 'material-ui' ? '#007bff' : '#e9ecef',
                  color: activeTab === 'material-ui' ? 'white' : '#495057',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.85em',
                  fontWeight: '500'
                }}
              >
                📊 Material-UI DataGrid
              </button>
              
              <button 
                onClick={() => setActiveTab('standard')}
                style={{
                  background: activeTab === 'standard' ? '#007bff' : '#e9ecef',
                  color: activeTab === 'standard' ? 'white' : '#495057',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.85em',
                  fontWeight: '500'
                }}
              >
                📋 Standard Table
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'material-ui' ? (
          renderMaterialInvoiceData(data.data, fileName, data.metadata)
        ) : (
          renderStandardInvoiceData(data, fileName)
        )}
      </div>
    );
  }

  // Check if this is direct array format (simplified new format)
  if (Array.isArray(data) && data.length > 0) {
    // Check if it contains invoice-like fields
    const firstItem = data[0];
    const hasInvoiceFields = firstItem && (
      firstItem.Product || firstItem.Batch || firstItem.HSN || 
      firstItem.Amount || firstItem.Rate || firstItem.Qty
    );
    
    if (hasInvoiceFields) {
      return (
        <div>
          <div style={{ 
            background: '#f8f9fa', 
            padding: '16px', 
            marginBottom: '20px',
            borderRadius: '8px',
            border: '1px solid #dee2e6' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ margin: 0, color: '#495057' }}>🧾 Invoice Data Extracted</h4>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.9em', color: '#6c757d' }}>
                  📊 {data.length} items extracted from {fileName}
                </p>
              </div>
              
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => setActiveTab('material-ui')}
                  style={{
                    background: activeTab === 'material-ui' ? '#007bff' : '#e9ecef',
                    color: activeTab === 'material-ui' ? 'white' : '#495057',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.85em',
                    fontWeight: '500'
                  }}
                >
                  📊 Material-UI DataGrid
                </button>
                
                <button 
                  onClick={() => setActiveTab('standard')}
                  style={{
                    background: activeTab === 'standard' ? '#007bff' : '#e9ecef',
                    color: activeTab === 'standard' ? 'white' : '#495057',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.85em',
                    fontWeight: '500'
                  }}
                >
                  📋 Standard Table
                </button>
              </div>
            </div>
          </div>

          {renderMaterialInvoiceData(data, fileName, null)}
        </div>
      );
    }
  }

  return renderOcrData();
};

// Helper functions to replace the deleted components
const renderInvoiceData = (data: any, fileName: string) => {
  return (
    <div className="data-table-container">
      <div className="data-table-header">
        <h3>🧾 Invoice Data: {fileName}</h3>
      </div>
      <div className="tab-content">
        <div className="empty-state">
          <p>Invoice data processing is being updated. Please use the standard table view.</p>
        </div>
      </div>
    </div>
  );
};

const renderMaterialInvoiceData = (data: any, fileName: string, metadata: any) => {
  return (
    <div className="data-table-container">
      <div className="data-table-header">
        <h3>📊 Material-UI DataGrid: {fileName}</h3>
      </div>
      <div className="tab-content">
        <div className="empty-state">
          <p>Material-UI DataGrid view is being updated. Please use the standard table view.</p>
        </div>
      </div>
    </div>
  );
};

const renderStandardInvoiceData = (data: any, fileName: string) => {
  return (
    <div className="data-table-container">
      <div className="data-table-header">
        <h3>📋 Standard Table: {fileName}</h3>
      </div>
      <div className="tab-content">
        <div className="empty-state">
          <p>Standard table view is being updated. Please check back later.</p>
        </div>
      </div>
    </div>
  );
};

export default DataTable;
