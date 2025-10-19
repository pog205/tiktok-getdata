const puppeteer = require('puppeteer');

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
      // Tạo browser mới với config cho production
      const launchOptions = {
        headless: 'true', // Sử dụng headless mới
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
          '--window-size=1920,1080'
        ]
      };

      // Thêm executablePath cho production (Render)
      if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
        launchOptions.executablePath = '/usr/bin/chromium-browser';
      }

      this.browser = await puppeteer.launch(launchOptions);
      
      this.page = await this.browser.newPage();
      this.page.setDefaultNavigationTimeout(15000);
      
      // Set User-Agent để tránh bị detect
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
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
        timeout: 15000
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
      
      users.forEach((user, index) => {
        console.log(`\n${index + 1}. Username: ${user.username}`);
        console.log(`   Name: ${user.name}`);
        console.log(`   Avatar: ${user.img}`);
      });
      
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

// Test function
async function testScraper() {
  const scraper = new TikTokUserScraper();
  
  try {
    await scraper.init();
    
    // Test với query "trangthichuoi"
    const users = await scraper.scrapeUsers('trangthichuoi', 1);
    
    console.log('\n🎉 === FINAL RESULT ===');
    console.log(JSON.stringify(users, null, 2));
    
    // Tự động đóng browser sau khi scrape xong
    await scraper.close();
    console.log('✅ Test completed, browser closed automatically');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    // Đóng browser ngay cả khi có lỗi
    await scraper.close();
  }
}

if (require.main === module) {
  testScraper();
}

module.exports = TikTokUserScraper;
