const puppeteer = require('puppeteer-core');
(async () => {
    try {
        const browser = await puppeteer.launch({ 
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: true 
        });
        const page = await browser.newPage();
        
        page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
        
        await page.goto('http://localhost:8002');
        await page.waitForTimeout(2000);
        
        const html = await page.evaluate(() => document.querySelector('#viz').innerHTML);
        console.log("HTML length:", html.length);
        if(html.length < 500) console.log("HTML content:", html);
        
        await browser.close();
    } catch(e) {
        console.log("Error:", e.message);
    }
})();
