// Inspect the full .price-main HTML of product 254 to see ALL price elements
const { chromium } = require('playwright');
async function run() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://demo.inelabteamdev.com/product/254');
    
    const priceBlock = await page.waitForSelector('.price-block');
    const box = await priceBlock.boundingBox();
    
    await page.mouse.move(box.x + 10, box.y + 10);
    for (let i = 0; i < 15; i++) {
        await page.mouse.move(box.x + 10 + (i * 5), box.y + 10 + (i * 2));
        await page.waitForTimeout(50);
    }
    await page.waitForTimeout(700);
    const revealBtn = await page.$('button.btn-primary:has-text("Reveal price")');
    if (revealBtn && !(await revealBtn.isDisabled())) await revealBtn.click();
    await page.waitForSelector('.price-success', { timeout: 10000 });
    
    // Get full HTML of price-main to see all elements
    const priceMainHTML = await page.$eval('.price-main', el => el.innerHTML);
    console.log('=== .price-main HTML ===');
    console.log(priceMainHTML);
    
    // Get all children details
    const childDetails = await page.evaluate(() => {
        const main = document.querySelector('.price-main');
        return Array.from(main.children).map(el => ({
            tag: el.tagName,
            class: el.className,
            ariaHidden: el.hasAttribute('aria-hidden'),
            display: window.getComputedStyle(el).display,
            fontSize: window.getComputedStyle(el).fontSize,
            text: el.textContent.trim().replace(/\s+/g, ' '),
            dataPriceAttr: el.getAttribute('data-price'),
        }));
    });
    console.log('\n=== Children of .price-main ===');
    childDetails.forEach((c, i) => {
        console.log(`[${i}] tag=${c.tag} class="${c.class}" ariaHidden=${c.ariaHidden} display=${c.display} fontSize=${c.fontSize} text="${c.text}" data-price=${c.dataPriceAttr}`);
    });
    
    // What does the current selector pick?
    const pickedText = await page.evaluate(() => {
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
        return largest ? `tag=${largest.tagName} class="${largest.className}" fontSize=${maxFontSize} text="${largest.textContent.trim()}"` : 'NONE';
    });
    console.log('\n=== Selector picks ===');
    console.log(pickedText);
    
    await browser.close();
}
run().catch(console.error);
