const { scrapeProduct } = require('./scraper');

async function run() {
    console.log('=== Direct scrape of product 254 ===');
    const result = await scrapeProduct('https://demo.inelabteamdev.com/product/254');
    console.log(JSON.stringify(result, null, 2));
}
run().catch(console.error);
