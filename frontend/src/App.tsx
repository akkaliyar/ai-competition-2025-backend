import React, { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import FileUpload from './components/FileUpload';
import ResultsDisplay from './components/ResultsDisplay';
import Dashboard from './components/Dashboard';

import { ProcessedFile } from './types/ProcessedFile';
import { API_BASE_URL } from './config/api';

function App() {
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'results' | 'dashboard'>('upload');
  
  // Refs for timeout management
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load existing files on component mount
  useEffect(() => {
    loadExistingFiles();
  }, []);

  // Clear timeouts on component unmount
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    };
  }, []);

  const loadExistingFiles = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/files`);
      if (response.data.success) {
        setProcessedFiles(response.data.data);
      }
    } catch (error) {
      console.error('Error loading existing files:', error);
    }
  };

  const handleFileUpload = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    // Clear any existing timeouts
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(`${API_BASE_URL}/files/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.success) {
        const responseData = response.data.data;
        
        // Create key-value formatted data from the response
        const keyValueData: Record<string, any> = {
          'File ID': responseData.id,
          'Filename': responseData.filename,
          'Original Name': responseData.originalName,
          'File Type': responseData.fileType,
          'File Size': `${(responseData.fileSize / 1024).toFixed(2)} KB`,
          'MIME Type': responseData.mimeType,
          'Processing Status': responseData.processingStatus,
          'Processing Duration': `${responseData.processingDurationMs}ms`,
          'Character Count': responseData.characterCount,
          'Word Count': responseData.wordCount,
          'Line Count': responseData.lineCount,
          'Has Structured Data': responseData.hasStructuredData ? 'Yes' : 'No',
          'Table Count': responseData.tableCount,
          'Average Confidence': responseData.averageConfidence ? `${(responseData.averageConfidence * 100).toFixed(1)}%` : 'N/A',
          'Upload Date': new Date(responseData.createdAt).toLocaleString(),
          'Last Updated': responseData.updatedAt ? new Date(responseData.updatedAt).toLocaleString() : 'N/A'
        };

        // Create enhanced file object with JSON response and key-value data
        const newFile = {
          ...responseData,
          jsonResponse: response.data, // Store the complete API response
          keyValueData: keyValueData, // Store the key-value formatted data
        };

        setProcessedFiles(prev => [newFile, ...prev]);
        const successMessage = `File "${file.name}" processed successfully! Bill data extraction started automatically.`;
        setSuccess(successMessage);
        
        // Auto-hide success message after 30 seconds
        successTimeoutRef.current = setTimeout(() => {
          setSuccess(null);
        }, 30000);
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Upload failed';
      const fullErrorMessage = `Error: ${errorMessage}`;
      setError(fullErrorMessage);
      
      // Auto-hide error message after 30 seconds
      errorTimeoutRef.current = setTimeout(() => {
        setError(null);
      }, 30000);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
    
    // Clear any existing timeouts
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
  };

  const handleTabChange = (tabId: 'upload' | 'results' | 'dashboard') => {
    // Clear messages when changing tabs
    clearMessages();
    setActiveTab(tabId);
  };

  const tabs = [
    { id: 'upload', label: 'Upload Files', icon: '📤' },
    { id: 'results', label: 'Results', icon: '📋' },
    { id: 'dashboard', label: 'Dashboard', icon: '📊' }
  ];

  return (
    <div className="container">
      <header className="header">
        <h1>🗂️ AI CRM File Processor</h1>
        <p>Upload images, PDFs, or Excel files for automatic content extraction and bill data processing</p>
      </header>

      {/* Tab Navigation */}
      <div className="main-tabs">
        <div className="tab-navigation-main">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`main-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => handleTabChange(tab.id as any)}
            >
              <span className="tab-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="main-tab-content">
        {activeTab === 'upload' && (
          <FileUpload 
            onFileUpload={handleFileUpload}
            loading={loading}
            error={error}
            success={success}
            onClearMessages={clearMessages}
          />
        )}

        {activeTab === 'results' && (
          <ResultsDisplay 
            files={processedFiles}
            onRefresh={loadExistingFiles}
          />
        )}

        {activeTab === 'dashboard' && (
          <Dashboard 
            files={processedFiles}
            onRefresh={loadExistingFiles}
          />
        )}


      </div>
    </div>
  );
}

export default App;
