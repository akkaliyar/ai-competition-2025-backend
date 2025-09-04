# Railway Database Connection Troubleshooting Guide

## 🚨 **Current Issue: Database Connection Failing**

Your logs show:
```
ERROR [TypeOrmModule] Unable to connect to the database. Retrying (1)...
AggregateError [ECONNREFUSED]
```

## 🔍 **Step-by-Step Troubleshooting**

### **Step 1: Check Railway Environment Variables**

1. Go to [Railway Dashboard](https://railway.app)
2. Click on your **backend service**
3. Go to **"Variables" tab**
4. Look for these variables and their values

### **Step 2: Verify MySQL Service Status**

1. In Railway dashboard, look for your **MySQL service**
2. Check if it's **running** (green status)
3. Click on it and go to **"Variables" tab**
4. Note down the values of:
   - `MYSQLHOST` or `RAILWAY_PRIVATE_DOMAIN`
   - `MYSQLUSER`
   - `MYSQLDATABASE`
   - `MYSQL_ROOT_PASSWORD`

### **Step 3: Clear and Reset Variables**

**In your backend service Variables tab:**

1. **DELETE all existing database variables**
2. **Add ONLY this variable:**
   ```
   DATABASE_URL=mysql://root:YOUR_PASSWORD@YOUR_MYSQL_HOST:3306/YOUR_DATABASE
   ```

**Replace with actual values:**
- `YOUR_PASSWORD`: Value from MySQL service `MYSQL_ROOT_PASSWORD`
- `YOUR_MYSQL_HOST`: Value from MySQL service `MYSQLHOST`
- `YOUR_DATABASE`: Value from MySQL service `MYSQLDATABASE`

### **Step 4: Example Configuration**

If your MySQL service has:
- `MYSQLHOST=railway-private-domain-123`
- `MYSQL_ROOT_PASSWORD=UnBcEjiANcIQtIxcvPeKIaePOZjiwrzE`
- `MYSQLDATABASE=railway`

Then set in your backend service:
```
DATABASE_URL=mysql://root:UnBcEjiANcIQtIxcvPeKIaePOZjiwrzE@railway-private-domain-123:3306/railway
```

## 🚨 **Common Issues & Solutions**

### **Issue 1: IPv6 Address in Variables**
**Symptoms:** `fd12:8523:85ef:0:9000:17:1425:b63c:3306`
**Solution:** Clear all variables and set only `DATABASE_URL`

### **Issue 2: MySQL Service Not Running**
**Symptoms:** Service shows red/stopped status
**Solution:** Restart MySQL service in Railway

### **Issue 3: Wrong Service Reference**
**Symptoms:** Variables point to wrong service
**Solution:** Copy variables from correct MySQL service

### **Issue 4: Database Doesn't Exist**
**Symptoms:** Connection succeeds but database not found
**Solution:** Check `MYSQLDATABASE` value matches actual database name

## ✅ **Verification Steps**

After setting correct variables:

1. **Railway automatically redeploys**
2. **Check logs for:**
   ```
   📡 Using DATABASE_URL for connection
   📡 DATABASE_URL value: mysql://root:****@host:3306/database
   ```
3. **Look for successful connection**
4. **Health checks should pass**
5. **API endpoints should work fully**

## 🔧 **Alternative Solutions**

### **Option 1: Use Individual Variables**
Instead of `DATABASE_URL`, set:
```
MYSQLHOST=your-mysql-host
MYSQLUSER=root
MYSQLPASSWORD=your-password
MYSQLDATABASE=your-database
MYSQLPORT=3306
```

### **Option 2: Use MYSQL_URL**
```
MYSQL_URL=mysql://root:password@host:3306/database
```

## 🆘 **If Still Not Working**

1. **Check MySQL service logs** for errors
2. **Verify MySQL service is accessible** from other services
3. **Test connection manually** using Railway CLI
4. **Contact Railway support** if MySQL service is broken

## 📱 **Quick Fix Checklist**

- [ ] MySQL service is running (green status)
- [ ] Backend service Variables tab is open
- [ ] All old database variables are deleted
- [ ] New `DATABASE_URL` is set correctly
- [ ] Railway has redeployed automatically
- [ ] Logs show successful connection

## 🎯 **Expected Result**

After fixing:
- ✅ **Database connection succeeds**
- ✅ **No more ECONNREFUSED errors**
- ✅ **All API endpoints work fully**
- ✅ **File uploads work**
- ✅ **Health checks pass**

**The issue is in Railway configuration, not your code. Fix the environment variables and everything will work.**
