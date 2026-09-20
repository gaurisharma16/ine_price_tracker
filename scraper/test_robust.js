const { chromium } = require('playwright');
async function run() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://demo.inelabteamdev.com/product/303');
    
    // Cookie banner
    try {
        const cookieBtn = await page.$('.cookie-accept');
        if (cookieBtn) await cookieBtn.click();
    } catch(e) {}
    
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
        
        // Old way:
        const fakePrice = await page.$eval('.price-value', el => el.textContent.trim());
        
        // New robust way:
        const realPrice = await page.evaluate(() => {
            const main = document.querySelector('.price-main');
            let largest = null;
            let maxFontSize = 0;
            const children = Array.from(main.children);
            for (const el of children) {
                if (el.hasAttribute('aria-hidden') || window.getComputedStyle(el).display === 'none') continue;
                const fs = parseFloat(window.getComputedStyle(el).fontSize);
                if (fs > maxFontSize) {
                    maxFontSize = fs;
                    largest = el;
                }
            }
            return largest ? largest.textContent.trim() : '';
        });
        
        console.log('Fake/Old Price:', fakePrice);
        console.log('Real/New Price:', realPrice);
    }
    
    await browser.close();
}
run();
