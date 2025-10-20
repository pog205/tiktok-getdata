// index.js
const express = require('express');
const cors = require('cors');

// Simple logging for data scraping
const log = {
  scrape: (msg, data = '') => console.log(`[SCRAPE] ${new Date().toLocaleTimeString()} - ${msg}`, data),
  error: (msg, data = '') => console.error(`[ERROR] ${new Date().toLocaleTimeString()} - ${msg}`, data),
  success: (msg, data = '') => console.log(`[SUCCESS] ${new Date().toLocaleTimeString()} - ${msg}`, data)
};

// Force use puppeteer for Windows compatibility
let puppeteer, chromium;
try {
  puppeteer = require('puppeteer');
  chromium = null;
  console.log('✅ Using puppeteer (Windows compatible)');
} catch (err) {
  console.log('⚠️ puppeteer not available, trying puppeteer-core');
  try {
    puppeteer = require('puppeteer-core');
    chromium = require('@sparticuz/chromium');
    console.log('✅ Using puppeteer-core with chromium');
  } catch (err2) {
    console.error('❌ Neither puppeteer nor puppeteer-core available');
    throw err2;
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Global browser instance (reuse to save startup time)
let globalBrowser = null;

// Semaphore to limit concurrent pages (max N pages simultaneously)
class Semaphore {
  constructor(maxConcurrent = 5) {
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

// Global semaphore instance
const pageSemaphore = new Semaphore(parseInt(process.env.MAX_CONCURRENT_PAGES) || 5);

class TikTokUserScraper {
  constructor() {
    this.browser = null;
  }

  // Helper method to wait for any of multiple selectors
  async waitForAnySelector(page, selectors, timeout = 15000) {
    const promises = selectors.map(selector => 
      page.waitForSelector(selector, { timeout: timeout / selectors.length }).catch(() => null)
    );
    
    const results = await Promise.allSettled(promises);
    const success = results.some(result => result.status === 'fulfilled' && result.value !== null);
    
    return success;
  }

  // Helper method to check if elements exist
  async checkElementsExist(page, selectors) {
    return await page.evaluate((selectors) => {
      return selectors.some(selector => document.querySelector(selector) !== null);
    }, selectors);
  }

  async ensureBrowser() {
    if (globalBrowser) {
      this.browser = globalBrowser;
      return;
    }

    let launchOptions;

    if (chromium) {
      // Production mode: use sparticuz chromium (works well on Render)
      launchOptions = {
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
    } else {
      // Development mode: use regular puppeteer
      launchOptions = {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ],
        ignoreHTTPSErrors: true,
      };
    }

    console.log('🚀 Launching browser...');
    this.browser = await puppeteer.launch(launchOptions);
    globalBrowser = this.browser;
    console.log('✅ Browser launched and saved to globalBrowser');
  }

  // scrapeUserProfile: scrape specific user profile by username
  async scrapeUserProfile(username) {
    if (!username) throw new Error('Username parameter is required');

    log.scrape(`Starting user profile scrape for: ${username}`);
    
    // Acquire semaphore before creating page
    await pageSemaphore.acquire();

    await this.ensureBrowser();
    const page = await this.browser.newPage();
    
    try {
      // Set viewport & UA
      await page.setViewport({ width: 1200, height: 800 });
      await page.setUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.78 Mobile Safari/537.36'
      );

      const url = `https://www.tiktok.com/@${username}`;
      log.scrape(`Navigating to: ${url}`);

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for profile content — use multiple selectors
      const profileSelectors = [
        '[data-e2e="user-title"]',                           // User title
        '.user-title',                                       // Generic user title
        'h1', 'h2',                                         // Headers
        'img[src*="tiktokcdn.com"]',                        // TikTok images
        '[data-e2e="user-avatar"] img',                     // User avatar
        '.css-1iaxnh7-5e6d46e3--PTitle.e11zs9t55'         // TikTok username class
      ];

      const hasContent = await this.waitForAnySelector(page, profileSelectors, 20000);
      
      if (hasContent) {
        log.success('Profile loaded successfully');
      } else {
        log.error('Profile may be private or not found');
      }

      // Double-check if we have profile content before extracting data
      const hasProfileContent = await this.checkElementsExist(page, [
        '[data-e2e="user-title"]', '.user-title', 'h1', 'h2',
        'img[src*="tiktokcdn.com"]', '[data-e2e="user-avatar"] img'
      ]);

      if (!hasProfileContent) {
        log.error('No profile content found - profile may be private or not exist');
        return null;
      }

      log.scrape(`Found profile content, proceeding with extraction...`);

      // Extract user profile information
      log.scrape('Extracting user profile data...');
      const userInfo = await page.evaluate(() => {
        const result = {
          username: '',
          displayName: '',
          bio: '',
          avatar: '',
          followers: '',
          following: '',
          likes: '',
          verified: false,
          videos: []
        };

        // Get username from URL or title
        const url = window.location.href;
        const usernameMatch = url.match(/\/@([^\/\?]+)/);
        if (usernameMatch) {
          result.username = usernameMatch[1];
        }

        // Get display name - using specific TikTok CSS classes
        const nameSelectors = [
          '.css-1iaxnh7-5e6d46e3--PTitle.e11zs9t55', // TikTok username class
          '[data-e2e="user-title"]',
          '.user-title',
          'h1',
          'h2',
          '[class*="username"]',
          '[class*="displayName"]'
        ];
        
        for (const selector of nameSelectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent.trim()) {
            result.displayName = el.textContent.trim();
            break;
          }
        }

        // Get bio/description - using specific TikTok CSS classes
        const bioSelectors = [
          '[data-e2e="search-user-nickname"]', // TikTok user nickname class
          '.css-1cjzxd7-5e6d46e3--PUserSubTitle.e11zs9t57', // TikTok user subtitle class
          '[data-e2e="user-bio"]',
          '.user-bio',
          '[class*="bio"]',
          '[class*="description"]',
          'p'
        ];
        
        for (const selector of bioSelectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent.trim() && el.textContent.trim() !== result.displayName) {
            result.bio = el.textContent.trim();
            break;
          }
        }

        // Get avatar - using specific TikTok CSS classes
        const avatarSelectors = [
          '.css-g3le1f-5e6d46e3--ImgAvatar.e1iqrkv71 img', // TikTok avatar class
          '[data-e2e="user-avatar"] img',
          '.user-avatar img',
          'img'
        ];
        
        for (const selector of avatarSelectors) {
          const avatarEl = document.querySelector(selector);
          if (avatarEl) {
            result.avatar = avatarEl.src || avatarEl.getAttribute('src') || '';
            if (result.avatar) break;
          }
        }

        // Get follower count
        const followerSelectors = [
          '[data-e2e="followers-count"]',
          '.followers-count',
          '[class*="follower"]',
          'strong'
        ];
        
        for (const selector of followerSelectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent.includes('Followers')) {
            result.followers = el.textContent.trim();
            break;
          }
        }

        // Get following count
        const followingSelectors = [
          '[data-e2e="following-count"]',
          '.following-count',
          '[class*="following"]'
        ];
        
        for (const selector of followingSelectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent.includes('Following')) {
            result.following = el.textContent.trim();
            break;
          }
        }

        // Get likes count
        const likesSelectors = [
          '[data-e2e="likes-count"]',
          '.likes-count',
          '[class*="likes"]'
        ];
        
        for (const selector of likesSelectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent.includes('Likes')) {
            result.likes = el.textContent.trim();
            break;
          }
        }

        // Check if verified
        const verifiedEl = document.querySelector('[data-e2e="verified-icon"], .verified-icon, [class*="verified"]');
        result.verified = !!verifiedEl;

        // Get recent videos (basic info)
        const videoElements = document.querySelectorAll('[data-e2e="video-item"], .video-item, video');
        result.videos = Array.from(videoElements).slice(0, 5).map((video, index) => ({
          index: index + 1,
          src: video.src || video.querySelector('source')?.src || '',
          thumbnail: video.poster || video.querySelector('img')?.src || ''
        }));

        return result;
      });
      
      log.success(`Profile data extracted: ${userInfo.username} - ${userInfo.displayName}`);
      return userInfo;
    } catch (err) {
      log.error('scrapeUserProfile error:', err.message);
      return null;
    } finally {
      try {
        await page.close();
      } catch (e) {
        // ignore
      } finally {
        // Always release semaphore
        pageSemaphore.release();
      }
    }
  }

  // scrapeUsers: create a fresh page per request, close page after done
  async scrapeUsers(query, maxResults = 10) {
    if (!query) throw new Error('Query parameter is required');

    log.scrape(`Starting user search for: "${query}", maxResults: ${maxResults}`);
    
    // Acquire semaphore before creating page
    await pageSemaphore.acquire();

    await this.ensureBrowser();
    const page = await this.browser.newPage();
    
    try {
      // Set viewport & UA
      await page.setViewport({ width: 1200, height: 800 });
      await page.setUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.78 Mobile Safari/537.36'
      );

      const url = `https://www.tiktok.com/search/user?q=${encodeURIComponent(query)}`;
      log.scrape(`Navigating to: ${url}`);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Wait for probable content — use multiple selectors
      const searchSelectors = [
        'a[href*="/@"]',                                    // User profile links
        '.css-1iaxnh7-5e6d46e3--PTitle.e11zs9t55',        // TikTok username class
        '[data-e2e="user-title"]',                          // User title
        '.user-title',                                      // Generic user title
        'img[src*="tiktokcdn.com"]'                        // TikTok images
      ];

      const hasContent = await this.waitForAnySelector(page, searchSelectors, 15000);
      
      if (hasContent) {
        log.success('Search results loaded successfully');
      } else {
        log.error('Content may load slowly or use different selectors - continuing anyway');
      }

      // Double-check if we have any user links before extracting data
      const hasUserLinks = await this.checkElementsExist(page, ['a[href*="/@"]']);

      if (!hasUserLinks) {
        log.error('No user links found on page - may need different selectors');
        return [];
      }

      log.scrape(`Found user links on page, proceeding with extraction...`);

      // Evaluate page to extract users with improved logic
      log.scrape('Extracting search results data...');
      const users = await page.evaluate((max) => {
        const results = [];
        
        // Extract usernames from links (most reliable method)
        const links = Array.from(document.querySelectorAll('a[href*="/@"]'));
        
        links.forEach(link => {
          const href = link.getAttribute('href');
          const usernameMatch = href.match(/\/@([^\/\?]+)/);
          if (usernameMatch) {
            const username = usernameMatch[1];
            
            // Find image in the link or nearby
            let img = '';
            const imgEl = link.querySelector('img');
            if (imgEl) {
              img = imgEl.src || imgEl.getAttribute('src') || '';
            }
            
            // Find name/display name - look in parent container for nickname
            let name = username;
            
            // Look for nickname in the link itself first
            const nicknameEl = link.querySelector('[data-e2e="search-user-nickname"]');
            if (nicknameEl) {
              const text = nicknameEl.textContent.trim();
              if (text && text !== username) {
                name = text;
              }
            } else {
              // Look in the parent container
              const parent = link.closest('div, section, article');
              if (parent) {
                const parentNicknameEl = parent.querySelector('[data-e2e="search-user-nickname"]');
                if (parentNicknameEl) {
                  const text = parentNicknameEl.textContent.trim();
                  if (text && text !== username) {
                    name = text;
                  }
                } else {
                  // Fallback to other selectors in parent
                  const nameSelectors = [
                    '.css-1cjzxd7-5e6d46e3--PUserSubTitle.e11zs9t57',
                    'p', 'span', 'div'
                  ];
                  
                  for (const selector of nameSelectors) {
                    const nameEl = parent.querySelector(selector);
                    if (nameEl) {
                      const text = nameEl.textContent.trim();
                      if (text && text !== username && !text.includes('Break reminders') && text.length < 50) {
                        name = text;
                        break;
                      }
                    }
                  }
                }
              }
            }
            
            results.push({
              username: username,
              img: img,
              name: name
            });
          }
        });
        
        // Remove duplicates based on username
        const uniqueResults = [];
        const seenUsernames = new Set();
        
        for (const user of results) {
          if (user.username && !seenUsernames.has(user.username)) {
            seenUsernames.add(user.username);
            uniqueResults.push(user);
            if (uniqueResults.length >= max) break;
          }
        }
        
        return uniqueResults;
      }, maxResults);

      log.success(`Found ${users.length} users: ${users.map(u => u.username).join(', ')}`);
      return users.slice(0, maxResults);
    } catch (err) {
      log.error('scrapeUsers error:', err.message);
      return [];
    } finally {
      try {
        await page.close();
      } catch (e) {
        // ignore
      } finally {
        // Always release semaphore
        pageSemaphore.release();
      }
    }
  }

  static async closeGlobalBrowser() {
    if (globalBrowser) {
      try {
        await globalBrowser.close();
      } catch (e) {
        console.warn('Error closing globalBrowser:', e.message);
      } finally {
        globalBrowser = null;
      }
    }
  }
}

