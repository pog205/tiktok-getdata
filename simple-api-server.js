const express = require('express');
const cors = require('cors');
const TikTokUserScraper = require('./tiktok-user-scraper');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Scrape function (shared logic)
async function scrapeUsers(query, maxResults) {
  // Validation
  if (!query) {
    throw new Error('Query parameter is required');
  }

  if (maxResults < 1 || maxResults > 20) {
    throw new Error('maxResults must be between 1 and 20');
  }

  console.log(`🚀 Scraping "${query}" (max: ${maxResults})`);
  
  const scraper = new TikTokUserScraper();
  const startTime = Date.now();
  
  try {
    await scraper.init();
    const users = await scraper.scrapeUsers(query, maxResults);
    const totalTime = Date.now() - startTime;
    
    return {
      success: true,
      data: {
        query,
        maxResults,
        users,
        count: users.length,
        processingTime: totalTime,
        timestamp: new Date().toISOString()
      }
    };
    
  } finally {
    await scraper.close();
  }
}

// GET endpoint - /scrape?query=username&maxResults=5
app.get('/api/scrape', async (req, res) => {
  try {
    const { query, maxResults = 5 } = req.query;
    const maxResultsNum = parseInt(maxResults) || 5;
    
    const result = await scrapeUsers(query, maxResultsNum);
    res.json(result);
    
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST endpoint - /scrape (body JSON)
app.post('/api/scrape', async (req, res) => {
  try {
    const { query, maxResults = 5 } = req.body;
    
    const result = await scrapeUsers(query, maxResults);
    res.json(result);
    
  } catch (error) {
    console.error('❌ Error:', error);
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
    message: 'TikTok Scraper API',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 TikTok Scraper API: http://localhost:${PORT}`);
  console.log(`📖 GET /api/scrape?query=username&maxResults=5 - Scrape users (GET)`);
  console.log(`📖 POST /api/scrape - Scrape users (POST)`);
  console.log(`💚 GET /health - Health check`);
});

module.exports = app;
