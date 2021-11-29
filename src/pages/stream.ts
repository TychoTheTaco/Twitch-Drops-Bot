'use strict';

import {Page} from "puppeteer";

async function click(page: Page, selector: string) {
    return page.evaluate((selector) => {
        document.querySelector(selector).click();
    }, selector);
}

export class StreamPage {

    readonly #page: Page;

    constructor(page: Page) {
        this.#page = page;
    }

    async hideVideo() {
        // Change the "visibility" of videos to "hidden" to lower CPU usage
        const videoElements = await this.#page.$$('video');
        for (let handle of videoElements) {
            await handle.evaluate((element: any) => {
                element.style.visibility = 'hidden';
            });
        }
    }

    async waitForLoad(){
        // Wait for the viewer count and uptime to be visible
        await this.#page.waitForSelector('p[data-a-target="animated-channel-viewers-count"]');
        await this.#page.waitForSelector('span.live-time');
    }

    async acceptMatureContent(){
        await click(this.#page, '[data-a-target="player-overlay-mature-accept"]');
    }

    async setLowestStreamQuality(){
        await this.#clickSettingsButton();

        const qualityButtonSelector = '[data-a-target="player-settings-menu-item-quality"]';
        await this.#page.waitForSelector(qualityButtonSelector);
        await click(this.#page, qualityButtonSelector);

        const lowestQualityButtonSelector = 'div[data-a-target="player-settings-menu"]>div:last-child input';
        const lowestQualityButton = await this.#page.waitForSelector(lowestQualityButtonSelector);
        if (!await (await lowestQualityButton?.getProperty('checked'))?.jsonValue()){
            await click(this.#page, lowestQualityButtonSelector);
        } else {
            await this.#clickSettingsButton();
        }
    }

    async getViewersCount(){
        const element = await this.#page.$('p[data-a-target="animated-channel-viewers-count"]');
        const property = await element?.getProperty('innerText');
        const value = await property?.jsonValue() as string;
        const cleanValue = value.replace(/[.,]/g, '');
        return parseInt(cleanValue);
    }

    async getUptime(){
        const element = await this.#page.$('span.live-time');
        const property = await element?.getProperty('innerText');
        return await property?.jsonValue();
    }

    async openVideoStats(){
        await this.#clickSettingsButton();

        const advancedButtonSelector = '[data-a-target="player-settings-menu-item-advanced"]';
        await this.#page.waitForSelector(advancedButtonSelector);
        await click(this.#page, advancedButtonSelector);

        const videoStatsButtonSelector = '[data-a-target="player-settings-submenu-advanced-video-stats"] input';
        const videoStatsButton = await this.#page.waitForSelector(videoStatsButtonSelector);
        if (!await (await videoStatsButton?.getProperty('checked'))?.jsonValue()){
            await click(this.#page, videoStatsButtonSelector);
        }

        await this.#clickSettingsButton();
    }

    async getPlaybackBitrate(){
        const playbackBitrateXpath = '//*[contains(text(), "Playback Bitrate")]/ancestor::tr/td[last()]';
        return await (await (await this.#page.waitForXPath(playbackBitrateXpath))?.getProperty('innerText'))?.jsonValue();
    }

    async getDropProgress(){
        const dropProgressBarXpath = '//a[@data-a-target="inventory-dropdown-link"]//div[@data-a-target="tw-progress-bar-animation"]';

        // Check if the progress bar exists. If it doesn't, we probably need to open the user menu.
        if ((await this.#page.$x(dropProgressBarXpath)).length === 0){

            // Open the user menu. We can leave it open to avoid having to reopen it every time.
            const menuToggleButtonSelector = 'button[data-a-target="user-menu-toggle"]';
            await click(this.#page, menuToggleButtonSelector);

        }

        // Return drop progress as a percentage between 0 and 1
        return await (await this.#page.waitForXPath(dropProgressBarXpath))?.evaluate((element) => {
            return parseInt(element.getAttribute('value') as string) / 100;
        });
    }

    async #clickSettingsButton(){
        const settingsButtonSelector = '[data-a-target="player-settings-button"]';
        await this.#page.waitForSelector(settingsButtonSelector);
        await click(this.#page, settingsButtonSelector);
    }

}
