import React, { useState } from 'react';
import axios from 'axios';
import { ProcessedFile } from '../types/ProcessedFile';
import DataTable from './DataTable';

import { API_BASE_URL } from '../config/api';

interface ResultsDisplayProps {
  files: ProcessedFile[];
  onRefresh: () => void;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ files, onRefresh }) => {
  const [selectedFile, setSelectedFile] = useState<ProcessedFile | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'originalName' | 'fileType' | 'fileSize'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterType, setFilterType] = useState<'all' | 'image' | 'pdf' | 'excel'>('all');
  const [loadingFileDetails, setLoadingFileDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [showStructuredView, setShowStructuredView] = useState<'json' | false>(false);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFileIcon = (fileType: string): string => {
    switch (fileType) {
      case 'image': return '🖼️';
      case 'pdf': return '📕';
      case 'excel': return '📊';
      default: return '📄';
    }
  };

  const getFileTypeLabel = (fileType: string): string => {
    switch (fileType) {
      case 'image': return 'Image/OCR';
      case 'pdf': return 'PDF Document';
      case 'excel': return 'Excel Spreadsheet';
      default: return 'Unknown';
    }
  };

  const sortFiles = (files: ProcessedFile[]): ProcessedFile[] => {
    return [...files].sort((a, b) => {
      let aValue: any = a[sortBy === 'date' ? 'createdAt' : sortBy];
      let bValue: any = b[sortBy === 'date' ? 'createdAt' : sortBy];

      if (sortBy === 'date') {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      } else if (sortBy === 'originalName') {
        aValue = (aValue || '').toLowerCase();
        bValue = (bValue || '').toLowerCase();
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const filterFiles = (files: ProcessedFile[]): ProcessedFile[] => {
    if (filterType === 'all') return files;
    return files.filter(file => file.fileType === filterType);
  };

  const filteredAndSortedFiles = sortFiles(filterFiles(files));

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const getSortIcon = (field: typeof sortBy): string => {
    if (sortBy !== field) return '↕️';
    return sortOrder === 'asc' ? '↗️' : '↘️';
  };

  // Format extracted text to be more readable
  const formatExtractedText = (text: string): string => {
    if (!text) return 'No text available';
    
    // Clean up the text and format it properly
    let formattedText = text
      .replace(/\\n/g, '\n') // Replace escaped newlines
      .replace(/\n\s*\n/g, '\n\n') // Remove excessive empty lines
      .trim();
    
    // Generic formatting for any document type
    formattedText = formattedText
      .replace(/(\d{1,3}(?:,\d{3})*\.\d{2})/g, ' ₹$1') // Format currency amounts
      .replace(/(\d{1,2}\/\d{1,2}\/\d{4})/g, ' 📅 $1') // Format dates
      .replace(/(\d{2,3})/g, ' #$1'); // Format numbers
    
    return formattedText;
  };

  // Enhanced text formatting with better structure - Generic version
  const formatEnhancedText = (text: string): string => {
    if (!text) return 'No text available';
    
    let enhancedText = text
      .replace(/\\n/g, '\n')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
    
    // Generic document formatting - works with any document type
    enhancedText = enhancedText
      // Company/Organization patterns
      .replace(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Private|Public|Limited|Corp|Inc|LLC))/g, '🏢 $1')
      .replace(/(\d+[A-Z]?,\s*[A-Za-z\s]+,\s*[A-Za-z\s]+\s*–?\s*\d{6})/g, '📍 $1')
      
      // Generic key-value patterns
      .replace(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)([^\n]+?)(?=\n[A-Z]|$)/g, '📝 $1: $2')
      
      // Amount patterns
      .replace(/(\d{1,3}(?:,\d{3})*\.\d{2})/g, '💰 ₹$1')
      
      // Date patterns
      .replace(/(\d{1,2}\/\d{1,2}\/\d{4})/g, '📅 $1')
      .replace(/(\d{1,2}\s+[A-Za-z]+\s+\d{4})/g, '📅 $1')
      
      // ID/Code patterns
      .replace(/([A-Z]{2,8}\d{3,6})/g, '🆔 $1')
      .replace(/(\d{10,16})/g, '💳 $1')
      
      // Section headers
      .replace(/(Total|Net|Summary|Details|Information)/g, '📊 $1')
      
      // Currency words
      .replace(/(Rs\.\s+)([^)]+)/g, '💬 $1$2');
    
    return enhancedText;
  };

  // Parse extracted text into structured JSON format - Generic version
  const parseToStructuredJson = (text: string): any => {
    if (!text) return null;
    
    try {
      const structuredData: any = {
        documentType: 'generic',
        extractedAt: new Date().toISOString(),
        sections: {}
      };
      
      // Generic field extraction using common patterns
      const lines = text.split('\n').filter(line => line.trim().length > 0);
      
      // Extract company/organization information
      const companyMatch = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Private|Public|Limited|Corp|Inc|LLC))/);
      if (companyMatch) {
        structuredData.sections.company = {
          name: companyMatch[1].trim(),
          type: 'organization'
        };
      }
      
      // Extract address information
      const addressMatch = text.match(/(\d+[A-Z]?,\s*[A-Za-z\s]+,\s*[A-Za-z\s]+\s*–?\s*\d{6})/);
      if (addressMatch) {
        structuredData.sections.address = {
          fullAddress: addressMatch[1].trim(),
          type: 'location'
        };
      }
      
      // Extract key-value pairs dynamically
      const keyValuePairs: any = {};
      lines.forEach(line => {
        // Look for patterns like "Key: Value" or "Key Value"
        const keyValueMatch = line.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[:]?\s*(.+)$/);
        if (keyValueMatch) {
          const key = keyValueMatch[1].trim();
          const value = keyValueMatch[2].trim();
          
          // Clean up the key name
          const cleanKey = key.replace(/\s+/g, '').toLowerCase();
          keyValuePairs[cleanKey] = value;
        }
      });
      
      if (Object.keys(keyValuePairs).length > 0) {
        structuredData.sections.keyValuePairs = keyValuePairs;
      }
      
      // Extract numeric amounts
      const amounts = text.match(/\d{1,3}(?:,\d{3})*\.\d{2}/g) || [];
      if (amounts.length > 0) {
        structuredData.sections.numericData = {
          amounts: amounts.map(amt => parseFloat(amt.replace(/,/g, ''))),
          currency: 'INR',
          count: amounts.length
        };
      }
      
      // Extract dates
      const dates = text.match(/\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4}/g) || [];
      if (dates.length > 0) {
        structuredData.sections.dates = {
          foundDates: dates,
          count: dates.length
        };
      }
      
      // Extract IDs/Codes
      const codes = text.match(/[A-Z]{2,8}\d{3,6}/g) || [];
      if (codes.length > 0) {
        structuredData.sections.identifiers = {
          codes: codes,
          count: codes.length
        };
      }
      
      // Extract account numbers
      const accounts = text.match(/\d{10,16}/g) || [];
      if (accounts.length > 0) {
        structuredData.sections.accounts = {
          numbers: accounts,
          count: accounts.length
        };
      }
      
      return structuredData;
    } catch (error) {
      console.error('Error parsing generic data:', error);
      return null;
    }
  };

  // Create a very simple, clean format - Generic version
  const parseToSimpleFormat = (text: string): any => {
    if (!text) return null;
    
    try {
      const simpleData: any = {
        documentType: 'generic',
        summary: {}
      };
      
      // Count basic statistics
      const lines = text.split('\n').filter(line => line.trim().length > 0);
      const words = text.split(/\s+/).filter(word => word.trim().length > 0);
      
      simpleData.summary = {
        totalLines: lines.length,
        totalWords: words.length,
        totalCharacters: text.length
      };
      
      // Extract any amounts found
      const amounts = text.match(/\d{1,3}(?:,\d{3})*\.\d{2}/g) || [];
      if (amounts.length > 0) {
        simpleData.summary.amounts = amounts.map(amt => parseFloat(amt.replace(/,/g, '')));
        simpleData.summary.totalAmount = amounts.reduce((sum, amt) => sum + parseFloat(amt.replace(/,/g, '')), 0);
      }
      
      // Extract any dates found
      const dates = text.match(/\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4}/g) || [];
      if (dates.length > 0) {
        simpleData.summary.dates = dates;
      }
      
      return simpleData;
    } catch (error) {
      console.error('Error parsing simple format:', error);
      return null;
    }
  };

  // Extract key fields from text for summary - Generic version
  const extractKeyFields = (text: string): string[] => {
    const fields = [];
    
    // Generic field detection
    if (text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Private|Public|Limited|Corp|Inc|LLC)/)) {
      fields.push('Company Information');
    }
    if (text.match(/\d{1,3}(?:,\d{3})*\.\d{2}/)) {
      fields.push('Financial Data');
    }
    if (text.match(/\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4}/)) {
      fields.push('Date Information');
    }
    if (text.match(/[A-Z]{2,8}\d{3,6}/)) {
      fields.push('ID Codes');
    }
    if (text.match(/\d{10,16}/)) {
      fields.push('Account Numbers');
    }
    if (text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*[:]?\s*[^\n]+/)) {
      fields.push('Key-Value Data');
    }
    
    return fields;
  };

  // Format JSON response with better structure for extractedText
  const formatJsonResponse = (data: any): string => {
    if (!data) return 'No data available';
    
    // Create a copy of the data to modify
    const formattedData = { ...data };
    
    // If there's extractedText, try to parse it into structured format
    if (formattedData.extractedText) {
      const structuredData = parseToStructuredJson(formattedData.extractedText);
      if (structuredData) {
        // Add the structured data as a new field
        formattedData.genericStructuredData = structuredData;
        // Also format the raw text for readability
        formattedData.extractedText = formatExtractedText(formattedData.extractedText);
      } else {
        // Fallback to just formatting the text
        formattedData.extractedText = formatExtractedText(formattedData.extractedText);
      }
    }
    
    // Add a summary section at the top for better readability
    if (formattedData.extractedText) {
      const summary = {
        textSummary: {
          totalCharacters: formattedData.extractedText.length,
          totalWords: formattedData.extractedText.split(/\s+/).length,
          totalLines: formattedData.extractedText.split('\n').length,
          documentType: 'generic',
          keyFields: extractKeyFields(formattedData.extractedText)
        }
      };
      
      // Insert summary at the beginning
      const finalData = { summary, ...formattedData };
      return JSON.stringify(finalData, null, 2);
    }
    
    return JSON.stringify(formattedData, null, 2);
  };

  // Fetch full file details including parsedContent
  const fetchFileDetails = async (fileId: number): Promise<ProcessedFile | null> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/files/${fileId}`);
      if (response.data.success) {
        return response.data.data;
      }
      return null;
    } catch (error) {
      console.error('Error fetching file details:', error);
      throw new Error('Failed to load file details');
    }
  };

  // Handle viewing file details
  const handleViewFileDetails = async (file: ProcessedFile) => {
    setLoadingFileDetails(true);
    setDetailsError(null);
    
    try {
              // If file already has parsedContent, use it directly
        if (file.parsedContent) {
          // Initialize with enhanced text view active for better UX
          setSelectedFile({
            ...file,
            showFormattedJson: false,
            showStructuredData: false,
            showSimpleFormat: false,
            showEnhancedText: true
          });
        } else {
        // Otherwise, fetch full details from server
        const fullFileData = await fetchFileDetails(file.id);
        if (fullFileData) {
          // Initialize with simple format view active for better UX
          setSelectedFile({
            ...fullFileData,
            showFormattedJson: false,
            showStructuredData: true, // Set to true by default
            showSimpleFormat: false,
            showEnhancedText: false
          });
        } else {
          setDetailsError('Failed to load file details');
        }
      }
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : 'Failed to load file details');
    } finally {
      setLoadingFileDetails(false);
    }
  };

  // Handle loading state
  if (loadingFileDetails) {
    return (
      <div className="results-display">
        <div className="data-table-container">
          <div className="tab-content">
            <div className="loading">
              <div className="spinner"></div>
              <p>Loading file details...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Handle error state
  if (detailsError) {
    return (
      <div className="results-display">
        <div className="data-table-container">
          <div className="tab-content">
            <div className="empty-state">
              <div className="empty-icon">❌</div>
              <h3>Error Loading File Details</h3>
              <p>{detailsError}</p>
              <button 
                className="back-btn"
                onClick={() => {
                  setDetailsError(null);
                  setSelectedFile(null);
                }}
                style={{ marginTop: '20px' }}
              >
                ← Back to Results
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (selectedFile) {
    return (
      <div className="results-display">
        <div className="file-detail-header">
          <button 
            className="back-btn"
            onClick={() => {
              setSelectedFile(null);
              setDetailsError(null);
              setShowStructuredView(false);
            }}
          >
            ← Back to Results
          </button>
          <h2>File Details: {selectedFile.originalName}</h2>
        </div>
        
        {/* View Toggle Buttons */}
        <div className="view-toggle-controls">
          <button
            className={`toggle-btn ${!showStructuredView ? 'active' : ''}`}
            onClick={() => setShowStructuredView(false)}
          >
            📋 Raw Data View
          </button>

          <button
            className={`toggle-btn ${showStructuredView === 'json' ? 'active' : ''}`}
            onClick={() => setShowStructuredView('json')}
          >
            🔍 JSON Response View
          </button>

        </div>

                 {showStructuredView === 'json' ? (
           <div className="data-table-container">
             <div className="tab-content">
               <div className="json-view-header">
                 <h3>🔍 JSON Response Data</h3>
                 <p>Raw API response for file: {selectedFile.originalName}</p>
               </div>
               <div className="json-content">
                                   <div className="json-tabs">
                    <button 
                      className={`json-tab-btn ${!selectedFile.showFormattedJson && !selectedFile.showStructuredData && !selectedFile.showSimpleFormat && !selectedFile.showEnhancedText ? 'active' : ''}`}
                      onClick={() => setSelectedFile({...selectedFile, showFormattedJson: false, showStructuredData: false, showSimpleFormat: false, showEnhancedText: false})}
                    >
                      📄 Raw JSON
                    </button>
                    <button 
                      className={`json-tab-btn ${selectedFile.showFormattedJson ? 'active' : ''}`}
                      onClick={() => setSelectedFile({...selectedFile, showFormattedJson: true, showStructuredData: false, showSimpleFormat: false, showEnhancedText: false})}
                    >
                      🧹 Formatted JSON
                    </button>
                    <button 
                      className={`json-tab-btn ${selectedFile.showStructuredData ? 'active' : ''}`}
                      onClick={() => setSelectedFile({...selectedFile, showFormattedJson: false, showStructuredData: true, showSimpleFormat: false, showEnhancedText: false})}
                    >
                      🔍 Intelligent Document Parser
                    </button>
                    <button 
                      className={`json-tab-btn ${selectedFile.showSimpleFormat ? 'active' : ''}`}
                      onClick={() => setSelectedFile({...selectedFile, showFormattedJson: false, showStructuredData: false, showSimpleFormat: true, showEnhancedText: false})}
                    >
                      ✨ Simple Format
                    </button>
                    <button 
                      className={`json-tab-btn ${selectedFile.showEnhancedText ? 'active' : ''}`}
                      onClick={() => setSelectedFile({...selectedFile, showFormattedJson: false, showStructuredData: false, showSimpleFormat: false, showEnhancedText: true})}
                    >
                      🎨 Enhanced Text View
                    </button>
                  </div>
                 
                                   {selectedFile.showFormattedJson ? (
                    <div className="formatted-json-content">
                      <h4>📋 Formatted Extracted Text</h4>
                      <p className="enhanced-text-description">
                        Clean, readable version of the extracted text with basic formatting and structure
                      </p>
                      {selectedFile.extractedText && (
                        <div className="formatted-text-section">
                          <div className="text-preview">
                            <pre className="formatted-text-display">
                              {formatExtractedText(selectedFile.extractedText)}
                            </pre>
                          </div>
                        </div>
                      )}
                      
                      <h4>🔍 Complete JSON Response</h4>
                      <p className="enhanced-text-description">
                        Complete API response with enhanced structure and summary information
                      </p>
                      <pre className="json-display">
                        {formatJsonResponse(selectedFile.jsonResponse || selectedFile)}
                      </pre>
                    </div>
                  ) : selectedFile.showStructuredData ? (
                    <div className="formatted-json-content">
                      <h4>🔍 Intelligent Document Parser</h4>
                      <p className="enhanced-text-description">
                        Advanced AI-powered parsing that automatically detects document structure and extracts data from any field, column, or format - works with invoices, receipts, forms, reports, and more
                      </p>
                      {selectedFile.structuredDocumentData ? (
                        <div className="formatted-text-section">
                          <div className="text-preview">
                            <pre className="json-display">
                              {JSON.stringify(selectedFile.structuredDocumentData, null, 2)}
                            </pre>
                          </div>
                        </div>
                      ) : selectedFile.extractedText ? (
                        <div className="formatted-text-section">
                          <div className="text-preview">
                            <p className="enhanced-text-description">
                              ⚠️ No structured data available from backend. Showing client-side parsed data instead.
                            </p>
                            <pre className="json-display">
                              {JSON.stringify(parseToStructuredJson(selectedFile.extractedText), null, 2)}
                            </pre>
                          </div>
                        </div>
                      ) : (
                        <div className="formatted-text-section">
                                                      <p className="enhanced-text-description">
                              ❌ No structured document data available to display
                            </p>
                        </div>
                      )}
                    </div>
                  ) : selectedFile.showSimpleFormat ? (
                    <div className="formatted-json-content">
                      <h4>✨ Simple Format</h4>
                      <p className="enhanced-text-description">
                        Minimal, clean format showing only the most essential information
                      </p>
                      {selectedFile.extractedText && (
                        <div className="formatted-text-section">
                          <div className="text-preview">
                            <pre className="json-display">
                              {JSON.stringify(parseToSimpleFormat(selectedFile.extractedText), null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : selectedFile.showEnhancedText ? (
                    <div className="formatted-json-content">
                      <h4>🎨 Enhanced Text View</h4>
                      <p className="enhanced-text-description">
                        Beautifully formatted extracted text with emojis, icons, and better structure for easy reading. 
                        This view makes the raw extracted text much more readable and organized.
                      </p>
                      {selectedFile.extractedText && (
                        <div className="formatted-text-section">
                          <div className="text-preview">
                            <pre className="enhanced-text-display">
                              {formatEnhancedText(selectedFile.extractedText)}
                            </pre>
                          </div>
                          <div className="text-actions">
                            <button 
                              onClick={() => navigator.clipboard.writeText(formatEnhancedText(selectedFile.extractedText || ''))}
                              className="copy-btn"
                            >
                              📋 Copy Enhanced Text
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="formatted-json-content">
                      <h4>📄 Raw JSON Response</h4>
                      <p className="enhanced-text-description">
                        Unformatted raw API response data as received from the server
                      </p>
                      <pre className="json-display">
                        {JSON.stringify(selectedFile.jsonResponse || selectedFile, null, 2)}
                      </pre>
                    </div>
                  )}
               </div>
             </div>
           </div>
         ) : selectedFile.parsedContent ? (
          <DataTable 
            data={selectedFile.parsedContent}
            fileName={selectedFile.originalName}
            fileType={selectedFile.fileType}
          />
        ) : (
          <div className="data-table-container">
            <div className="tab-content">
              <div className="empty-state">
                <div className="empty-icon">⚠️</div>
                <h3>No Processed Data Available</h3>
                <p>This file has been uploaded but processing data is not available.</p>
                <p>The file might still be processing or there was an issue during processing.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="results-display">
      <div className="results-header">
        <div className="header-content">
          <h2>📋 Processing Results</h2>
          <p>{files.length} file{files.length !== 1 ? 's' : ''} processed</p>
        </div>
        <div className="header-actions">
          <button 
            className="refresh-btn"
            onClick={onRefresh}
            title="Refresh results"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📁</div>
          <h3>No files processed yet</h3>
          <p>Upload some files using the Upload tab to see results here.</p>
        </div>
      ) : (
        <>
          {/* Filters and Controls */}
          <div className="results-controls">
            <div className="filter-section">
              <label>Filter by type:</label>
              <select 
                value={filterType} 
                onChange={(e) => setFilterType(e.target.value as any)}
                className="filter-select"
              >
                <option value="all">All Files ({files.length})</option>
                <option value="image">Images ({files.filter(f => f.fileType === 'image').length})</option>
                <option value="pdf">PDFs ({files.filter(f => f.fileType === 'pdf').length})</option>
                <option value="excel">Excel ({files.filter(f => f.fileType === 'excel').length})</option>
              </select>
            </div>
            
            <div className="sort-section">
              <span>Sort by:</span>
              <button 
                className={`sort-btn ${sortBy === 'date' ? 'active' : ''}`}
                onClick={() => handleSort('date')}
              >
                Date {getSortIcon('date')}
              </button>
              <button 
                className={`sort-btn ${sortBy === 'originalName' ? 'active' : ''}`}
                onClick={() => handleSort('originalName')}
              >
                Name {getSortIcon('originalName')}
              </button>
              <button 
                className={`sort-btn ${sortBy === 'fileType' ? 'active' : ''}`}
                onClick={() => handleSort('fileType')}
              >
                Type {getSortIcon('fileType')}
              </button>
              <button 
                className={`sort-btn ${sortBy === 'fileSize' ? 'active' : ''}`}
                onClick={() => handleSort('fileSize')}
              >
                Size {getSortIcon('fileSize')}
              </button>
            </div>
          </div>

          {/* Results Grid */}
          <div className="results-grid">
            {filteredAndSortedFiles.map((file) => (
              <div key={file.id} className="result-card">
                <div className="card-header">
                  <div className="file-icon">
                    {getFileIcon(file.fileType)}
                  </div>
                  <div className="file-info">
                    <h3 className="file-name" title={file.originalName}>
                      {file.originalName}
                    </h3>
                    <span className="file-type">{getFileTypeLabel(file.fileType)}</span>
                  </div>
                </div>
                
                <div className="card-details">
                  <div className="detail-row">
                    <span className="detail-label">Size:</span>
                    <span className="detail-value">{formatFileSize(file.fileSize)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Processed:</span>
                    <span className="detail-value">{formatDate(file.createdAt)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Status:</span>
                    <span className="detail-value status-success">
                      ✅ Processed
                    </span>
                  </div>
                  {file.extractedText && (
                    <div className="detail-row">
                      <span className="detail-label">Text:</span>
                      <span className="detail-value">
                        {file.extractedText.substring(0, 50)}
                        {file.extractedText.length > 50 ? '...' : ''}
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="card-actions">
                  <button 
                    className="view-btn"
                    onClick={() => handleViewFileDetails(file)}
                    disabled={loadingFileDetails}
                  >
                    👁️ View Details
                  </button>
                  <button 
                    className="preview-btn"
                    onClick={() => handleViewFileDetails(file)}
                    disabled={loadingFileDetails}
                  >
                    📋 View Data
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ResultsDisplay;
