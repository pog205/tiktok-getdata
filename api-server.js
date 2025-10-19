const express = require('express');
const cors = require('cors');
const TikTokScraperOptimized = require('./scraper-optimized');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'TikTok Scraper API is running',
    timestamp: new Date().toISOString()
  });
});

// Main scraping endpoint
app.post('/scrape', async (req, res) => {
  try {
    const { query, maxResults = 1 } = req.body;
    
    // Validation
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required'
      });
    }

    if (maxResults < 1 || maxResults > 10) {
      return res.status(400).json({
        success: false,
        error: 'maxResults must be between 1 and 10'
      });
    }

    console.log(`🚀 API Request: Scraping "${query}" (max: ${maxResults})`);
    
    const scraper = new TikTokScraperOptimized();
    const startTime = Date.now();
    
    console.log(`📊 Before scrape - Query: ${query}, MaxResults: ${maxResults}`);
    const users = await scraper.quickScrape(query, maxResults);
    console.log(`📊 After scrape - Users found: ${users.length}`);
    console.log(`📊 Users data:`, JSON.stringify(users, null, 2));
    
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

  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET endpoint for simple queries
app.get('/scrape/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const { maxResults = 1 } = req.query;
    
    const maxResultsNum = parseInt(maxResults);
    if (isNaN(maxResultsNum) || maxResultsNum < 1 || maxResultsNum > 10) {
      return res.status(400).json({
        success: false,
        error: 'maxResults must be a number between 1 and 10'
      });
    }

    console.log(`🚀 API GET Request: Scraping "${query}" (max: ${maxResultsNum})`);
    
    const scraper = new TikTokScraperOptimized();
    const startTime = Date.now();
    
    const users = await scraper.quickScrape(query, maxResultsNum);
    const totalTime = Date.now() - startTime;
    
    res.json({
      success: true,
      data: {
        query,
        maxResults: maxResultsNum,
        users,
        count: users.length,
        processingTime: totalTime,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Batch scraping endpoint
app.post('/scrape/batch', async (req, res) => {
  try {
    const { queries, maxResults = 1 } = req.body;
    
    // Validation
    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'queries must be a non-empty array'
      });
    }

    if (queries.length > 5) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 5 queries allowed per batch request'
      });
    }

    if (maxResults < 1 || maxResults > 5) {
      return res.status(400).json({
        success: false,
        error: 'maxResults must be between 1 and 5 for batch requests'
      });
    }

    console.log(`🚀 API Batch Request: ${queries.length} queries`);
    
    const scraper = new TikTokScraperOptimized();
    const startTime = Date.now();
    const results = [];
    
    for (const query of queries) {
      try {
        const users = await scraper.quickScrape(query, maxResults);
        results.push({
          query,
          success: true,
          users,
          count: users.length
        });
      } catch (error) {
        results.push({
          query,
          success: false,
          error: error.message,
          users: [],
          count: 0
        });
      }
    }
    
    const totalTime = Date.now() - startTime;
    
    res.json({
      success: true,
      data: {
        queries,
        maxResults,
        results,
        totalQueries: queries.length,
        successfulQueries: results.filter(r => r.success).length,
        processingTime: totalTime,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ API Batch Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API documentation endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'TikTok Scraper API',
    version: '1.0.0',
    description: 'API để scrape thông tin users từ TikTok',
    endpoints: {
      'GET /health': 'Health check',
      'POST /scrape': 'Scrape users by query (body: {query, maxResults?})',
      'GET /scrape/:query': 'Scrape users by query (query param: maxResults?)',
      'POST /scrape/batch': 'Batch scrape multiple queries (body: {queries[], maxResults?})',
      'GET /': 'API documentation'
    },
    examples: {
      'POST /scrape': {
        body: { query: '@phongne20050', maxResults: 3 }
      },
      'GET /scrape/@phongne20050?maxResults=2': 'Simple GET request',
      'POST /scrape/batch': {
        body: { 
          queries: ['@phongne20050', '@user2'], 
          maxResults: 2 
        }
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Unhandled Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 TikTok Scraper API đang chạy tại: http://localhost:${PORT}`);
  console.log(`📖 API Documentation: http://localhost:${PORT}`);
  console.log(`💚 Health Check: http://localhost:${PORT}/health`);
});

module.exports = app;
