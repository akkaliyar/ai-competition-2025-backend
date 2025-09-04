// API Configuration for Railway deployment

const getApiBaseUrl = (): string => {
  // Production Railway URL
  if (process.env.NODE_ENV === 'production') {
    return process.env.REACT_APP_API_URL || 'https://ai-competition-2025-production.up.railway.app/api';
  }
  
  // Development environment
  return process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
};

export const API_BASE_URL = getApiBaseUrl();

// Log the API URL for debugging
console.log('🔗 API Base URL:', API_BASE_URL);
console.log('🌍 Environment:', process.env.NODE_ENV);