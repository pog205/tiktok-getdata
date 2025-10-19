const express = require('express');
const cors = require('cors');
const TikTokUserScraper = require('./tiktok-user-scraper');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Single endpoint - POST /scrape
app.post('/scrape', async (req, res) => {
  try {
    const { query, maxResults = 5 } = req.body;
    
    // Validation
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required'
      });
    }

    if (maxResults < 1 || maxResults > 20) {
      return res.status(400).json({
        success: false,
        error: 'maxResults must be between 1 and 20'
      });
    }

    console.log(`🚀 Scraping "${query}" (max: ${maxResults})`);
    
    const scraper = new TikTokUserScraper();
    const startTime = Date.now();
    
    try {
      await scraper.init();
      const users = await scraper.scrapeUsers(query, maxResults);
      const totalTime = Date.now() - startTime;
      
      res.json({
        success: true,
        data: {
          query,
          maxResults,
          users,
          count: users.length,
          processingTime: totalTime,
          timestamp: new Date().toISOString()
        }
      });
      
    } finally {
      await scraper.close();
    }

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
  console.log(`📖 POST /scrape - Scrape users`);
  console.log(`💚 GET /health - Health check`);
});

module.exports = app;
