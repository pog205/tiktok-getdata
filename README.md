# 🚀 TikTok Scraper API - Render Optimized

## 🎯 **Tổng quan**

TikTok Scraper API được tối ưu hóa cho deployment trên **Render** sử dụng **Puppeteer + Chromium**. API này dựa trên code `tiktok-user-scraper.js` hiện có và được cải tiến để hoạt động tốt trên cloud.

### **✅ Ưu điểm:**

- **🚀 Render Optimized**: Tối ưu cho Render deployment
- **☁️ Cloud Ready**: Hoạt động tốt trên các platform cloud
- **🔧 No HTML Files**: Không tạo file HTML debug, chỉ trả về JSON
- **♻️ Browser Pool**: Tái sử dụng browser instance để tối ưu performance
- **🛡️ Production Ready**: Sẵn sàng cho production

## 📦 **Cài đặt**

### **1. Dependencies:**

```bash
npm install puppeteer-core @sparticuz/chromium express cors
```

### **2. Dev Dependencies:**

```bash
npm install -D nodemon
```

## 🚀 **Sử dụng**

### **1. Local Development:**

```bash
# Chạy API
npm start
# hoặc
node tiktok-api-server.js

# Development mode
npm run dev

# Test API
npm test
# hoặc
node test-tiktok-api.js
```

### **2. Test API:**

```bash
# Health check
curl "http://localhost:3002/health"

# Scrape users
curl "http://localhost:3002/api/scrape?query=phongne20050&maxResults=1"
```

## 📋 **API Endpoints**

### **1. Scrape Users (GET)**

```bash
curl "http://localhost:3002/api/scrape?query=phongne20050&maxResults=5"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "query": "phongne20050",
    "maxResults": 5,
    "users": [
      {
        "username": "phongne20050",
        "img": "https://p16-sign-sg.tiktokcdn.com/...",
        "name": "Phong Ne"
      }
    ],
    "count": 1,
    "timestamp": "2024-01-15T10:30:00.000Z",
    "method": "Puppeteer + Chromium (Render Optimized)"
  }
}
```

### **2. Scrape Users (POST)**

```bash
curl -X POST "http://localhost:3002/api/scrape" \
  -H "Content-Type: application/json" \
  -d '{"query": "phongne20050", "maxResults": 3}'
```

### **3. Health Check**

```bash
curl "http://localhost:3002/health"
```

**Response:**

```json
{
  "status": "OK",
  "message": "TikTok Scraper API (Puppeteer + Chromium)",
  "mode": "Puppeteer + Chromium - Render Optimized",
  "browserStatus": "Active",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## 🔧 **Cấu hình**

### **1. Environment Variables**

```bash
# Production
NODE_ENV=production
PORT=3000
RENDER=true

# Puppeteer + Chromium
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

### **2. Browser Pool Configuration**

```javascript
// Global browser pool để tái sử dụng
let globalBrowser = null;
let globalPage = null;

// Tái sử dụng browser instance
if (this.useGlobalPool && globalBrowser) {
  this.browser = globalBrowser;
  this.page = globalPage;
}
```

## 🌐 **Deployment**

### **1. Render Deployment**

#### **render.yaml:**

```yaml
services:
  - type: web
    name: tiktok-scraper-api
    env: node
    plan: starter
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: RENDER
        value: true
      - key: PUPPETEER_SKIP_CHROMIUM_DOWNLOAD
        value: true
      - key: PUPPETEER_EXECUTABLE_PATH
        value: /usr/bin/chromium-browser
      - key: PORT
        value: 3000
```

#### **Dockerfile:**

```dockerfile
FROM node:18-alpine

# Install Chromium and dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

# Security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001
RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000
CMD ["npm", "start"]
```

### **2. Deploy Steps:**

```bash
# 1. Push code to GitHub
git add .
git commit -m "Add TikTok Scraper API"
git push

# 2. Connect to Render
# - Go to render.com
# - Connect GitHub repository
# - Render will auto-detect render.yaml
# - Deploy automatically
```

## 📊 **Performance**

### **Expected Results:**

- **Response Time**: 3-8 seconds
- **Success Rate**: 70-90%
- **Memory Usage**: ~200-400MB per request
- **Browser Pool**: Reuses browser instance
- **No HTML Files**: Only JSON responses

### **Optimization Features:**

1. **Browser Pool**: Reuse browser instance across requests
2. **Smart Waiting**: Wait for elements with timeout
3. **Fallback Selectors**: Multiple CSS selector strategies
4. **Error Handling**: Graceful error handling
5. **Production Args**: Optimized Puppeteer launch options

## 🔍 **Code Structure**

### **Main Files:**

- `tiktok-api-server.js` - Main API server
- `tiktok-user-scraper.js` - Core scraper class
- `test-tiktok-api.js` - Test script
- `package.json` - Dependencies
- `render.yaml` - Render deployment config
- `Dockerfile` - Docker config

### **Key Features:**

```javascript
// Browser Pool
let globalBrowser = null;
let globalPage = null;

// Smart Waiting
await this.page.waitForSelector(".css-1iaxnh7-5e6d46e3--PTitle.e11zs9t55", {
  timeout: 3000,
});

// Fallback Selectors
const finalUsernames =
  usernameElements.length > 0 ? usernameElements : usernameElementsAlt;

// Production Config
const isProduction =
  process.env.NODE_ENV === "production" || process.env.RENDER;
```

## ⚠️ **Lưu ý quan trọng**

### **1. Resource Management:**

- **Memory**: Monitor memory usage
- **Browser Pool**: Reuses browser instance
- **Timeout**: Set appropriate timeouts

### **2. Rate Limiting:**

- **Built-in delays**: Smart waiting for elements
- **Request spacing**: 3 seconds between test requests
- **Production**: Adjust based on usage

### **3. Legal & Ethical:**

- **Terms of Service**: Tuân thủ TikTok Terms of Service
- **Rate Limiting**: Không spam hoặc abuse
- **Data Usage**: Sử dụng cho mục đích hợp pháp

## 🎉 **Kết luận**

**TikTok Scraper API** được tối ưu hóa cho Render deployment với:

- ✅ **Render Optimized**: Tối ưu cho Render deployment
- ✅ **No HTML Files**: Chỉ trả về JSON responses
- ✅ **Browser Pool**: Tái sử dụng browser instance
- ✅ **Production Ready**: Sẵn sàng cho production
- ✅ **Cloud Compatible**: Hoạt động tốt trên cloud

**Với API này, bạn có thể deploy TikTok scraper lên Render một cách hiệu quả!** 🎯✨
