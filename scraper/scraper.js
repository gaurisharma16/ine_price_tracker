const { chromium } = require('playwright');

// Configuration
const CONFIG = {
    MAX_ATTEMPTS: 3,
    TIMEOUT_MS: 15000,
    RETRY_DELAY_MS: 1000,
};

function log(msg) {
    console.log(`[SCRAPER] ${msg}`);
}

let globalBrowser = null;
let globalBrowserHeadless = null;

async function getBrowser(headless) {
    if (globalBrowser) {
        if (!globalBrowser.isConnected() || globalBrowserHeadless !== headless) {
            log('Browser disconnected or headless mode changed. Closing old instance...');
            await globalBrowser.close().catch(() => {});
            globalBrowser = null;
        }
    }
    
    if (!globalBrowser) {
        log('Launching global browser instance...');
        globalBrowser = await chromium.launch({ headless });
        globalBrowserHeadless = headless;
    }
    return globalBrowser;
}

const cleanupBrowser = async () => {
    if (globalBrowser) {
        await globalBrowser.close().catch(() => {});
        globalBrowser = null;
    }
};

process.on('SIGINT', async () => { await cleanupBrowser(); process.exit(0); });
process.on('SIGTERM', async () => { await cleanupBrowser(); process.exit(0); });
process.on('exit', cleanupBrowser);

/**
 * Validates the scraped data.
 */
function validateData(data) {
    if (!data.name || data.name.trim() === '') return false;
    if (data.price === null || data.price === undefined || isNaN(data.price)) return false;
    // Basic sanity check for price
    if (data.price < 0 || data.price > 1000000) return false;
    if (!data.stock || data.stock.trim() === '') return false;
    if (!data.url) return false;
    return true;
}

/**
 * Scrapes a single product using Playwright.
 */
