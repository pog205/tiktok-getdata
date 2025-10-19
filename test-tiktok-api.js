const axios = require('axios');

async function testTikTokAPI() {
  console.log('🚀 Testing TikTok Scraper API (Puppeteer + Chromium)\n');
  
  const baseURL = 'http://localhost:3002';
  const testQueries = ['phongne20050', 'trangthichuoi', 'testuser123'];
  
  // Test health check
  console.log('📊 === Health Check ===');
  try {
    const healthResponse = await axios.get(`${baseURL}/health`);
    console.log('✅ Health check passed:', healthResponse.data);
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return;
  }
  
  // Test scraping
  for (const query of testQueries) {
    console.log(`\n📊 === Testing Query: ${query} ===`);
    
    try {
      const startTime = Date.now();
      const response = await axios.get(`${baseURL}/api/scrape?query=${query}&maxResults=1`);
      const totalTime = Date.now() - startTime;
      
      const data = response.data;
      
      console.log(`✅ Success: ${data.success}`);
      console.log(`🎯 Query: ${data.data.query}`);
      console.log(`👥 Users found: ${data.data.count}`);
      console.log(`🔧 Method: ${data.data.method}`);
      
      if (data.data.users && data.data.users.length > 0) {
        console.log(`\n👤 === User Data ===`);
        data.data.users.forEach((user, index) => {
          console.log(`User ${index + 1}:`);
          console.log(`  Username: ${user.username}`);
          console.log(`  Name: ${user.name}`);
          console.log(`  Avatar: ${user.img.substring(0, 80)}...`);
        });
      } else {
        console.log(`\n⚠️ No user data found.`);
      }
      
      console.log(`\n⏱️ Total API call time: ${totalTime}ms`);
      
    } catch (error) {
      console.error(`❌ Error testing ${query}:`, error.message);
      if (error.response && error.response.data) {
        console.log('Response data:', error.response.data);
      }
    }
    
    // Wait between requests
    console.log('⏳ Waiting 3 seconds before next request...');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.log('\n🎉 === Test Complete ===');
}

// Run the test
testTikTokAPI().catch(console.error);
