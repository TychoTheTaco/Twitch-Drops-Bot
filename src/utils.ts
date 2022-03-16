'use strict';

import fs from 'fs';

const prompt = require("prompt");
prompt.start();  // Initialize prompt (this should only be called once!)
import {Page} from "puppeteer";

export async function asyncPrompt(schema: any) {
    return new Promise((resolve, reject) => {
        prompt.get(schema, (error: any, result: any) => {
            if (error) {
                reject(error);
            }
            resolve(result);
        });
    });
}

export async function saveScreenshotAndHtml(page: Page, pathPrefix: string) {
    const time = new Date().getTime();
    const screenshotPath = pathPrefix + '-screenshot-' + time + '.png';
    const htmlPath = pathPrefix + '-page-' + time + '.html';
    await page.screenshot({
        fullPage: true,
        path: screenshotPath
    });
    fs.writeFileSync(htmlPath, await page.content());
}

export class TimedSet<T> extends Set<T> {

    readonly #timeout: number;

    /**
     * A {@link Set} that automatically removes items after {@link timeout} milliseconds.
     * @param timeout
     */
    constructor(timeout: number) {
        super();
        this.#timeout = timeout;
    }

    add(value: T): this {
        const isValueInSet = this.has(value);
        const result = super.add(value);
        if (!isValueInSet) {
            setTimeout(() => {
                this.delete(value);
            }, this.#timeout);
        }
        return result;
    }
}

export default {
    asyncPrompt,
    saveScreenshotAndHtml
};
