"use strict";

require("dnscache")({enable: true});

import fs from "fs";

import axios from "axios";
import {errors, Browser} from "puppeteer";

const {TimeoutError} = errors;
const prompt = require("prompt");

import logger from "./logger";
import utils from "./utils";

export interface Stream {
    url: string,
    broadcaster_id: string
}

/*
NOTE: The below interfaces do not always have all fields present! Some Twitch API calls don't return all the fields.
I could mark them all optional, but that would lead to a lot of unnecessary null checking throughout the code.
I could make a separate interface for each API call but that would get messy very quickly and lead to a lot of duplicate information
*/

export interface Game {
    id: string,
    displayName: string
}

export interface DropCampaign {
    id: string,
    status: string,
    game: Game,
    self: {
        isAccountConnected: boolean
    },
    endAt: string,
    name: string,
    timeBasedDrops: TimeBasedDrop[],
    allow: {
        channels: {
            id: string,
            displayName: string
        }[],
        isEnabled: boolean
    }
}

export interface TimeBasedDrop {
    id: string
    benefitEdges: {
        benefit: {
            id: string,
            name: string
        }
    }[],
    startAt: string,
    endAt: string,
    requiredMinutesWatched: number,
    name: string,
    preconditionDrops: {
        id: string
    }[],
    self: {
        currentMinutesWatched: number,
        dropInstanceID: string,
        isClaimed: boolean
    },
    campaign: DropCampaign
}

export interface UserDropReward {
    id: string,
    game: Game,
    lastAwardedAt: string,
    name: string,
    totalCount: number
}

export interface Inventory {
    dropCampaignsInProgress: DropCampaign[],
    gameEventDrops: UserDropReward[]
}

export enum Tag {
    DROPS_ENABLED = "c2542d6d-cd10-4532-919b-3d19f30a768b"
}

export class Client {

    readonly #clientId: string;
    readonly #oauthToken: string;
    readonly #channelLogin: string;

    constructor(clientId: string, oauthToken: string, channelLogin: string) {
        this.#clientId = clientId;
        this.#oauthToken = oauthToken;
        this.#channelLogin = channelLogin;
    }

    /**
     * Send a POST request to the Twitch GQL endpoint. The request will include authentication headers.
     * @param data The data to send to the API.
     * @private
     */
    async #post(data: any): Promise<any> {
        const response = await axios.post("https://gql.twitch.tv/gql", data,
            {
                headers: {
                    "Content-Type": "text/plain;charset=UTF-8",
                    "Client-Id": this.#clientId,
                    "Authorization": `OAuth ${this.#oauthToken}`
                }
            }
        );

        // The API will always return a status code of 200, even if there are errors. If there are any errors, they
        // will be included in the response data, so I check for them here and throw an error if there are any.
        // Just because there are errors does not mean the entire request failed; if you sent multiple operations in
        // a single POST request, then the errors may only refer to some operations, meaning the others were
        // successful. Despite this, it is still better to throw an exception if there are any errors since this class
        // only sends POST requests with a single operation.
        if ("errors" in response.data) {
            throw new Error("API ERROR: " + JSON.stringify(response.data, null, 4));
        }

        // Return the response data
        return response.data;
    }

    /**
     * Get a list of drop campaigns. This can include expired, active, and future campaigns.
     */
    async getDropCampaigns(): Promise<DropCampaign[]> {
        const data = await this.#post({
            "operationName": "ViewerDropsDashboard",
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "e8b98b52bbd7ccd37d0b671ad0d47be5238caa5bea637d2a65776175b4a23a64"
                }
            }
        });
        try {
            return data["data"]["currentUser"]["dropCampaigns"];
        } catch (error) {
            logger.debug("Error in function getDropCampaigns! Response: " + JSON.stringify(data, null, 4));
            throw error;
        }
    }

    async getDropCampaignDetails(dropId: string): Promise<DropCampaign> {
        const data = await this.#post({
            "operationName": "DropCampaignDetails",
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "14b5e8a50777165cfc3971e1d93b4758613fe1c817d5542c398dce70b7a45c05"
                }
            },
            "variables": {
                "dropID": dropId,
                "channelLogin": this.#channelLogin
            }
        });
        try {
            return data["data"]["user"]["dropCampaign"];
        } catch (error) {
            logger.debug("Error in function getDropCampaignDetails! Response: " + JSON.stringify(data, null, 4));
            throw error;
        }
    }

    async getInventory(): Promise<Inventory> {
        const data = await this.#post({
            "operationName": "Inventory",
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "9cdfc5ebf8ee497e49c5b922829d67e5bce039f3c713f0706d234944195d56ad"
                }
            }
        });
        try {
            return data["data"]["currentUser"]["inventory"];
        } catch (error) {
            logger.debug("Error in function getInventory! Response: " + JSON.stringify(data, null, 4));
            throw error;
        }
    }

    /**
     * Get a list of active streams.
     * @param gameName
     * @param options
     */
    async getActiveStreams(gameName: string, options?: { tags?: string[] }): Promise<Stream[]> {
        const data = await this.#post({
            "operationName": "DirectoryPage_Game",
            "variables": {
                "name": gameName.toLowerCase(),
                "options": {
                    "includeRestricted": [
                        "SUB_ONLY_LIVE"
                    ],
                    "sort": "VIEWER_COUNT",
                    "recommendationsContext": {
                        "platform": "web"
                    },
                    "requestID": "JIRA-VXP-2397", // TODO: what is this for???
                    "tags": options?.tags ?? []
                },
                "sortTypeIsRecency": false,
                "limit": 30
            },
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "d5c5df7ab9ae65c3ea0f225738c08a36a4a76e4c6c31db7f8c4b8dc064227f9e"
                }
            }
        });

        const streams = data["data"]["game"]["streams"];
        if (streams === null) {
            return [];
        }

        const result = [];
        for (const stream of streams["edges"]) {
            result.push({
                "url": "https://www.twitch.tv/" + stream["node"]["broadcaster"]["login"],
                "broadcaster_id": stream["node"]["broadcaster"]["id"]
            });
        }
        return result;
    }

    async claimDropReward(dropId: string) {
        const data = await this.#post({
            "operationName": "DropsPage_ClaimDropRewards",
            "variables": {
                "input": {
                    "dropInstanceID": dropId
                }
            },
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "2f884fa187b8fadb2a49db0adc033e636f7b6aaee6e76de1e2bba9a7baf0daf6"
                }
            }
        });
    }

    /**
     * Check if a stream is online.
     * @param broadcasterId
     */
    async isStreamOnline(broadcasterId: string) {
        const data = await this.#post({
            "operationName": "ChannelShell",
            "variables": {
                "login": broadcasterId
            },
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "580ab410bcd0c1ad194224957ae2241e5d252b2c5173d8e0cce9d32d5bb14efe"
                }
            }
        });
        return data["data"]["userOrError"]["stream"] !== null;
    }

    async getDropCampaignsInProgress() {
        const inventory = await this.getInventory();
        const campaigns = inventory.dropCampaignsInProgress;
        if (campaigns === null) {
            return [];
        }
        return campaigns;
    }

    async getInventoryDrop(dropId: string, campaignId?: string): Promise<TimeBasedDrop | null> {
        const campaigns = await this.getDropCampaignsInProgress();
        for (const campaign of campaigns) {
            if (!campaignId || campaign.id === campaignId) {
                const drops = campaign.timeBasedDrops;
                for (const drop of drops) {
                    if (drop.id === dropId) {
                        return drop;
                    }
                }
            }
        }
        return null;
    }

}

