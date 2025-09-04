import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ProcessedFile } from '../types/ProcessedFile';
import { API_BASE_URL } from '../config/api';

interface DashboardProps {
  files: ProcessedFile[];
  onRefresh: () => void;
}

interface DashboardStats {
  totalFiles: number;
  imageFiles: number;
  pdfFiles: number;
  excelFiles: number;
  totalSize: number;
  recentActivity: ProcessedFile[];
}

const Dashboard: React.FC<DashboardProps> = ({ files, onRefresh }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState<'day' | 'week' | 'month' | 'all'>('week');

  useEffect(() => {
    calculateStats();
  }, [files, selectedTimeRange]);

  const calculateStats = () => {
    // Safety check for files array
    if (!files || files.length === 0) {
      setStats({
        totalFiles: 0,
        imageFiles: 0,
        pdfFiles: 0,
        excelFiles: 0,
        totalSize: 0,
        recentActivity: []
      });
      return;
    }

    const now = new Date();
    const timeRanges = {
      day: 1,
      week: 7,
      month: 30,
      all: Number.MAX_SAFE_INTEGER
    };

    const daysToFilter = timeRanges[selectedTimeRange];
    const filteredFiles = files.filter(file => {
      const fileDate = new Date(file.createdAt);
      const daysDiff = (now.getTime() - fileDate.getTime()) / (1000 * 3600 * 24);
      return daysDiff <= daysToFilter;
    });

    const newStats: DashboardStats = {
      totalFiles: filteredFiles.length,
      imageFiles: filteredFiles.filter(f => f.fileType === 'image').length,
      pdfFiles: filteredFiles.filter(f => f.fileType === 'pdf').length,
      excelFiles: filteredFiles.filter(f => f.fileType === 'excel').length,
      totalSize: filteredFiles.reduce((sum, file) => sum + file.fileSize, 0),
      recentActivity: filteredFiles.slice(0, 5)
    };

    setStats(newStats);
  };

  const formatFileSize = (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileTypeStats = () => {
    if (!stats) return [];
    
    return [
      { type: 'Images', count: stats.imageFiles || 0, color: '#e74c3c', emoji: '🖼️' },
      { type: 'PDFs', count: stats.pdfFiles || 0, color: '#e67e22', emoji: '📕' },
      { type: 'Excel', count: stats.excelFiles || 0, color: '#27ae60', emoji: '📊' }
    ].filter(item => item.count > 0);
  };

  const getProcessingSuccessRate = (): number => {
    if (!files || files.length === 0) return 0;
    // Assume successful if file has parsed content
    const successfulFiles = files.filter(f => f.parsedContent && Object.keys(f.parsedContent).length > 0);
    return Math.round((successfulFiles.length / files.length) * 100);
  };

  if (!stats) {
    return <div className="loading">Loading dashboard...</div>;
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="dashboard-title">
          <h2>📊 Analytics Dashboard</h2>
          <p>Comprehensive overview of your file processing activities</p>
        </div>
        
        <div className="time-range-selector">
          <label>Time Range:</label>
          <select 
            value={selectedTimeRange} 
            onChange={(e) => setSelectedTimeRange(e.target.value as any)}
            className="time-select"
          >
            <option value="day">Last 24 Hours</option>
            <option value="week">Last Week</option>
            <option value="month">Last Month</option>
            <option value="all">All Time</option>
          </select>
          <button onClick={onRefresh} className="refresh-btn">
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="stats-summary">
        <div className="summary-card total">
          <div className="summary-icon">📁</div>
          <div className="summary-content">
            <h3>{stats.totalFiles.toLocaleString()}</h3>
            <p>Total Files Processed</p>
          </div>
        </div>

        <div className="summary-card size">
          <div className="summary-icon">💾</div>
          <div className="summary-content">
            <h3>{formatFileSize(stats.totalSize)}</h3>
            <p>Total Data Processed</p>
          </div>
        </div>

        <div className="summary-card success">
          <div className="summary-icon">✅</div>
          <div className="summary-content">
            <h3>{getProcessingSuccessRate()}%</h3>
            <p>Success Rate</p>
          </div>
        </div>

        <div className="summary-card activity">
          <div className="summary-icon">⚡</div>
          <div className="summary-content">
            <h3>{Math.round(stats.totalFiles / Math.max(1, selectedTimeRange === 'day' ? 1 : selectedTimeRange === 'week' ? 7 : 30))}</h3>
            <p>Avg. Files/Day</p>
          </div>
        </div>
      </div>

      {/* File Type Distribution */}
      <div className="dashboard-section">
        <h3>📈 File Type Distribution</h3>
        <div className="file-type-chart">
          {getFileTypeStats().map((item, idx) => (
            <div key={idx} className="chart-item">
              <div className="chart-bar">
                <div 
                  className="chart-fill"
                  style={{ 
                    width: `${(item.count / stats.totalFiles) * 100}%`,
                    backgroundColor: item.color
                  }}
                />
              </div>
              <div className="chart-label">
                <span className="chart-emoji">{item.emoji}</span>
                <span className="chart-text">{item.type}</span>
                <span className="chart-count">{item.count}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="dashboard-section">
        <h3>🕒 Recent Activity</h3>
        <div className="activity-list">
          {stats.recentActivity.length > 0 ? (
            stats.recentActivity.map(file => (
              <div key={file.id} className="activity-item">
                <div className="activity-icon">
                  {file.fileType === 'image' ? '🖼️' : 
                   file.fileType === 'pdf' ? '📕' : '📊'}
                </div>
                <div className="activity-content">
                  <div className="activity-main">
                    <span className="activity-name">{file.originalName}</span>
                    <span className="activity-type">{file.fileType.toUpperCase()}</span>
                  </div>
                  <div className="activity-details">
                    <span>{formatFileSize(file.fileSize)}</span>
                    <span>•</span>
                    <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                    <span>•</span>
                    <span>{new Date(file.createdAt).toLocaleTimeString()}</span>
                  </div>
                </div>
                <div className="activity-status">
                  {file.parsedContent ? (
                    <span className="status-success">✅ Processed</span>
                  ) : (
                    <span className="status-pending">⏳ Processing</span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="no-activity">
              <p>No files processed in the selected time range.</p>
            </div>
          )}
        </div>
      </div>

      {/* Processing Insights */}
      <div className="dashboard-section">
        <h3>💡 Processing Insights</h3>
        <div className="insights-grid">
          <div className="insight-card">
            <h4>🎯 Most Common File Type</h4>
            <p>
              {stats.imageFiles >= stats.pdfFiles && stats.imageFiles >= stats.excelFiles ? '🖼️ Images' :
               stats.pdfFiles >= stats.excelFiles ? '📕 PDFs' : '📊 Excel Files'}
            </p>
          </div>
          
          <div className="insight-card">
            <h4>📦 Average File Size</h4>
            <p>{formatFileSize(stats.totalSize / Math.max(stats.totalFiles, 1))}</p>
          </div>
          
          <div className="insight-card">
            <h4>🕐 Peak Processing Time</h4>
            <p>Most files uploaded in the {getCurrentPeakHour()}</p>
          </div>
        </div>
      </div>
    </div>
  );

  function getCurrentPeakHour(): string {
    // Check if files array is empty
    if (!files || files.length === 0) {
      return 'No data';
    }
    
    const hours = files.map(file => new Date(file.createdAt).getHours());
    const hourCounts: { [key: number]: number } = {};
    
    hours.forEach(hour => {
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    
    // Check if hourCounts is empty
    const hourKeys = Object.keys(hourCounts);
    if (hourKeys.length === 0) {
      return 'No data';
    }
    
    // Use reduce with initial value to prevent errors
    const peakHour = hourKeys.reduce((a, b) => 
      hourCounts[parseInt(a)] > hourCounts[parseInt(b)] ? a : b, hourKeys[0]
    );
    
    const hour = parseInt(peakHour);
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    
    return `${displayHour}:00 ${period}`;
  }
};

export default Dashboard;