// Wrapper functions
async function scrapeUsersWrapper(query, maxResults) {
  const startTime = Date.now();
  const scraper = new TikTokUserScraper();
  try {
    const users = await scraper.scrapeUsers(query, maxResults);
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    log.success(`Scrape completed in ${duration}s - Found ${users.length} users`);
    
    return {
      success: true,
      message: `Found ${users.length} users in ${duration}s`,
      duration: `${duration}s`,
      data: users
    };
  } catch (err) {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    log.error(`Scrape failed after ${duration}s: ${err.message}`);
    
    return { 
      success: false, 
      message: `Error: ${err.message}`,
      duration: `${duration}s`,
      data: [] 
    };
  }
}

async function scrapeUserProfileWrapper(username) {
  const startTime = Date.now();
  const scraper = new TikTokUserScraper();
  try {
    const userInfo = await scraper.scrapeUserProfile(username);
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    if (userInfo) {
      log.success(`Profile scrape completed in ${duration}s - ${userInfo.username}`);
      
      return {
        success: true,
        message: `Found user profile in ${duration}s`,
        duration: `${duration}s`,
        user: userInfo
      };
    } else {
      log.error(`Profile not found after ${duration}s`);
      
      return {
        success: false,
        message: `User not found or profile is private (${duration}s)`,
        duration: `${duration}s`,
        user: null
      };
    }
  } catch (err) {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    log.error(`Profile scrape failed after ${duration}s: ${err.message}`);
    
    return { 
      success: false, 
      message: `Error: ${err.message} (${duration}s)`,
      duration: `${duration}s`,
      user: null 
    };
  }
}

