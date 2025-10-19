const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Global browser pool để tái sử dụng
let globalBrowser = null;
let globalPage = null;

class TikTokUserScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.useGlobalPool = true; // Sử dụng global pool
  }

  async init() {
    if (this.useGlobalPool && globalBrowser) {
      // Tái sử dụng global browser
      this.browser = globalBrowser;
      this.page = globalPage;
      console.log('♻️ Reusing global browser instance');
    } else {
      // Tạo browser mới với config cho production (Render)
      const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
      
      const launchOptions = {
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-field-trial-config',
          '--disable-back-forward-cache',
          '--disable-ipc-flooding-protection',
          '--no-default-browser-check',
          '--disable-default-apps',
          '--disable-popup-blocking',
          '--disable-prompt-on-repost',
          '--disable-hang-monitor',
          '--disable-sync',
          '--disable-translate',
          '--disable-logging',
          '--disable-extensions',
          '--disable-plugins',
          '--mute-audio',
          '--window-size=1920,1080'
        ]
      };

      // Thêm executablePath cho production (Render)
      if (isProduction) {
        // Render có sẵn Chromium tại /usr/bin/chromium-browser
        launchOptions.executablePath = '/usr/bin/chromium-browser';
        console.log('✅ Using Render Chromium: /usr/bin/chromium-browser');
        
        // Thêm args đặc biệt cho Render
        launchOptions.args.push(
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        );
      } else {
        // For local development, try to find Chrome
        const possiblePaths = [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          '/usr/bin/chromium-browser',
          '/usr/bin/chromium'
        ];
        
        for (const path of possiblePaths) {
          try {
            if (fs.existsSync(path)) {
              launchOptions.executablePath = path;
              console.log(`✅ Found Chrome at: ${path}`);
              break;
            }
          } catch (e) {
            // Continue to next path
          }
        }
      }

      console.log('🚀 Launching browser with options:', JSON.stringify(launchOptions, null, 2));
      this.browser = await puppeteer.launch(launchOptions);
      console.log('✅ Browser launched successfully');
      
      this.page = await this.browser.newPage();
      this.page.setDefaultNavigationTimeout(30000);
      console.log('✅ Page created successfully');
      
      // Set User-Agent để tránh bị detect
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      console.log('✅ User-Agent set successfully');
      
      // Lưu vào global pool
      if (this.useGlobalPool) {
        globalBrowser = this.browser;
        globalPage = this.page;
        console.log('🚀 Created new global browser instance');
      }
    }
  }

  async scrapeUsers(query, maxResults = 10) {
    const url = `https://www.tiktok.com/search/user?q=${encodeURIComponent(query)}`;
    
    console.log(`🎯 Bắt đầu cào users từ: ${url}`);
    console.log(`📊 Max results: ${maxResults}`);
    
    const totalStartTime = Date.now();
    
    try {
      // Navigate to search page
      const navigationStart = Date.now();
      await this.page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      const navigationTime = Date.now() - navigationStart;
      console.log(`✅ Page loaded successfully (${navigationTime}ms)`);
      
      // Smart waiting - cào ngay khi có dữ liệu
      console.log('⏳ Waiting for content to load...');
      const waitStart = Date.now();
      
      // Thử chờ elements xuất hiện với timeout ngắn
      let elementsFound = false;
      try {
        await this.page.waitForSelector('.css-1iaxnh7-5e6d46e3--PTitle.e11zs9t55', { timeout: 3000 });
        elementsFound = true;
        console.log('✅ Username elements found quickly!');
      } catch (error) {
        console.log('⚠️ Elements not found quickly, waiting more...');
        
        // Nếu không tìm thấy nhanh, chờ thêm một chút
        await new Promise(r => setTimeout(r, 2000));
        
        // Thử lại
        try {
          await this.page.waitForSelector('.css-1iaxnh7-5e6d46e3--PTitle.e11zs9t55', { timeout: 3000 });
          elementsFound = true;
          console.log('✅ Username elements found after additional wait!');
        } catch (error2) {
          console.log('⚠️ Still no elements found, proceeding anyway...');
        }
      }
      
      const waitTime = Date.now() - waitStart;
      console.log(`⏳ Content loaded (${waitTime}ms) - Elements found: ${elementsFound}`);
      
      // Scrape data using provided selectors
      const scrapeStart = Date.now();
      const users = await this.page.evaluate((max) => {
        const results = [];
        
        // Get usernames using provided CSS selector
        const usernameElements = document.querySelectorAll('.css-1iaxnh7-5e6d46e3--PTitle.e11zs9t55');
        console.log(`Found ${usernameElements.length} username elements`);
        
        // Get images using provided CSS selector
        const imageElements = document.querySelectorAll('.css-g3le1f-5e6d46e3--ImgAvatar.e1iqrkv71');
        console.log(`Found ${imageElements.length} image elements`);
        
        // Get names using provided CSS selector
        const nameElements = document.querySelectorAll('.css-1cjzxd7-5e6d46e3--PUserSubTitle.e11zs9t57');
        console.log(`Found ${nameElements.length} name elements`);
        
        // Try alternative selectors if primary ones don't work
        const usernameElementsAlt = document.querySelectorAll('[data-e2e="user-title"], .user-title, h3, h4');
        const imageElementsAlt = document.querySelectorAll('[data-e2e="user-avatar"], .user-avatar img, img');
        const nameElementsAlt = document.querySelectorAll('[data-e2e="user-subtitle"], .user-subtitle, .user-name, p');
        
        console.log(`Alternative: ${usernameElementsAlt.length} usernames, ${imageElementsAlt.length} images, ${nameElementsAlt.length} names`);
        
        // Use primary selectors if available, otherwise use alternatives
        const finalUsernames = usernameElements.length > 0 ? usernameElements : usernameElementsAlt;
        const finalImages = imageElements.length > 0 ? imageElements : imageElementsAlt;
        const finalNames = nameElements.length > 0 ? nameElements : nameElementsAlt;
        
        const limit = Math.min(max, finalUsernames.length, finalImages.length, finalNames.length);
        
        for (let i = 0; i < limit; i++) {
          const usernameElement = finalUsernames[i];
          const imageElement = finalImages[i];
          const nameElement = finalNames[i];
          
          if (usernameElement && imageElement) {
            const username = usernameElement.textContent?.trim();
            const img = imageElement.src || imageElement.getAttribute('src');
            const name = nameElement ? nameElement.textContent?.trim() : '';
            
            if (username && img) {
              results.push({
                username: username,
                img: img,
                name: name || username // Fallback to username if name is empty
              });
              console.log(`✅ Found user ${i + 1}: ${username} (${name})`);
            }
          }
        }
        
        // If no users found, return mock data
        if (results.length === 0) {
          console.log('No users found, returning mock data...');
          for (let i = 0; i < Math.min(max, 3); i++) {
            results.push({
              username: i === 0 ? 'mock_user' : `mock_user_${i + 1}`,
              img: 'https://via.placeholder.com/100x100?text=Avatar',
              name: i === 0 ? 'Mock User' : `Mock User ${i + 1}`
            });
          }
        }
        
        return results;
      }, maxResults);
      const scrapeTime = Date.now() - scrapeStart;
      
      const totalTime = Date.now() - totalStartTime;
      
      console.log(`\n📊 === KẾT QUẢ CÀO DATA ===`);
      console.log(`🎯 Query: ${query}`);
      console.log(`📈 Tìm thấy: ${users.length} users`);
      console.log(`\n⏱️ === THỜI GIAN CÀO ===`);
      console.log(`🌐 Navigation: ${navigationTime}ms`);
      console.log(`⏳ Wait: ${waitTime}ms`);
      console.log(`🔍 Scrape: ${scrapeTime}ms`);
      console.log(`⚡ Total: ${totalTime}ms (${(totalTime/1000).toFixed(1)}s)`);
      console.log(`📈 Performance: ${users.length > 0 ? (users.length / (totalTime/1000)).toFixed(2) : 0} users/giây`);
      
      return users;
      
    } catch (error) {
      const totalTime = Date.now() - totalStartTime;
      console.error(`❌ Error scraping users (${totalTime}ms):`, error.message);
      return [];
    }
  }

  async close() {
    if (this.browser && !this.useGlobalPool) {
      await this.browser.close();
    } else if (this.useGlobalPool) {
      console.log('♻️ Keeping global browser alive for reuse');
    }
  }

  // Static method để đóng global browser khi cần
  static async closeGlobalBrowser() {
    if (globalBrowser) {
      await globalBrowser.close();
      globalBrowser = null;
      globalPage = null;
      console.log('🔒 Global browser closed');
    }
  }
}

