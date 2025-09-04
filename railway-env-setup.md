# Railway Environment Setup Guide

## 🚨 **URGENT: Fix Your Current Connection Issue**

Your app is trying to connect to an IPv6 address `fd12:8523:85ef:0:9000:12:20ac:5c06:3306`, which means the Railway environment variables are not set correctly.

## 🚀 **Required Environment Variables for Railway**

Set these environment variables in your Railway service dashboard:

### **Option 1: Use DATABASE_URL (Recommended)**
```
DATABASE_URL=mysql://root:UnBcEjiANcIQtIxcvPeKIaePOZjiwrzE@railway-private-domain:3306/railway
```

### **Option 2: Use MYSQL_URL**
```
MYSQL_URL=mysql://root:UnBcEjiANcIQtIxcvPeKIaePOZjiwrzE@railway-private-domain:3306/railway
```

### **Option 3: Use Individual MySQL Variables**
```
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
3. **DELETE any existing database-related variables** that might be wrong
4. Add the correct variables above
5. Click "Add" to save each variable
6. Railway will automatically redeploy your service

## 🚨 **Troubleshooting Your Current Issue**

### **Step 1: Check Current Variables**
Run this in Railway to see what's currently set:
```bash
node check-env.js
```

### **Step 2: Clear Wrong Variables**
Remove any variables that contain IPv6 addresses or wrong values

### **Step 3: Set Correct Variables**
Use the DATABASE_URL format above

### **Step 4: Verify MySQL Service**
- Ensure MySQL service is running in Railway
- Check if it's on the same project
- Verify the service name matches your variables

## 📊 **Database Connection Priority**

The application will try to connect in this order:
1. `DATABASE_URL` (highest priority) ⭐ **USE THIS**
2. `MYSQL_URL`
3. Railway MySQL variables (`MYSQLHOST`, `MYSQLUSER`, etc.)
4. `MYSQL_PUBLIC_URL`
5. Railway TCP Proxy
6. Local development variables (fallback)

## ✅ **Verification Steps**

After setting the environment variables:
1. Railway will automatically redeploy
2. Check the logs to see which database connection method is used
3. Look for: `📡 Using DATABASE_URL for connection`
4. The health check should pass immediately
5. Database connection should succeed

## 🚨 **Common Issues & Solutions**

- **IPv6 Address Error**: Clear all database variables and set only DATABASE_URL
- **Connection Refused**: Check if MySQL service is running in Railway
- **Authentication Failed**: Verify username/password in environment variables
- **Database Not Found**: Ensure the database name matches `railway`
- **Port Issues**: Railway automatically handles port forwarding

## 🔍 **Health Check Endpoints**

- `/healthz` - Railway health check (always returns 200)
- `/health` - Detailed health status
- `/ping` - Simple ping endpoint
- `/` - Root endpoint with service info

## 🆘 **If Still Not Working**

1. **Check Railway MySQL Service**: Ensure it's running and accessible
2. **Verify Service Names**: Make sure variable names match Railway's MySQL service
3. **Use Railway's Generated Variables**: Copy from MySQL service Variables tab
4. **Contact Railway Support**: If MySQL service is not working
