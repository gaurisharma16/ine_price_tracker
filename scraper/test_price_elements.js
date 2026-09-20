const { chromium } = require('playwright');
async function run() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://demo.inelabteamdev.com/product/303');
    await page.waitForSelector('.price-block');
    const priceBlocks = await page.$$eval('.price-value', els => els.map(el => el.textContent.trim()));
    console.log('All .price-value texts:', priceBlocks);
    
    // Now trigger the actual scrape and see if the price changes
    const priceBlock = await page.waitForSelector('.price-block');
    const box = await priceBlock.boundingBox();
    if (box) {
        await page.mouse.move(box.x + 10, box.y + 10);
        for (let i = 0; i < 15; i++) {
            await page.mouse.move(box.x + 10 + (i * 5), box.y + 10 + (i * 2));
            await page.waitForTimeout(50);
        }
        await page.waitForTimeout(700);
        const revealBtn = await page.$('button.btn-primary:has-text("Reveal price")');
        if (revealBtn && !(await revealBtn.isDisabled())) await revealBtn.click();
        await page.waitForSelector('.price-success', { timeout: 10000 });
        const postPriceBlocks = await page.$$eval('.price-value', els => els.map(el => el.textContent.trim()));
        console.log('Post-reveal .price-value texts:', postPriceBlocks);
    }
    
    await browser.close();
}
run();
