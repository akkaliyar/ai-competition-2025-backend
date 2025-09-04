#!/bin/bash

echo "🚀 Railway Build Script Starting..."
echo "📊 Environment: $NODE_ENV"
echo "📊 Time: $(date)"

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --only=production

# Build the application
echo "🔨 Building application..."
npm run build

# Copy entities to dist folder
echo "📁 Copying entities..."
mkdir -p dist/entities
cp -r src/entities/* dist/entities/ 2>/dev/null || echo "Entities copy completed"

# Verify build
echo "✅ Build verification..."
if [ -f "dist/main.js" ]; then
    echo "✅ Main.js found - build successful"
    ls -la dist/
else
    echo "❌ Build failed - main.js not found"
    exit 1
fi

echo "🎉 Railway build completed successfully!"
