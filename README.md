# 🗂️ AI CRM File Processing System

A comprehensive file upload and processing system built with **React** (Frontend) and **NestJS** (Backend). The system automatically extracts content from uploaded files using OCR for images, text extraction for PDFs, and data parsing for Excel files.

## ✨ Features

### 📤 Frontend (React + TypeScript)
- **Drag & Drop File Upload**: Intuitive file upload interface
- **Multiple File Type Support**: Images, PDFs, and Excel files
- **Real-time Processing Status**: Loading states and progress feedback  
- **Results Display**: Beautiful visualization of extracted content
- **Responsive Design**: Modern and mobile-friendly UI

### 🔁 Backend (NestJS + TypeORM)
- **Multi-format File Processing**:
  - **Images**: OCR text extraction using Tesseract.js
  - **PDFs**: Text content extraction using pdf-parse
  - **Excel Files**: Data parsing using xlsx library
- **Database Storage**: MySQL database with TypeORM
- **RESTful API**: Clean API endpoints for file operations
- **File Validation**: Type and size validation
- **Error Handling**: Comprehensive error management

## 🛠️ Technology Stack

### Frontend
- React 18 with TypeScript
- Axios for HTTP requests
- Modern CSS with responsive design
- File drag & drop functionality

### Backend
- NestJS framework
- TypeORM for database operations
- MySQL database
- Multer for file uploads
- Tesseract.js for OCR
- pdf-parse for PDF text extraction
- xlsx for Excel file processing

## 📋 Prerequisites

Before running this project, make sure you have:

- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **MySQL** server running locally or remotely
- **Git** (for cloning the repository)

## 🚀 Installation & Setup

### 1. Clone the Repository
```bash
git clone <your-repository-url>
cd ai-crm
```

### 2. Backend Setup

#### Install Dependencies
```bash
cd backend
npm install
```

#### Database Configuration
1. Create a MySQL database named `ai_crm`:
```sql
CREATE DATABASE ai_crm;
```

2. Create a `.env` file in the `backend` directory:
```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_password_here
DB_NAME=ai_crm

# Application Configuration
NODE_ENV=development
PORT=3001
```

#### Start the Backend Server
```bash
npm run start:dev
```

The backend server will start on `http://localhost:3001`

### 3. Frontend Setup

#### Install Dependencies
```bash
cd frontend
npm install
```

#### Start the Frontend Application
```bash
npm start
```

The frontend application will start on `http://localhost:3000`

## 📁 Project Structure

```
ai-crm/
├── backend/                 # NestJS Backend
│   ├── src/
│   │   ├── controllers/     # API Controllers
│   │   ├── services/        # Business Logic
│   │   ├── entities/        # TypeORM Entities
│   │   ├── app.module.ts    # Main App Module
│   │   └── main.ts         # Entry Point
│   ├── uploads/            # Uploaded Files (auto-created)
│   └── package.json
├── frontend/               # React Frontend
│   ├── src/
│   │   ├── components/     # React Components
│   │   ├── types/          # TypeScript Interfaces
│   │   ├── App.tsx         # Main App Component
│   │   └── index.tsx       # Entry Point
│   ├── public/
│   └── package.json
└── README.md
```

## 🔌 API Endpoints

### File Upload
- **POST** `/api/files/upload`
  - Upload and process a file
  - **Body**: FormData with `file` field
  - **Response**: Processed file data with extracted content

### Get All Files
- **GET** `/api/files`
  - Retrieve all processed files
  - **Response**: Array of processed file metadata

### Get File by ID
- **GET** `/api/files/:id`
  - Retrieve specific file with full content
  - **Response**: Complete file data including parsed content

## 📊 Supported File Types

| File Type | Extensions | Processing Method |
|-----------|------------|-------------------|
| **Images** | `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp` | OCR with Tesseract.js |
| **PDFs** | `.pdf` | Text extraction with pdf-parse |
| **Excel** | `.xlsx`, `.xls` | Data parsing with xlsx |

## 💾 Database Schema

### `parsed_files` Table
- `id` - Primary key (auto-increment)
- `filename` - Generated filename
- `fileType` - File type (image/pdf/excel)
- `originalName` - Original uploaded filename
- `fileSize` - File size in bytes
- `parsedContent` - JSON string of processed content
- `extractedText` - Raw extracted text (for images/PDFs)
- `createdAt` - Upload timestamp
- `updatedAt` - Last update timestamp

## 🎨 Usage Examples

### 1. Upload an Image
1. Navigate to `http://localhost:3000`
2. Drag and drop an image file or click to select
3. Click "Upload and Process File"
4. View the extracted text in the results section

### 2. Process a PDF
1. Select a PDF file
2. Upload and wait for processing
3. View the extracted text content

### 3. Parse Excel Data
1. Upload an Excel file (.xlsx or .xls)
2. View the parsed spreadsheet data with headers and rows
3. Data is organized by sheet names

## ⚙️ Configuration

### Backend Configuration (`.env`)
```env
# Database
DB_HOST=localhost          # MySQL host
DB_PORT=3306              # MySQL port
DB_USERNAME=root          # Database username
DB_PASSWORD=password      # Database password
DB_NAME=ai_crm           # Database name

# App
NODE_ENV=development      # Environment
PORT=3001                # Backend port
```

### File Upload Limits
- **Maximum file size**: 10MB
- **Concurrent uploads**: 1 at a time
- **Storage**: Local filesystem (`/uploads` directory)

## 🔧 Development

### Backend Development
```bash
cd backend
npm run start:dev        # Start in watch mode
npm run build           # Build for production
npm run test            # Run tests
```

### Frontend Development
```bash
cd frontend
npm start               # Start development server
npm run build          # Build for production
npm test               # Run tests
```

## 🛡️ Security Features

- File type validation
- File size limits (10MB)
- CORS configuration
- Input sanitization
- Error handling without sensitive data exposure

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Verify MySQL is running
   - Check database credentials in `.env`
   - Ensure database `ai_crm` exists

2. **File Upload Fails**
   - Check file type is supported
   - Verify file size is under 10MB
   - Ensure backend server is running

3. **OCR Not Working**
   - Tesseract.js requires good image quality
   - Supported image formats: JPG, PNG, GIF, BMP, WebP

4. **Frontend Can't Connect to Backend**
   - Verify backend is running on port 3001
   - Check CORS configuration
   - Ensure proxy setting in `frontend/package.json`

### Error Logs
- Backend logs: Check console output from `npm run start:dev`
- Frontend logs: Open browser developer tools

## 🚀 Deployment

### Backend Deployment
1. Set `NODE_ENV=production`
2. Set `synchronize: false` in TypeORM config
3. Run database migrations
4. Use PM2 or similar for process management

### Frontend Deployment
1. Run `npm run build`
2. Serve the `build` folder with a web server
3. Update API base URL for production

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 📧 Support

For support or questions, please create an issue in the repository.

---

**Built with ❤️ using React and NestJS**

