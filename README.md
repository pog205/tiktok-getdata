# TikTok Scraper API

TikTok user search và profile scraper với Puppeteer, hỗ trợ Docker deployment.

## 🚀 Features

- ✅ Search TikTok users by keyword
- ✅ Get user profile details
- ✅ Semaphore-controlled concurrent requests
- ✅ Docker-ready for deployment
- ✅ Performance timing
- ✅ Windows & Linux compatible

## 📦 API Endpoints

### Search Users

```bash
GET /api/scrape?query=username&maxResults=5
POST /api/scrape
```

### User Profile

```bash
GET /api/user/:username
POST /api/user
```

### Health Check

```bash
GET /health
```

## 🐳 Docker Deployment

### 1. Build Docker Image

```bash
docker build -t tiktok-scraper .
```

### 2. Run Container

```bash
docker run -p 3000:3000 tiktok-scraper
```

### 3. Test API

```bash
curl "http://localhost:3000/api/scrape?query=phongne2005&maxResults=1"
```

## ☁️ Deploy to Cloud

### Render (Recommended)

1. Connect GitHub repo
2. Select "Docker" as environment
3. Deploy automatically

### Fly.io

```bash
fly launch
fly deploy
```

### DigitalOcean App Platform

1. Create new app
2. Connect GitHub repo
3. Select Dockerfile
4. Deploy

## 🔧 Environment Variables

- `PORT`: Server port (default: 3000)
- `PUPPETEER_EXECUTABLE_PATH`: Chromium path (default: auto-detect)
- `NODE_ENV`: Environment (production/development)
- `MAX_CONCURRENT_PAGES`: Max concurrent pages (default: 5)

## 📊 Response Format

```json
{
  "success": true,
  "message": "Found 1 users in 9.40s",
  "duration": "9.40s",
  "data": [
    {
      "username": "phongne2005",
      "img": "https://...",
      "name": "phongnè2005"
    }
  ]
}
```

## 🛠️ Development

```bash
npm install
npm start
```

## 📝 Notes

- Uses Puppeteer with Chromium for web scraping
- Semaphore limits concurrent requests to prevent overload
- Docker image includes all Chromium dependencies
- Optimized for production deployment
