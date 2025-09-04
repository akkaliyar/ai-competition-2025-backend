# Railway Environment Setup Guide

## 🚀 **Required Environment Variables for Railway**

Set these environment variables in your Railway service dashboard:

### **Database Configuration (MySQL)**
```
DATABASE_URL=mysql://root:UnBcEjiANcIQtIxcvPeKIaePOZjiwrzE@railway-private-domain:3306/railway
```

**OR use individual MySQL variables:**
```
MYSQL_URL=mysql://root:UnBcEjiANcIQtIxcvPeKIaePOZjiwrzE@railway-private-domain:3306/railway
MYSQLHOST=railway-private-domain
MYSQLUSER=root
MYSQLPASSWORD=UnBcEjiANcIQtIxcvPeKIaePOZjiwrzE
MYSQLDATABASE=railway
MYSQLPORT=3306
```

### **Application Configuration**
```
NODE_ENV=production
PORT=8080
SERVICE_TYPE=backend
```

## 🔧 **How to Set Environment Variables in Railway**

1. Go to your Railway service dashboard
2. Click on the "Variables" tab
3. Add each variable with its corresponding value
4. Click "Add" to save each variable
5. Railway will automatically redeploy your service

## 📊 **Database Connection Priority**

The application will try to connect in this order:
1. `DATABASE_URL` (highest priority)
2. `MYSQL_URL`
3. Railway MySQL variables (`MYSQLHOST`, `MYSQLUSER`, etc.)
4. `MYSQL_PUBLIC_URL`
5. Local development variables (fallback)

## ✅ **Verification**

After setting the environment variables:
1. Railway will automatically redeploy
2. Check the logs to see which database connection method is used
3. The health check should pass immediately
4. Database connection should succeed

## 🚨 **Common Issues**

- **Connection Refused**: Check if MySQL service is running in Railway
- **Authentication Failed**: Verify username/password in environment variables
- **Database Not Found**: Ensure the database name matches `MYSQLDATABASE`
- **Port Issues**: Railway automatically handles port forwarding

## 🔍 **Health Check Endpoints**

- `/healthz` - Railway health check (always returns 200)
- `/health` - Detailed health status
- `/ping` - Simple ping endpoint
- `/` - Root endpoint with service info
