'use strict';

import fs from 'fs';

const prompt = require('prompt');
import {Page} from "puppeteer";

async function asyncPrompt(schema: any) {
    return new Promise((resolve, reject) => {
        prompt.get(schema, (error: any, result: any) => {
            if (error) {
                reject(error);
            }
            resolve(result);
        });
    });
}

async function saveScreenshotAndHtml(page: Page, pathPrefix: string){
    const time = new Date().getTime();
    const screenshotPath = pathPrefix + '-screenshot-' + time + '.png';
    const htmlPath = pathPrefix + '-page-' + time + '.html';
    await page.screenshot({
        fullPage: true,
        path: screenshotPath
    });
    fs.writeFileSync(htmlPath, await page.content());
}

export default {
    asyncPrompt,
    saveScreenshotAndHtml
};
