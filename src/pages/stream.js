'use strict';

async function click(page, selector) {
    return page.evaluate((selector) => {
        document.querySelector(selector).click();
    }, selector);
}

class StreamPage {

    constructor(page) {
        this._page = page;
    }

    async acceptMatureContent(){
        await click(this._page, '[data-a-target="player-overlay-mature-accept"]');
    }

    async setLowestStreamQuality(){
        const settingsButtonSelector = '[data-a-target="player-settings-button"]';
        await this._page.waitForSelector(settingsButtonSelector);
        await click(this._page, settingsButtonSelector);

        const qualityButtonSelector = '[data-a-target="player-settings-menu-item-quality"]';
        await this._page.waitForSelector(qualityButtonSelector);
        await click(this._page, qualityButtonSelector);

        await click(this._page, 'div[data-a-target="player-settings-menu"]>div:last-child input');
    }

    async getViewerCount(){
        const element = await this._page.$('p[data-a-target="animated-channel-viewers-count"]');
        const property = await element.getProperty('innerText');
        const value = await property.jsonValue();
        return parseInt(value);
    }

    async getUptime(){
        const element = await this._page.$('span.live-time');
        const property = await element.getProperty('innerText');
        return await property.jsonValue();
    }

}

module.exports = {
    StreamPage
}
