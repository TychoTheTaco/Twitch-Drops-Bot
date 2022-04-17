import {ElementHandle, Page} from "puppeteer";
const TimeoutError = require("puppeteer").errors.TimeoutError;

import {Client, TimeBasedDrop} from "./twitch.js";
import WebSocketListener from "./web_socket_listener.js";
import logger from "./logger.js";
import {StreamPage} from "./pages/stream.js";
import {StreamDownError, StreamLoadFailedError} from "./errors.js";

interface StreamWatcherOptions {

    claimDrops?: boolean,

    // Should we throw an error if there hasn't been any Drop progress in a while
    requireDropProgress?: boolean,

    // Should we stop watching after claiming a drop?
    exitOnClaim?: boolean,

    // The Drop that we are expecting to make progress towards.
    expectedDrop?: TimeBasedDrop
}

class StreamWatcher {

    readonly #page: Page;

    readonly #twitchClient: Client;

    readonly #claimDrops: boolean = true;

    readonly #requireDropProgress: boolean = true;

    readonly #exitOnClaim: boolean = true;

    readonly #expectedDrop: TimeBasedDrop | null = null;

    readonly #hideVideoElements: boolean = false;

    #isWatchingStream: boolean = false;

    constructor(page: Page, twitchClient: Client, options?: StreamWatcherOptions) {
        this.#page = page;
        this.#twitchClient = twitchClient;
        this.#claimDrops = options?.claimDrops ?? this.#claimDrops;
        this.#requireDropProgress = options?.requireDropProgress ?? this.#requireDropProgress;
        this.#exitOnClaim = options?.exitOnClaim ?? this.#exitOnClaim;
        this.#expectedDrop = options?.expectedDrop ?? this.#expectedDrop;
    }

    async watch(streamUrl: string) {
        // If we are expecting to make progress towards a specific Drop, we need to check if this stream will actually
        // provide progress towards that Drop. If the stream has a different Drop than expected enabled, then we will
        // still watch the stream. If the stream has no Drops enabled, then we will not watch this stream.
        if (this.#claimDrops && this.#expectedDrop) {
            const channelLogin = streamUrl.split("twitch.tv/")[1];

            // Get channel ID
            const user = await this.#twitchClient.getStreamMetadata(channelLogin);
            const channelId = user.channel.id;

            // Get available Drops
            const availableDrops = await this.#twitchClient.getAvailableCampaigns(channelId);
            if (availableDrops.length === 0){
                return; //todo: error
            }
        }

        // Listen to web socket events
        const webSocketListener = new WebSocketListener();
        const events: any[] = [];
        webSocketListener.on('message', message => {
            events.push(message);
        })

        // Wrap everything in a try/finally block so that we can detach the web socket listener at the end
        try {
            await webSocketListener.attach(this.#page);

            // Go to the stream URL
            await this.#page.goto(streamUrl);

            // Wait for the page to load completely (hopefully). This checks the video player container for any DOM changes and waits until there haven't been any changes for a few seconds.
            logger.info('Waiting for page to load...');
            const element = (await this.#page.$x('//div[@data-a-player-state]'))[0]
            await waitUntilElementRendered(this.#page, element); //todo: timout

            const streamPage = new StreamPage(this.#page);
            try {
                await streamPage.waitForLoad();
            } catch (error) {
                if (error instanceof TimeoutError) {
                    throw new StreamLoadFailedError();
                }
                throw error;
            }

            try {
                // Click "Accept mature content" button
                await streamPage.acceptMatureContent();
                logger.info('Accepted mature content');
            } catch (error) {
                // Ignore errors, the button is probably not there
            }

            try {
                await streamPage.setLowestStreamQuality();
                logger.info('Set stream to lowest quality');
            } catch (error) {
                logger.error('Failed to set stream to lowest quality!');
                throw error;
            }

            // This does not affect the drops, so if the user requests lets hide the videos
            if (this.#hideVideoElements) {
                try {
                    await streamPage.hideVideoElements();
                    logger.info('Set stream visibility to hidden');
                } catch (error) {
                    logger.error('Failed to set stream visibility to hidden!');
                    throw error;
                }
            }

            // Main loop
            while (true) {

                // Process web socket events
                for (const message of events){

                }

                /*if (this.#isStreamDown) {
                    this.#isStreamDown = false;
                    this.#stopProgressBar(true);
                    await this.#page.goto("about:blank");
                    throw new StreamDownError();
                }

                // Check if there is a higher priority stream we should be watching
                if (this.#pendingHighPriority) {
                    this.#pendingHighPriority = false;
                    logger.info('Switching to higher priority stream');
                    throw new HighPriorityError();
                }*/

                // Check if the URL changed since we started watching. This can happen when a broadcaster ends their stream via a Raid.
                const currentUrl = this.#page.url();
                if (currentUrl !== streamUrl) {
                    logger.debug("url mismatch: " + currentUrl + " vs " + streamUrl);
                    throw new StreamDownError("url mismatch");
                }

                await this.#page.waitForTimeout(1000);
            }

        } finally {
            await webSocketListener.detach();
        }
    }

    stop() {

    }

}

async function waitUntilElementRendered(page: Page, element: ElementHandle, timeout: number = 1000 * 30) {
    const checkDurationMsecs = 1000;
    const maxChecks = timeout / checkDurationMsecs;
    let lastHTMLSize = 0;
    let checkCounts = 1;
    let countStableSizeIterations = 0;
    const minStableSizeIterations = 3;

    while (checkCounts++ <= maxChecks) {
        let html: string | undefined = await (await element.getProperty('outerHTML'))?.jsonValue();
        if (!html) {
            throw new Error('HTML was undefined!');
        }
        let currentHTMLSize = html.length;

        if (lastHTMLSize !== 0 && currentHTMLSize === lastHTMLSize) {
            countStableSizeIterations++;
        } else {
            countStableSizeIterations = 0;
        }

        if (countStableSizeIterations >= minStableSizeIterations) {
            break;
        }

        lastHTMLSize = currentHTMLSize;
        await page.waitForTimeout(checkDurationMsecs);
    }
}