async function scrapeProduct(productUrl, options = {}) {
    const maxAttempts = options.maxAttempts || CONFIG.MAX_ATTEMPTS;
    const timeout = options.timeout || CONFIG.TIMEOUT_MS;
    const headless = options.headless !== false;
    
    let attempt = 1;
    let error = null;
    const attemptHistory = [];

    while (attempt <= maxAttempts) {
        log(`Attempt ${attempt}/${maxAttempts} for ${productUrl}`);
        let context = null;
        try {
            const browser = await getBrowser(headless);
            context = await browser.newContext();
            const page = await context.newPage();
            page.setDefaultTimeout(timeout);

            log('Loading product page...');
            await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
            
            // Wait for basic product container to ensure page is loaded
            log('Waiting for product details...');
            // Check if there's a permanent error (like product not found)
            const errorEl = await page.waitForSelector('.grid-error, .detail-info h1', { timeout: timeout });
            const errorClassName = await errorEl.getAttribute('class');
            if (errorClassName && errorClassName.includes('grid-error')) {
                const errorMsg = await errorEl.textContent();
                const err = new Error(`Permanent failure: ${errorMsg}`);
                err.isPermanent = true;
                throw err;
            }

            const name = await page.$eval('.detail-info h1', el => el.textContent.trim());
            
            log('Waiting for dynamic price block...');
            const priceBlock = await page.waitForSelector('.price-block');
            const box = await priceBlock.boundingBox();
            
            if (box) {
                log('Triggering dynamic price fetch via mouse movement...');
                // Move mouse back and forth to satisfy the minMoves/minDwellMs requirement
                await page.mouse.move(box.x + 10, box.y + 10);
                for (let i = 0; i < 15; i++) {
                    await page.mouse.move(box.x + 10 + (i * 5), box.y + 10 + (i * 2));
                    await page.waitForTimeout(50);
                }
                // Wait for the "dwell" time requirement (minDwellMs = 600)
                await page.waitForTimeout(700);

                // Try clicking "Reveal price" if it appears and is active
                try {
                    const revealBtn = await page.$('button.btn-primary:has-text("Reveal price")');
                    if (revealBtn && !(await revealBtn.isDisabled())) {
                        log('Clicking "Reveal price" button...');
                        await revealBtn.click();
                    }
                } catch (e) {
                    // Ignore if button not found or not clickable
                }
                
                log('Waiting for price to become available...');
                // Wait for the success state of the price block
                await page.waitForSelector('.price-success', { timeout: 6000 });
                const priceText = await page.evaluate(() => {
                    const main = document.querySelector('.price-main');
                    if (!main) return '';
                    let largest = null;
                    let maxFontSize = 0;
                    for (const el of Array.from(main.children)) {
                        if (el.hasAttribute('aria-hidden') || window.getComputedStyle(el).display === 'none') continue;
                        const fs = parseFloat(window.getComputedStyle(el).fontSize);
                        if (fs > maxFontSize) {
                            maxFontSize = fs;
                            largest = el;
                        }
                    }
                    return largest ? largest.textContent.trim() : '';
                });
                
                log(`Price text detected: ${priceText}`);
                
                // Normalize fullwidth Unicode digits (e.g. ２→2) — the mock store
                // sometimes renders prices in fullwidth characters as an obfuscation layer.
                // Without this, /[^0-9.]/ passes them through and parseFloat returns 0.
                const normalizedPrice = priceText.replace(/[\uFF10-\uFF19]/g, c =>
                    String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30)
                );
                let cleanPrice = normalizedPrice.replace(/[^0-9.]/g, '');
                if (cleanPrice.indexOf('.') !== cleanPrice.lastIndexOf('.')) {
                    const parts = cleanPrice.split('.');
                    cleanPrice = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
                }
                const price = parseFloat(cleanPrice) || 0;

                log('Waiting for stock status...');
                await page.waitForSelector('.stock-badge');
                const stock = await page.$eval('.stock-badge', el => el.textContent.trim());
                log(`Stock detected: ${stock}`);

                const result = {
                    name,
                    price,
                    stock,
                    url: productUrl
                };
                log('Validating data...');

                if (validateData(result)) {
                    log('Validation successful');
                    log('SUCCESS');
                    attemptHistory.push({ attempt, status: 'SUCCESS', error: null });
                    if (context) await context.close().catch(() => {});
                    return {
                        success: true,
                        product: result,
                        attempts: attempt,
                        attemptHistory,
                        error: null
                    };
                } else {
                    throw new Error('Validation failed: Missing or invalid data in extracted values');
                }
            } else {
                throw new Error('Price block is not visible on screen');
            }
        } catch (e) {
            error = e.message;
            log(`Failure: ${error}`);
            if (context) {
                await context.close().catch(() => {});
            }
            
            // Do not retry on permanent errors
            if (e.isPermanent) {
                attemptHistory.push({ attempt, status: 'FAILED', error: e.message });
                break;
            }
            
            // Is this a retryable transient failure?
            const isLastAttempt = attempt >= maxAttempts;
            attemptHistory.push({ attempt, status: isLastAttempt ? 'FAILED' : 'RETRIED', error: e.message });
            
            if (!isLastAttempt) {
                const delay = CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                log(`Retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
            }
            attempt++;
        }
    }

    log(`FAILED after ${attempt - 1} attempts`);
    return {
        success: false,
        product: null,
        attempts: attempt - 1,
        attemptHistory,
        error: error
    };
}

module.exports = { scrapeProduct };

// Simple CLI test execution
if (require.main === module) {
    const args = process.argv.slice(2);
    const headless = !args.includes('--headed');
    let testUrl = 'https://demo.inelabteamdev.com/product/709';
    
    // Check if a URL was passed
    const urlArg = args.find(a => a.startsWith('http'));
    if (urlArg) {
        testUrl = urlArg;
    }
    
    console.log(`\nStarting scrape test for ${testUrl} (headless: ${headless})\n`);
    
    (async () => {
        const start1 = Date.now();
        const res1 = await scrapeProduct(testUrl, { headless });
        console.log(`\n--- First Scrape (${Date.now() - start1}ms) ---`);
        console.log(JSON.stringify(res1, null, 2));

        const start2 = Date.now();
        const res2 = await scrapeProduct(testUrl, { headless });
        console.log(`\n--- Second Scrape (${Date.now() - start2}ms) ---`);
        console.log(JSON.stringify(res2, null, 2));
        
        process.exit(0);
    })();
}