// Routes
app.get('/api/scrape', async (req, res) => {
  const { query, maxResults = 5 } = req.query;
  if (!query) return res.status(400).json({ success: false, error: 'Query parameter is required' });
  const result = await scrapeUsersWrapper(query, parseInt(maxResults) || 5);
  res.json(result);
});

app.post('/api/scrape', async (req, res) => {
  const { query, maxResults = 5 } = req.body;
  if (!query) return res.status(400).json({ success: false, error: 'Query parameter is required' });
  const result = await scrapeUsersWrapper(query, parseInt(maxResults) || 5);
  res.json(result);
});

// User Profile Routes
app.get('/api/user/:username', async (req, res) => {
  const { username } = req.params;
  if (!username) return res.status(400).json({ success: false, error: 'Username parameter is required' });
  const result = await scrapeUserProfileWrapper(username);
  res.json(result);
});

app.post('/api/user', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ success: false, error: 'Username parameter is required' });
  const result = await scrapeUserProfileWrapper(username);
  res.json(result);
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    browserStatus: globalBrowser ? 'Active' : 'Not Initialized',
    semaphoreStats: pageSemaphore.getStats()
  });
});

process.on('SIGINT', async () => {
  console.log('🔄 Graceful shutdown');
  await TikTokUserScraper.closeGlobalBrowser();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  console.log('🔄 Graceful shutdown');
  await TikTokUserScraper.closeGlobalBrowser();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🚀 Server listening on ${PORT}`);
});
