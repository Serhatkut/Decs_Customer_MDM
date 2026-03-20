const puppeteer = require('puppeteer-core');

(async () => {
    try {
        const browser = await puppeteer.launch({ 
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: true 
        });
        const page = await browser.newPage();
        
        page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
        page.on('pageerror', error => console.error('BROWSER ERROR:', error.message));
        
        await page.goto('http://localhost:8002');
        await new Promise(r => setTimeout(r, 2000));
        
        const html = await page.evaluate(() => {
            return document.querySelector('#viz').innerHTML;
        });
        console.log("VIZ HTML:", html.substring(0, 1000));
        
        await browser.close();
    } catch(e) {
        console.log("Error:", e.message);
    }
})();
