#!/usr/bin/env node

/**
 * TikTok User Scraper - Standalone CLI Tool
 * 
 * This is a standalone version of the TikTok scraper that can be used
 * independently of the web server. It includes semaphore-controlled
 * concurrent page management.
 * 
 * Usage:
 *   node tiktok-user-scraper.js "search query" [maxResults]
 *   npm run scraper "search query" [maxResults]
 */

const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

// Semaphore to limit concurrent pages (max N pages simultaneously)
class Semaphore {
  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
    this.currentConcurrent = 0;
    this.queue = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      if (this.currentConcurrent < this.maxConcurrent) {
        this.currentConcurrent++;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release() {
    this.currentConcurrent--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      this.currentConcurrent++;
      next();
    }
  }

  getStats() {
    return {
      maxConcurrent: this.maxConcurrent,
      currentConcurrent: this.currentConcurrent,
      queueLength: this.queue.length
    };
  }
}

class TikTokUserScraper {
  constructor(options = {}) {
    this.browser = null;
    this.semaphore = new Semaphore(options.maxConcurrentPages || 3);
    this.options = {
      headless: options.headless !== false,
      timeout: options.timeout || 30000,
      userAgent: options.userAgent || 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.78 Mobile Safari/537.36',
      ...options
    };
  }

  async ensureBrowser() {
    if (this.browser) {
      return;
    }

    // Launch browser using sparticuz chromium (works well on Render)
    const launchOptions = {
      headless: chromium.headless,
      args: chromium.args.concat([
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ]),
      ignoreHTTPSErrors: true,
    };

    try {
      // executablePath may throw if not available — chromium handles it in many envs
      launchOptions.executablePath = await chromium.executablePath();
    } catch (err) {
      // Fallback: leave executablePath undefined and let puppeteer-core try default
      console.warn('⚠️ chromium.executablePath() failed, falling back to default executablePath:', err.message);
    }

    console.log('🚀 Launching chromium with options (trimmed)...');
    this.browser = await puppeteer.launch(launchOptions);
    console.log('✅ Chromium launched');
  }

  async scrapeUsers(query, maxResults = 10) {
    if (!query) throw new Error('Query parameter is required');

    // Acquire semaphore before creating page
    await this.semaphore.acquire();
    console.log(`🔒 Semaphore acquired. Stats:`, this.semaphore.getStats());

    await this.ensureBrowser();
    const page = await this.browser.newPage();
    
    try {
      // Set viewport & UA
      await page.setViewport({ width: 1200, height: 800 });
      await page.setUserAgent(this.options.userAgent);

      const url = `https://www.tiktok.com/search/user?q=${encodeURIComponent(query)}`;
      console.log(`🎯 Navigating to ${url}`);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.options.timeout });

      // Wait for probable content — use conservative wait
      try {
        await page.waitForSelector('[data-e2e="user-title"], .user-title, .tiktok-1f3v0n', { timeout: 6000 });
      } catch (e) {
        console.log('⚠️ Nội dung có thể tải chậm hoặc selector khác — sẽ cố gắng scrape anyway');
      }

      // Evaluate page to extract users — avoid console.log inside evaluate
      const users = await page.evaluate((max) => {
        const results = [];
        // Candidate selectors (primary + fallback) - using specific TikTok CSS classes
        const usernameSel = '[data-e2e="user-title"], .user-title, h3, h4';
        const imgSel = '[data-e2e="user-avatar"] img, .user-avatar img, img';
        const nameSel = '[data-e2e="search-user-nickname"], .css-1cjzxd7-5e6d46e3--PUserSubTitle.e11zs9t57, [data-e2e="user-subtitle"], .user-subtitle, .user-name, p';

        const usernames = Array.from(document.querySelectorAll(usernameSel));
        const images = Array.from(document.querySelectorAll(imgSel));
        const names = Array.from(document.querySelectorAll(nameSel));

        const limit = Math.min(max, Math.max(usernames.length, images.length, names.length));

        for (let i = 0, found = 0; found < max && i < limit; i++) {
          const uEl = usernames[i] || usernames[i] /* fallback */;
          const imgEl = images[i] || images[i];
          const nameEl = names[i] || names[i];

          const username = uEl ? uEl.textContent?.trim() : null;
          let img = null;
          if (imgEl) {
            img = imgEl.src || imgEl.getAttribute && imgEl.getAttribute('src');
          }
          const name = nameEl ? nameEl.textContent?.trim() : (username || '');

          if (username || img) {
            results.push({ username: username || '', img: img || '', name });
            found++;
          }
        }

        return results;
      }, maxResults);

      return users.slice(0, maxResults);
    } catch (err) {
      console.error('❌ scrapeUsers error:', err.message);
      return [];
    } finally {
      try {
        await page.close();
      } catch (e) {
        // ignore
      } finally {
        // Always release semaphore
        this.semaphore.release();
        console.log(`🔓 Semaphore released. Stats:`, this.semaphore.getStats());
      }
    }
  }

  async close() {
    if (this.browser) {
      try {
        await this.browser.close();
        console.log('🔒 Browser closed');
      } catch (e) {
        console.warn('Error closing browser:', e.message);
      } finally {
        this.browser = null;
      }
    }
  }

  getStats() {
    return {
      browserStatus: this.browser ? 'Active' : 'Not Initialized',
      semaphoreStats: this.semaphore.getStats()
    };
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage: node tiktok-user-scraper.js "search query" [maxResults]

Examples:
  node tiktok-user-scraper.js "dance"
  node tiktok-user-scraper.js "cooking" 20
  npm run scraper "music" 15

Environment Variables:
  MAX_CONCURRENT_PAGES - Maximum concurrent pages (default: 3)
  HEADLESS - Run in headless mode (default: true)
  TIMEOUT - Page timeout in ms (default: 30000)
    `);
    process.exit(1);
  }

  const query = args[0];
  const maxResults = parseInt(args[1]) || 10;
  const maxConcurrentPages = parseInt(process.env.MAX_CONCURRENT_PAGES) || 3;
  const headless = process.env.HEADLESS !== 'false';
  const timeout = parseInt(process.env.TIMEOUT) || 30000;

  console.log(`🔍 Searching for: "${query}"`);
  console.log(`📊 Max results: ${maxResults}`);
  console.log(`🔒 Max concurrent pages: ${maxConcurrentPages}`);
  console.log(`👻 Headless mode: ${headless}`);
  console.log(`⏱️ Timeout: ${timeout}ms`);
  console.log('');

  const scraper = new TikTokUserScraper({
    maxConcurrentPages,
    headless,
    timeout
  });

  try {
    const startTime = Date.now();
    const users = await scraper.scrapeUsers(query, maxResults);
    const endTime = Date.now();

    console.log(`\n✅ Scraping completed in ${endTime - startTime}ms`);
    console.log(`📈 Found ${users.length} users:`);
    console.log('');

    users.forEach((user, index) => {
      console.log(`${index + 1}. @${user.username}`);
      console.log(`   Name: ${user.name}`);
      console.log(`   Avatar: ${user.img}`);
      console.log('');
    });

    console.log(`📊 Final stats:`, scraper.getStats());

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await scraper.close();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Graceful shutdown');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 Graceful shutdown');
  process.exit(0);
});

// Export for use as module
module.exports = { TikTokUserScraper, Semaphore };

// Run CLI if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}