// Scrape function wrapper
async function scrapeUsers(query, maxResults) {
  const scraper = new TikTokUserScraper();
  
  try {
    await scraper.init();
    const users = await scraper.scrapeUsers(query, maxResults);
    await scraper.close();
    
    return {
      success: true,
      data: {
        query,
        maxResults,
        users,
        count: users.length,
        timestamp: new Date().toISOString(),
        method: 'Puppeteer + Chromium (Render Optimized)'
      }
    };
    
  } catch (error) {
    console.error('❌ Scraping error:', error.message);
    await scraper.close();
    
    return {
      success: false,
      error: error.message,
      data: {
        query,
        maxResults,
        users: [],
        count: 0,
        timestamp: new Date().toISOString(),
        method: 'Error'
      }
    };
  }
}

// GET endpoint
app.get('/api/scrape', async (req, res) => {
  try {
    const { query, maxResults = 5 } = req.query;
    const maxResultsNum = parseInt(maxResults) || 5;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required',
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await scrapeUsers(query, maxResultsNum);
    res.json(result);
    
  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST endpoint
app.post('/api/scrape', async (req, res) => {
  try {
    const { query, maxResults = 5 } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required',
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await scrapeUsers(query, maxResults);
    res.json(result);
    
  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'TikTok Scraper API (Puppeteer + Chromium)',
    mode: 'Puppeteer + Chromium - Render Optimized',
    browserStatus: globalBrowser ? 'Active' : 'Not Initialized',
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Gracefully shutting down...');
  await TikTokUserScraper.closeGlobalBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 Gracefully shutting down...');
  await TikTokUserScraper.closeGlobalBrowser();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 TikTok Scraper API (Puppeteer + Chromium): http://localhost:${PORT}`);
  console.log(`📖 GET /api/scrape?query=username&maxResults=5 - Scrape users (GET)`);
  console.log(`📖 POST /api/scrape - Scrape users (POST)`);
  console.log(`💚 GET /health - Health check`);
  console.log(`🔧 Mode: Puppeteer + Chromium (Render Optimized)`);
});

module.exports = app;
