'use strict';

import fs from 'fs';

const prompt = require('prompt');
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

/**
 * Click the element specified by 'selector' by calling its click() method. This is usually better than using
 * Puppeteer's Page.click() because Puppeteer attempts to scroll the page and simulate an actual mouse click.
 * This can cause the click to fail if elements are displayed on top of it (for example popup dialogs).
 * @param page
 * @param selector
 */
export async function click(page: Page, selector: string) {
    return page.evaluate((selector) => {
        document.querySelector(selector).click();
    }, selector);
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
    saveScreenshotAndHtml,
    click
};
