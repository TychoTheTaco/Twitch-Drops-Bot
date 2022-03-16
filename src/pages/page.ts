"use strict";

import {Page} from "puppeteer";

export abstract class TwitchPage {

    readonly #page: Page;

    constructor(page: Page) {
        this.#page = page;
    }

    /**
     * Click the element specified by {@link selector} by calling its click() method. This is usually better than using
     * Puppeteer's Page.click() because Puppeteer attempts to scroll the page and simulate an actual mouse click,
     * which can fail if elements are displayed on top of it (for example popup dialogs).
     * @param selector
     */
    protected async click(selector: string) {
        return this.#page.evaluate((selector) => {
            document.querySelector(selector).click();
        }, selector);
    }

    get page(): Page {
        return this.#page;
    }

}
