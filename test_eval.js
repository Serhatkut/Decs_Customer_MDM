const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const html = fs.readFileSync('index.html', 'utf8');

const dom = new JSDOM(html, { 
    runScripts: "dangerously", 
    resources: "usable",
    url: "http://localhost:8002/" 
});

dom.window.onerror = function(msg, url, line, col, error) {
    console.error("JSDOM ERROR:", msg, line, col);
};

dom.window.document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        console.log("SVG HTML:", dom.window.document.querySelector("#viz").innerHTML.substring(0, 500));
    }, 1000);
});
