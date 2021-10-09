'use strict';

const prompt = require("prompt");
const fs = require("fs");

async function asyncPrompt(schema) {
    return new Promise((resolve, reject) => {
        prompt.get(schema, (error, result) => {
            if (error) {
                reject(error);
            }
            resolve(result);
        });
    });
}

async function saveScreenshotAndHtml(page, pathPrefix){
    const time = new Date().getTime();
    const screenshotPath = pathPrefix + '-screenshot-' + time + '.png';
    const htmlPath = pathPrefix + '-page-' + time + '.html';
    await page.screenshot({
        fullPage: true,
        path: screenshotPath
    });
    fs.writeFileSync(htmlPath, await page.content());
}

module.exports = {
    asyncPrompt, saveScreenshotAndHtml
}