// todo: move this somewhere else, maybe part of twitch drops bot?
export async function login(browser: Browser, username?: string, password?: string, headless: boolean = false) {
    const page = await browser.newPage();

    // Throw an error if the page is closed for any reason
    const onPageClosed = () => {
        throw new Error("Page closed!");
    }
    page.on("close", onPageClosed);

    // Go to login page
    await page.goto("https://www.twitch.tv/login");

    // Enter username
    if (username !== undefined) {
        await page.focus("#login-username");
        await page.keyboard.type(username);
    }

    // Enter password
    if (password !== undefined) {
        await page.focus("#password-input");
        await page.keyboard.type(password);
    }

    // Click login button
    if (username !== undefined && password !== undefined) {
        await page.click('[data-a-target="passport-login-button"]');
    }

    if (headless) {
        while (true) {

            // TODO: This loop and try/catch statements could be replaced with Promise.any(), but it seems that Node.js 14 does not support it.

            // Check for email verification code
            try {
                logger.info("Checking for email verification...");
                await page.waitForXPath('//*[contains(text(), "please enter the 6-digit code we sent")]');
                logger.info("Email verification found.");

                // Prompt user for code
                prompt.start();
                const result: any = await utils.asyncPrompt(["code"]);
                const code = result["code"];
                prompt.stop();

                // Enter code
                const first_input = await page.waitForXPath("(//input)[1]");
                if (first_input == null) {
                    logger.error("first_input was null!");
                    break
                }
                await first_input.click();
                await page.keyboard.type(code);
                break;
            } catch (error) {
                if (error instanceof TimeoutError) {
                    logger.info("Email verification not found.");
                } else {
                    logger.error(error);
                }
            }

            // Check for 2FA code
            try {
                logger.info("Checking for 2FA verification...");
                await page.waitForXPath('//*[contains(text(), "Enter the code found in your authenticator app")]');
                logger.info("2FA verification found.");

                // Prompt user for code
                prompt.start();
                const result: any = await utils.asyncPrompt(["code"]);
                const code = result["code"];
                prompt.stop();

                // Enter code
                const first_input = await page.waitForXPath('(//input[@type="text"])');
                if (first_input == null) {
                    logger.error("first_input was null!");
                    break
                }
                await first_input.click();
                await page.keyboard.type(code);

                // Click submit
                const button = await page.waitForXPath('//button[@target="submit_button"]');
                if (button == null) {
                    logger.error("button was null!");
                    break
                }
                await button.click();

                break;
            } catch (error) {
                if (error instanceof TimeoutError) {
                    logger.info("2FA verification not found.");
                } else {
                    logger.error(error);
                }
            }

            logger.info("No extra verification found!");

            break;
        }

        // Wait for redirect to main Twitch page. If this times out then there is probably a different type of verification that we haven't checked for.
        try {
            await page.waitForNavigation();
        } catch (error) {
            if (error instanceof TimeoutError) {
                const time = new Date().getTime();
                const screenshotPath = "failed-login-screenshot-" + time + ".png";
                const htmlPath = "failed-login-html-" + time + ".html";
                logger.error("Failed to login. There was probably an extra verification step that this app didn't check for. " +
                    "A screenshot of the page will be saved to " + screenshotPath + " and the page content will be saved to " + htmlPath +
                    ". Please create an issue on GitHub with both of these files.");
                await page.screenshot({
                    fullPage: true,
                    path: screenshotPath
                });
                fs.writeFileSync(htmlPath, await page.content());
            }
            throw error;
        }

    } else {
        // Wait for redirect to main Twitch page. The timeout is unlimited here because we may be prompted for additional authentication.
        await page.waitForNavigation({timeout: 0});
    }

    const cookies = await page.cookies();

    page.off("close", onPageClosed);
    await page.close();

    return cookies;
}

export default {
    Client,
    login
}