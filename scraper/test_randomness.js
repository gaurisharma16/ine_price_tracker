const { chromium } = require('playwright');
async function run() {
    const browser = await chromium.launch({ headless: true });
    for (let i = 0; i < 3; i++) {
        const page = await browser.newPage();
        await page.goto('https://demo.inelabteamdev.com/product/303');
        await page.waitForSelector('.price-block');
        const box = await page.$('.price-block').then(el => el.boundingBox());
        if (box) {
            await page.mouse.move(box.x + 10, box.y + 10);
            for (let j = 0; j < 15; j++) {
                await page.mouse.move(box.x + 10 + (j * 5), box.y + 10 + (j * 2));
                await page.waitForTimeout(50);
            }
            await page.waitForTimeout(700);
            const revealBtn = await page.$('button.btn-primary:has-text("Reveal price")');
            if (revealBtn && !(await revealBtn.isDisabled())) await revealBtn.click();
            await page.waitForSelector('.price-success', { timeout: 10000 });
            const price = await page.$eval('.price-value', el => el.textContent.trim());
            console.log('Load', i+1, 'price:', price);
        }
        await page.close();
    }
    await browser.close();
}
run();
