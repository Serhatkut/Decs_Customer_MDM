const puppeteer = require('puppeteer-core');
const fs = require('fs');
(async () => {
    const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
    const page = await browser.newPage();
    page.on('console', msg => fs.appendFileSync('pup_log.txt', msg.text() + '\n'));
    page.on('pageerror', error => fs.appendFileSync('pup_log.txt', error.message + '\n'));
    await page.goto('http://localhost:8002');
    await new Promise(r => setTimeout(r, 2000));
    const html = await page.evaluate(() => document.querySelector('#viz').outerHTML);
    fs.writeFileSync('pup_out.html', html);
    await browser.close();
})();
