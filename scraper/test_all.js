const { scrapeProduct } = require('./scraper');

async function runTests() {
    console.log('=== TEST 1: Valid Product A (ID: 709) - Headless ===');
    const res1 = await scrapeProduct('https://demo.inelabteamdev.com/product/709', { headless: true, maxAttempts: 2 });
    console.log('\nResult 1:', JSON.stringify(res1, null, 2));
    
    console.log('\n=== TEST 2: Valid Product B (ID: 303) - Headless ===');
    const res2 = await scrapeProduct('https://demo.inelabteamdev.com/product/303', { headless: true, maxAttempts: 2 });
    console.log('\nResult 2:', JSON.stringify(res2, null, 2));

    console.log('\n=== TEST 3: Invalid Product (ID: 99999) - Headless ===');
    const res3 = await scrapeProduct('https://demo.inelabteamdev.com/product/99999', { headless: true, maxAttempts: 1 });
    console.log('\nResult 3:', JSON.stringify(res3, null, 2));

    console.log('\n=== TEST 4: Repeated Scrape of Valid Product A (ID: 709) ===');
    const res4 = await scrapeProduct('https://demo.inelabteamdev.com/product/709', { headless: true, maxAttempts: 1 });
    console.log('\nResult 4:', JSON.stringify(res4, null, 2));
}

runTests().catch(console.error);
