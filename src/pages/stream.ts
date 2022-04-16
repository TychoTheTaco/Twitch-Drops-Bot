"use strict";

import logger from "../logger.js";
import {TwitchPage} from "./page.js";

export class StreamPage extends TwitchPage {

    /**
     * Change the visibility of all `video` elements to `hidden` to lower CPU usage.
     */
    async hideVideoElements() {
        const videoElements = await this.page.$$('video');
        for (let handle of videoElements) {
            await handle.evaluate((element: any) => {
                element.style.visibility = 'hidden';
            });
        }
    }

    /**
     * Wait for this page to be fully loaded. This page is considered "fully loaded" when the viewer count and uptime
     * elements are visible.
     */
    async waitForLoad() {
        await this.page.waitForSelector('p[data-a-target="animated-channel-viewers-count"]');
        await this.page.waitForSelector('span.live-time');
    }

    /**
     * Click accept on any mature content warnings.
     */
    async acceptMatureContent() {
        await this.click('[data-a-target="player-overlay-mature-accept"]');
    }

    /**
     * Set the stream quality to the lowest available quality.
     */
    async setLowestStreamQuality() {
        await this.#clickSettingsButton();

        const qualityButtonSelector = '[data-a-target="player-settings-menu-item-quality"]';
        await this.page.waitForSelector(qualityButtonSelector);
        await this.click(qualityButtonSelector);

        const lowestQualityButtonSelector = 'div[data-a-target="player-settings-menu"]>div:last-child input';
        const lowestQualityButton = await this.page.waitForSelector(lowestQualityButtonSelector);
        if (!await (await lowestQualityButton?.getProperty('checked'))?.jsonValue()) {
            await this.click(lowestQualityButtonSelector);
        } else {
            await this.#clickSettingsButton();
        }
    }

    async getViewersCount() {
        const element = await this.page.$('p[data-a-target="animated-channel-viewers-count"]');
        const property = await element?.getProperty('innerText');
        const value = await property?.jsonValue() as string;
        const cleanValue = value.replace(/[.,]/g, '');
        return parseInt(cleanValue);
    }

    async getUptime() {
        const element = await this.page.$('span.live-time');
        const property = await element?.getProperty('innerText');
        return await property?.jsonValue();
    }

    async #clickSettingsButton() {
        const settingsButtonSelector = '[data-a-target="player-settings-button"]';
        await this.page.waitForSelector(settingsButtonSelector);
        await this.click(settingsButtonSelector);
    }

    async expandChatColumn() {
        // Check if the chat column is currently expanded or collapsed
        const rightColumnDiv = await this.page.waitForSelector("div.right-column");
        const dataATargetAttributeValue = await rightColumnDiv?.evaluate((element: any) => {
            return element.getAttribute("data-a-target");
        });
        if (dataATargetAttributeValue === "right-column-chat-bar") {
            // The chat bar is already expanded, so we don't have to do anything
        } else if (dataATargetAttributeValue === "right-column-chat-bar-collapsed") {
            // Expand the chat column
            await this.click("button[data-a-target='right-column__toggle-collapse-btn']");
        } else {
            logger.debug("Unknown chat column state: " + dataATargetAttributeValue);
        }
    }

}
