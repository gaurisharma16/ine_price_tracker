const { chromium } = require('playwright');
const { scrapeProduct } = require('./scraper');
const fs = require('fs');

async function testTransientRetry() {
    console.log('=== TEST: Retry Logic on Transient Failure ===');
    console.log('This is a controlled local test of the retry path.');
    
    // We will monkey-patch playwright chromium.launch to intercept routes
    // and fail the first attempt, then succeed on the second attempt.
    const originalLaunch = chromium.launch;
    
    let launchCount = 0;
    chromium.launch = async function(options) {
        launchCount++;
        const browser = await originalLaunch.call(chromium, options);
        
        // Only on the first launch, we will inject a delay or network failure
        if (launchCount === 1) {
            console.log('[TEST] First launch detected: MOCKING TRANSIENT NETWORK FAILURE');
            const originalNewContext = browser.newContext;
            browser.newContext = async function(ctxOpts) {
                const context = await originalNewContext.call(browser, ctxOpts);
                await context.route('**/*', route => {
                    // Abort all requests to simulate network down
                    route.abort('failed');
                });
                return context;
            };
        } else {
            console.log(`[TEST] Launch ${launchCount} detected: ALLOWING NORMAL NETWORK TRAFFIC`);
        }
        
        return browser;
    };

    try {
        const result = await scrapeProduct('https://demo.inelabteamdev.com/product/709', { headless: true, maxAttempts: 3, timeout: 5000 });
        console.log('\nResult:', JSON.stringify(result, null, 2));
    } finally {
        // Restore
        chromium.launch = originalLaunch;
    }
}

testTransientRetry().catch(console.error);
