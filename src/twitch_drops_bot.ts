const SortedArray = require("sorted-array-type");
const WaitNotify = require("wait-notify");
const cliProgress = require("cli-progress");
const {BarFormat} = cliProgress.Format;
const TimeoutError = require("puppeteer").errors.TimeoutError;

import WebSocketListener from "./web_socket_listener";
import {TwitchDropsWatchdog} from "./watchdog";
import {StreamPage} from "./pages/stream";
import utils from './utils';
import logger from "./logger";
import {ElementHandle, Page} from "puppeteer";
import {Client} from "./twitch";

class NoStreamsError extends Error {

}

class NoProgressError extends Error {

}

class HighPriorityError extends Error {

}

class StreamLoadFailedError extends Error {

}

class StreamDownError extends Error {

}

interface Game {
    id: string,
    displayName: string
}

interface Campaign {
    id: string,
    status: string,
    game: Game,
    self: {
        isAccountConnected: boolean
    },
    endAt: string,
    name: string
}

interface Drop {
    id: string
    self: {
        currentMinutesWatched: number
    },
    benefitEdges: {
        benefit: {
            id: string,
            name: string
        }
    }[],
    startAt: string,
    requiredMinutesWatched: number
}

interface InventoryDrop {
    id: string
    self: {
        currentMinutesWatched: number,
        dropInstanceID: string
    }
}

interface CampaignDetails {
    id: string,
    status: string,
    game: Game,
    self: {
        isAccountConnected: boolean
    },
    endAt: string,
    name: string,
    timeBasedDrops: Drop[],
    allow: {
        channels: {
            id: string,
            displayName: string
        }[],
        isEnabled: boolean
    }
}

export class TwitchDropsBot {

    // A list of game IDs to watch and claim drops for.
    readonly #gameIds: string[] = [];

    // The number of minutes to wait in between refreshing the drop campaign list
    readonly #dropCampaignPollingInterval: number = 15;

    // When a Stream fails #failedStreamRetryCount times (it went offline, or other reasons), it gets added to a
    // blacklist so we don't waste our time trying it. It is removed from the blacklist if we switch drop campaigns
    // or after #failedStreamBlacklistTimeout minutes.
    readonly #failedStreamRetryCount: number = 3;
    readonly #failedStreamBlacklistTimeout: number = 30;

    // When we use page.load(), the default timeout is 30 seconds, increasing this value can help when using low-end
    // devices (such as a Raspberry Pi) or when using a slower network connection.
    readonly #loadTimeoutSeconds: number = 30;

    // Setting the visibility of a video to "hidden" will lower the CPU usage.
    readonly #hideVideo: boolean = false;

    // When true, the bot will attempt to watch and claim drops for all games, even if they are not in 'gameIds'.
    // The games in 'gameIds' still have priority.
    readonly #watchUnlistedGames: boolean = false;

    // Show a warning if the Twitch account is not linked to the drop campaign
    readonly #showAccountNotLinkedWarning: boolean = true;

    // Twitch API client to use.
    readonly #twitchClient: Client;

    readonly #page: Page;

    #twitchDropsWatchdog: TwitchDropsWatchdog;

    #pendingDropCampaignIds = new SortedArray((a: string, b: string) => {

        if (a === b) {
            return 0;
        }

        const campaignA = this.#getDropCampaignById(a);
        const campaignB = this.#getDropCampaignById(b);

        // Sort campaigns based on order of game IDs specified in config
        const indexA = this.#gameIds.indexOf(campaignA['game']['id']);
        const indexB = this.#gameIds.indexOf(campaignB['game']['id']);
        if (indexA === -1 && indexB !== -1) {
            return 1;
        } else if (indexA !== -1 && indexB === -1) {
            return -1;
        } else if (indexA === indexB) {  // Both games have the same priority. Give priority to the one that ends first.
            const endTimeA = Date.parse(campaignA['endAt']);
            const endTimeB = Date.parse(campaignB['endAt']);
            if (endTimeA === endTimeB) {
                return a < b ? -1 : 1;
            }
            return endTimeA < endTimeB ? -1 : 1;
        }
        return Math.sign(indexA - indexB);
    });
    #pendingDropCampaignIdsNotifier = new WaitNotify();

    #progressBar: any = null;
    #payload: any = null;
    #total: any = null;
    #currentProgress: any = null;
    #isFirstOutput: boolean = true;
    #hasWrittenNewLine: boolean = false;

    #webSocketListener = new WebSocketListener();

    #currentDropCampaignId: string | null = null;

    #dropCampaignMap: { [key: string]: Campaign } = {};

    #pendingHighPriority: boolean = false;

    /**
     * The drop that we are currently making progress towards.
     */
    #currentDrop: Drop | null = null;

    /**
     * The drop that we are trying to make progress towards. Sometimes when watching a stream, we make progress towards
     * a different drop than we had intended. This can happen when a game has multiple drop campaigns and we try to
     * process one, but a different one is currently active.
     */
    #targetDrop: Drop | null = null;

    #viewerCount: number = 0;
    #currentMinutesWatched: { [key: string]: number } = {};
    #lastMinutesWatched: { [key: string]: number } = {};
    #lastProgressTime: { [key: string]: number } = {};
    #isDropReadyToClaim: boolean = false;
    #isStreamDown: boolean = false;

    constructor(page: Page, client: Client, options?: { gameIds?: string[], failedStreamBlacklistTimeout?: number, failedStreamRetryCount?: number, dropCampaignPollingInterval?: number, loadTimeoutSeconds?: number, hideVideo?: boolean, watchUnlistedGames?: boolean, showAccountNotLinkedWarning?: boolean }) {
        this.#page = page;
        this.#twitchClient = client;

        options?.gameIds?.forEach((id => {
            this.#gameIds.push(id);
        }));
        this.#dropCampaignPollingInterval = options?.dropCampaignPollingInterval ?? this.#dropCampaignPollingInterval;

        this.#failedStreamBlacklistTimeout = options?.failedStreamBlacklistTimeout ?? this.#failedStreamBlacklistTimeout;
        this.#failedStreamRetryCount = options?.failedStreamRetryCount ?? this.#failedStreamRetryCount;
        this.#hideVideo = options?.hideVideo ?? this.#hideVideo;

        this.#loadTimeoutSeconds = options?.loadTimeoutSeconds ?? this.#loadTimeoutSeconds;
        this.#page.setDefaultTimeout(this.#loadTimeoutSeconds * 1000);

        this.#watchUnlistedGames = options?.watchUnlistedGames ?? this.#watchUnlistedGames;
        this.#showAccountNotLinkedWarning = options?.showAccountNotLinkedWarning ?? this.#showAccountNotLinkedWarning;

        // Set up Twitch Drops Watchdog
        this.#twitchDropsWatchdog = new TwitchDropsWatchdog(this.#twitchClient, this.#dropCampaignPollingInterval);
        this.#twitchDropsWatchdog.on('before_update', () => {
            this.#stopProgressBar();
            logger.info('Updating drop campaigns...');
        });
        this.#twitchDropsWatchdog.on('error', (error) => {
            this.#stopProgressBar()
            logger.error('Error checking twitch drops!');
            logger.error(error);
            this.#startProgressBar()
        })
        this.#twitchDropsWatchdog.on('update', async (campaigns: Campaign[]) => {

            logger.info('Found ' + campaigns.length + ' campaigns.');

            while (this.#pendingDropCampaignIds.length > 0) {
                this.#pendingDropCampaignIds.pop();
            }

            // Add to pending
            campaigns.forEach(campaign => {

                // Ignore drop campaigns that are not either active or upcoming
                const campaignStatus = campaign.status;
                if (campaignStatus !== 'ACTIVE' && campaignStatus !== 'UPCOMING') {
                    return;
                }

                const dropCampaignId = campaign.id;
                this.#dropCampaignMap[dropCampaignId] = campaign;

                if (this.#gameIds.length === 0 || this.#gameIds.includes(campaign.game.id) || this.#watchUnlistedGames) {

                    // Check if this campaign is finished already TODO: Find a reliable way of checking if we finished a campaign
                    /*if (this.#completedCampaignIds.has(dropCampaignId)) {
                        return;
                    }*/

                    // Make sure Twitch account is linked
                    if (!campaign['self']['isAccountConnected']) {
                        if (this.#showAccountNotLinkedWarning) {
                            logger.warn('Twitch account not linked for drop campaign: ' + this.#getDropCampaignFullName(dropCampaignId));
                        }
                        return;
                    }

                    this.#pendingDropCampaignIds.insert(dropCampaignId);
                }
            });
            logger.info('Found ' + this.#pendingDropCampaignIds.length + ' pending campaigns.');

            // Check if we are currently working on a drop campaign
            if (this.#currentDropCampaignId !== null) {

                // Check if there is a higher priority stream we should be watching
                this.#pendingHighPriority = false;
                for (let i = 0; i < this.#pendingDropCampaignIds.length; ++i) {
                    const firstCampaignId = this.#pendingDropCampaignIds[i];

                    if (firstCampaignId === this.#currentDropCampaignId) {
                        break;
                    }

                    // Find the first drop that we haven't claimed yet
                    let firstUnclaimedDrop = null;
                    try {
                        firstUnclaimedDrop = await this.#getFirstUnclaimedDrop(firstCampaignId);
                        if (firstUnclaimedDrop === null) {
                            continue;
                        }
                    } catch (error) {
                        logger.error('Failed to get first unclaimed drop!');
                        logger.debug(error);
                        continue;
                    }

                    // Claim the drop if it is ready to be claimed
                    let inventoryDrop = null;
                    try {
                        inventoryDrop = await this.#twitchClient.getInventoryDrop(firstUnclaimedDrop['id'], firstCampaignId);
                        if (inventoryDrop === null) {
                            continue;
                        }
                    } catch (error) {
                        logger.error('Error getting inventory drop');
                        logger.debug(error);
                    }
                    if (inventoryDrop['self']['currentMinutesWatched'] >= inventoryDrop['requiredMinutesWatched']) {
                        try {
                            await this.#claimDropReward(inventoryDrop);
                        } catch (error) {
                            logger.error('Error claiming drop');
                            logger.debug(error);
                        }
                        continue;
                    }

                    // Make sure there are active streams before switching
                    try {
                        const details = await this.#twitchClient.getDropCampaignDetails(firstCampaignId);
                        if ((await this.#getActiveStreams(firstCampaignId, details)).length > 0) {
                            logger.info('Higher priority campaign found: ' + this.#getDropCampaignFullName(firstCampaignId) + ' id: ' + firstCampaignId + ' time: ' + new Date().getTime());
                            this.#pendingHighPriority = true;
                            break;
                        }
                    } catch (error) {
                        logger.error('Failed to check stream count');
                        logger.debug(error);
                    }

                }
            }

            this.#pendingDropCampaignIdsNotifier.notifyAll();

            this.#startProgressBar();
        });
        this.#twitchDropsWatchdog.start();

        // Set up web socket listener
        this.#webSocketListener.on('viewcount', count => {
            this.#viewerCount = count;
        });
        this.#webSocketListener.on('drop-progress', async data => {

            // Check if we are making progress towards the expected drop. This is not always the case since a game may
            // have multiple drop campaigns, but only one is active at a time. If this happens, then we will just set
            // the current drop to the one we are making progress on.
            const dropId = data['drop_id'];
            if (dropId !== this.#currentDrop?.id) {
                logger.debug('Drop progress message does not match expected drop: ' + this.#currentDrop?.id + ' vs ' + dropId);

                if (!(dropId in this.#currentMinutesWatched)) {
                    this.#currentMinutesWatched[dropId] = data['current_progress_min'];
                    this.#lastMinutesWatched[dropId] = data['current_progress_min'];
                }
            }

            // Check if we are making progress
            this.#currentMinutesWatched[dropId] = data['current_progress_min'];
            if (this.#currentMinutesWatched[dropId] > this.#lastMinutesWatched[dropId]) {
                this.#lastProgressTime[dropId] = new Date().getTime();
                this.#lastMinutesWatched[dropId] = this.#currentMinutesWatched[dropId];

                if (dropId !== this.#currentDrop?.id) {
                    this.#stopProgressBar(true);
                    logger.info('Drop progress does not match expected drop: ' + this.#currentDrop?.id + ' vs ' + dropId);

                    // If we made progress for a different drop, switch to it
                    this.#currentDrop = await this.#twitchClient.getInventoryDrop(dropId);

                    if (!this.#currentDrop) {
                        throw new Error('Made progress towards a drop but did not find it in inventory!');
                    }

                    if (!(this.#currentDrop.id in this.#currentMinutesWatched)) {
                        this.#currentMinutesWatched[this.#currentDrop?.id] = this.#currentDrop?.self.currentMinutesWatched;
                        this.#lastMinutesWatched[this.#currentDrop?.id] = this.#currentDrop?.self.currentMinutesWatched;
                        this.#lastProgressTime[this.#currentDrop.id] = new Date().getTime();
                    }

                    // Restart the progress bar
                    this.#createProgressBar();
                    this.#startProgressBar(data['required_progress_min'], {'viewers': this.#viewerCount, 'uptime': 0, drop_name: this.#getDropName(this.#currentDrop)});
                }
            }
        });
        this.#webSocketListener.on('drop-claim', message => {
            this.#isDropReadyToClaim = true;
        });
        this.#webSocketListener.on('stream-down', message => {
            this.#isStreamDown = true;
        });
    }

    /**
     * Starts the bot.
     */
    async start() {

        // The last time we attempted to make progress towards each drop campaign
        const lastDropCampaignAttemptTimes: { [key: string]: number } = {};

        // Amount of time to wait after failing to make progress towards a drop campaign before trying it again
        const SLEEP_TIME_MS = 1000 * 60 * 5;

        // noinspection InfiniteLoopJS
        while (true) {

            // Get the first pending drop campaign ID
            inner: while (true) {

                logger.debug('Finding next drop campaign...');

                if (this.#pendingDropCampaignIds.length > 0) {

                    // Find the first pending drop campaign that we haven't checked in the past 5 minutes
                    let minLastDropCampaignCheckTime = new Date().getTime();
                    for (const pendingDropCampaignId of this.#pendingDropCampaignIds) {
                        const lastCheckTime = lastDropCampaignAttemptTimes[pendingDropCampaignId];
                        if (lastCheckTime) {
                            minLastDropCampaignCheckTime = Math.min(minLastDropCampaignCheckTime ?? lastCheckTime, lastCheckTime);
                            if (new Date().getTime() - lastCheckTime < SLEEP_TIME_MS) {
                                continue;
                            }
                        }

                        this.#currentDropCampaignId = pendingDropCampaignId;
                        logger.debug('currentDropCampaignId=' + this.#currentDropCampaignId);
                        break inner;
                    }

                    // If no campaigns active/streams online, then set the page to "about:blank"
                    await this.#page.goto("about:blank");

                    // We already checked all pending drop campaigns in the past 5 minutes, lets wait for the oldest one
                    logger.debug('final minlastdropcampaignchecktime: ' + minLastDropCampaignCheckTime + ' time: ' + new Date().getTime());
                    const sleepTime = Math.max(0, SLEEP_TIME_MS - (new Date().getTime() - minLastDropCampaignCheckTime));
                    logger.info('No campaigns active/streams online. Checking again in ' + (sleepTime / 1000 / 60).toFixed(1) + ' min.');
                    setTimeout(() => {
                        logger.debug('notify all!');
                        this.#pendingDropCampaignIdsNotifier.notifyAll();
                    }, sleepTime);

                }

                logger.debug('waiting for waitNotify');
                await this.#pendingDropCampaignIdsNotifier.wait();
                logger.debug('done');
            }

            if (!this.#currentDropCampaignId) {
                continue;  // This should never happen. Its here to make Typescript happy.
            }

            // Attempt to make progress towards the current drop campaign
            logger.info('Processing campaign: ' + this.#getDropCampaignFullName(this.#currentDropCampaignId));
            lastDropCampaignAttemptTimes[this.#currentDropCampaignId] = new Date().getTime();

            // Check if this drop campaign is active
            if (this.#dropCampaignMap[this.#currentDropCampaignId]['status'] !== 'ACTIVE') {
                logger.info('campaign not active');
                this.#currentDropCampaignId = null;
                continue;
            }

            try {
                await this.#processDropCampaign(this.#currentDropCampaignId);
                //completedCampaignIds.add(currentDropCampaignId);
                logger.info('campaign completed');
            } catch (error) {
                if (error instanceof NoStreamsError) {
                    logger.info('No streams!');
                } else if (error instanceof HighPriorityError) {
                    // Ignore
                } else {
                    logger.error(error);
                }
            } finally {
                this.#currentDropCampaignId = null;
            }

        }
    }

    /*stop() {
        // TODO: Implement this
    }*/

    /**
     * Attempt to make progress towards the specified drop campaign.
     * @param dropCampaignId
     * @returns {Promise<void>}
     */
    async #processDropCampaign(dropCampaignId: string) {
        const details = await this.#twitchClient.getDropCampaignDetails(dropCampaignId);

        while (true) {

            const drop = await this.#getFirstUnclaimedDrop(dropCampaignId);
            if (drop === null) {
                logger.debug('no more drops');
                break;
            }
            logger.debug('working on drop ' + drop['id']);

            // Check if this drop is ready to be claimed
            const inventoryDrop = await this.#twitchClient.getInventoryDrop(drop['id'], dropCampaignId);
            if (inventoryDrop != null) {
                if (inventoryDrop['self']['currentMinutesWatched'] >= inventoryDrop['requiredMinutesWatched']) {
                    await this.#claimDropReward(inventoryDrop);
                    continue;
                }
            }

            // A mapping of stream URLs to an integer representing the number of times the stream failed while we were trying to watch it
            const failedStreamUrlCounts: { [key: string]: number } = {};
            const failedStreamUrlExpireTime: { [key: string]: number } = {};

            const failedStreamUrls = new Set();

            while (true) {

                // Get a list of active streams that have drops enabled
                let streams = await this.#getActiveStreams(dropCampaignId, details);
                logger.info('Found ' + streams.length + ' active streams');

                // Remove streams from the blacklist if they have been there long enough
                for (const x of streams) {
                    const streamUrl = x.url;
                    if (failedStreamUrls.has(streamUrl)) {
                        if (new Date().getTime() >= failedStreamUrlExpireTime[streamUrl]) {
                            failedStreamUrls.delete(streamUrl);
                            failedStreamUrlCounts[streamUrl] = 0;
                        }
                    }
                }

                // Filter out streams that failed too many times
                streams = streams.filter(stream => {
                    return !failedStreamUrls.has(stream.url);
                });
                logger.info('Found ' + streams.length + ' good streams');

                for (const x of Object.keys(failedStreamUrlCounts)) {
                    logger.debug('failed: ' + failedStreamUrlCounts[x] + ' ' + x);
                }

                if (streams.length === 0) {
                    throw new NoStreamsError();
                }

                // Watch first stream
                const streamUrl = streams[0]['url'];
                logger.info('Watching stream: ' + streamUrl);
                try {
                    await this.#watchStreamUntilCampaignCompleted(streamUrl, drop);
                } catch (error) {
                    if (error instanceof NoProgressError) {
                        logger.warn(error.message);
                    } else if (error instanceof HighPriorityError) {
                        throw error;
                    } else if (error instanceof StreamLoadFailedError) {
                        logger.warn('Stream failed to load!');
                    } else if (error instanceof StreamDownError) {
                        logger.info('Stream went down');
                        /*
                        If the stream goes down, add it to the failed stream urls immediately so we don't try it again.
                        This is needed because getActiveStreams() can return streams that are down if they went down
                        very recently.
                         */
                        failedStreamUrls.add(streamUrl);
                        // Schedule removal from block list!
                        failedStreamUrlExpireTime[streamUrl] = new Date().getTime() + 1000 * 60 * this.#failedStreamBlacklistTimeout;
                    } else {
                        logger.error(error);
                        if (process.env.SAVE_ERROR_SCREENSHOTS?.toLowerCase() === 'true') {
                            await utils.saveScreenshotAndHtml(this.#page, 'error');
                        }
                    }

                    // Increment failure counter
                    if (!(streamUrl in failedStreamUrlCounts)) {
                        failedStreamUrlCounts[streamUrl] = 0;
                    }
                    failedStreamUrlCounts[streamUrl]++;

                    // Move on if this stream failed too many times
                    if (failedStreamUrlCounts[streamUrl] >= this.#failedStreamRetryCount) {
                        logger.error('Stream failed too many times. Giving up for ' + this.#failedStreamBlacklistTimeout + ' minutes...');
                        failedStreamUrls.add(streamUrl);
                        // Schedule removal from block list!
                        failedStreamUrlExpireTime[streamUrl] = new Date().getTime() + 1000 * 60 * this.#failedStreamBlacklistTimeout;
                    }
                    continue;
                } finally {
                    await this.#webSocketListener.detach();
                }

                break;
            }
        }
    }

    async #claimDropReward(drop: InventoryDrop) {
        logger.info('Claiming drop!');
        await this.#twitchClient.claimDropReward(drop.self.dropInstanceID);
    }

    // If user specified an increased timeout, use it, otherwise use the default 30 seconds
    async #waitUntilElementRendered(page: Page, element: ElementHandle, timeout: number = 1000 * this.#loadTimeoutSeconds) {
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

    #ansiEscape(code: string) {
        return '\x1B[' + code;
    }

    #startProgressBar(t = this.#total, p = this.#payload) {
        this.#isFirstOutput = true;
        this.#total = t;
        this.#payload = p;
        if (this.#progressBar !== null) {
            this.#progressBar.start(t, 0, p);
            this.#hasWrittenNewLine = false;
        }
    }

    #updateProgressBar(c = this.#currentProgress, p = this.#payload) {
        this.#currentProgress = c;
        this.#payload = p;
        if (this.#progressBar !== null) {
            this.#progressBar.update(c, p);
        }
    }

    #stopProgressBar(clear: boolean = false) {
        if (this.#progressBar !== null) {
            this.#progressBar.stop();
            // The progress bar is a bit buggy since im using it for 2 lines but its only
            // intended to be used for 1 line. Also the logger does not play nice with it.
            // This is a workaround to try and avoid overwriting some lines in the terminal.
            // For more reliable logs, just look at the log file instead of the console.
            if (!this.#hasWrittenNewLine) {
                process.stdout.write('\n');
                this.#hasWrittenNewLine = true;
            }

        }
        if (clear) {
            this.#progressBar = null;
            this.#payload = null;
            this.#total = null;
            this.#currentProgress = null;
        }
    }

    #createProgressBar() {
        // Create progress bar
        this.#progressBar = new cliProgress.SingleBar(
            {
                barsize: 20,
                stream: process.stdout,
                format: (options: any, params: any, payload: any) => {
                    let result = 'Watching ' + payload['stream_url'] + ` | Viewers: ${payload['viewers']} | Uptime: ${payload['uptime']}` + this.#ansiEscape('0K') + '\n'
                        + `${payload['drop_name']} ${BarFormat(params.progress, options)} ${params.value} / ${params.total} minutes` + this.#ansiEscape('0K') + '\n';
                    if (this.#isFirstOutput) {
                        return result;
                    }
                    return this.#ansiEscape('2A') + result;
                }
            },
            cliProgress.Presets.shades_classic
        );
        this.#progressBar.on('redraw-post', () => {
            this.#isFirstOutput = false;
        });
    }

    async #watchStreamUntilCampaignCompleted(streamUrl: string, targetDrop: Drop) {
        this.#targetDrop = targetDrop;
        this.#currentDrop = targetDrop;
        logger.debug('target: ' + targetDrop['id']);

        // Reset variables
        this.#viewerCount = 0;
        this.#currentMinutesWatched = {};
        this.#currentMinutesWatched[targetDrop['id']] = 0;
        this.#lastMinutesWatched = {};
        this.#lastMinutesWatched[targetDrop['id']] = -1;
        this.#lastProgressTime = {};
        this.#lastProgressTime[targetDrop['id']] = new Date().getTime();
        this.#isDropReadyToClaim = false;
        this.#isStreamDown = false;

        // Get initial drop progress
        const inventoryDrop = await this.#twitchClient.getInventoryDrop(targetDrop.id);
        if (inventoryDrop) {
            this.#currentMinutesWatched[targetDrop['id']] = inventoryDrop['self']['currentMinutesWatched'];
            this.#lastMinutesWatched[targetDrop['id']] = this.#currentMinutesWatched[targetDrop['id']];
            logger.debug('Initial drop progress: ' + this.#currentMinutesWatched[targetDrop['id']] + ' minutes');
        } else {
            logger.debug('Initial drop progress: none');
        }

        // Create a "Chrome Devtools Protocol" session to listen to websocket events
        await this.#webSocketListener.attach(this.#page)

        await this.#page.goto(streamUrl);

        // Wait for the page to load completely (hopefully). This checks the video player container for any DOM changes and waits until there haven't been any changes for a few seconds.
        logger.info('Waiting for page to load...');
        const element = (await this.#page.$x('//div[@data-a-player-state]'))[0]
        await this.#waitUntilElementRendered(this.#page, element);

        const streamPage = new StreamPage(this.#page);
        try {
            await streamPage.waitForLoad();
        } catch (error) {
            if (error instanceof TimeoutError) {
                throw new StreamLoadFailedError();
            }
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
        if (this.#hideVideo) {
            try {
                await streamPage.hideVideoElements();
                logger.info('Set stream visibility to hidden');
            } catch (error) {
                logger.error('Failed to set stream visibility to hidden!');
                throw error;
            }
        }

        const requiredMinutesWatched = targetDrop['requiredMinutesWatched'];

        this.#createProgressBar();
        this.#viewerCount = await streamPage.getViewersCount();
        this.#startProgressBar(requiredMinutesWatched, {'viewers': this.#viewerCount, 'uptime': await streamPage.getUptime(), drop_name: this.#getDropName(targetDrop), stream_url: streamUrl});

        // The maximum amount of time to allow no progress
        const maxNoProgressTime = 1000 * 60 * 5;

        while (true) {

            if (this.#isStreamDown) {
                this.#isStreamDown = false;
                this.#stopProgressBar(true);
                await this.#page.goto("about:blank");
                throw new StreamDownError('Stream went down!');
            }

            this.#updateProgressBar(this.#currentMinutesWatched[this.#currentDrop['id']], {'viewers': this.#viewerCount, 'uptime': await streamPage.getUptime(), drop_name: this.#getDropName(this.#currentDrop), stream_url: streamUrl});

            // Check if there are community points that we can claim
            const claimCommunityPointsSelector = 'div[data-test-selector="community-points-summary"] div.GTGMR button';
            const claimCommunityPointsButton = await this.#page.$(claimCommunityPointsSelector);
            if (claimCommunityPointsButton) {
                try {
                    await utils.click(this.#page, 'div[data-test-selector="community-points-summary"] div.GTGMR button');
                    logger.debug('Claimed community points!');
                } catch (error) {
                    logger.error('Failed to claim community points!');
                    logger.error(error);
                }
            }

            // Check if we have made progress towards the current drop
            if (new Date().getTime() - this.#lastProgressTime[this.#currentDrop['id']] >= maxNoProgressTime) {

                // Maybe we haven't got any updates from the web socket, lets check our inventory
                const currentDropId = this.#currentDrop['id'];
                const inventoryDrop = await this.#twitchClient.getInventoryDrop(currentDropId);
                if (inventoryDrop) {
                    this.#currentMinutesWatched[currentDropId] = inventoryDrop['self']['currentMinutesWatched'];
                    if (this.#currentMinutesWatched[currentDropId] > this.#lastMinutesWatched[currentDropId]) {
                        this.#lastProgressTime[currentDropId] = new Date().getTime();
                        this.#lastMinutesWatched[currentDropId] = this.#currentMinutesWatched[currentDropId];
                        logger.debug('No progress from web socket! using inventory progress: ' + this.#currentMinutesWatched[currentDropId] + ' minutes');
                    } else {
                        this.#stopProgressBar(true);
                        await this.#page.goto("about:blank");
                        throw new NoProgressError("No progress was detected in the last " + (maxNoProgressTime / 1000 / 60) + " minutes!");
                    }
                } else {
                    this.#stopProgressBar(true);
                    await this.#page.goto("about:blank");
                    throw new NoProgressError("No progress was detected in the last " + (maxNoProgressTime / 1000 / 60) + " minutes!");
                }

            }

            // Check if there is a higher priority stream we should be watching
            if (this.#pendingHighPriority) {
                this.#pendingHighPriority = false;
                this.#stopProgressBar(true);
                logger.info('Switching to higher priority stream');
                throw new HighPriorityError();
            }

            if (this.#isDropReadyToClaim) {
                this.#isDropReadyToClaim = false;
                this.#stopProgressBar(true);

                const inventoryDrop = await this.#twitchClient.getInventoryDrop(this.#currentDrop['id']);

                // Claim the drop
                await this.#claimDropReward(inventoryDrop);

                // After the reward was claimed set streamUrl to "about:blank".
                await this.#page.goto("about:blank");

                // TODO: dont return, check for more drops

                return;
            }

            await this.#page.waitForTimeout(1000);
        }
    }

    async #getFirstUnclaimedDrop(campaignId: string) {
        // Get all drops for this campaign
        const details = await this.#twitchClient.getDropCampaignDetails(campaignId);

        for (const drop of details['timeBasedDrops']) { // TODO: Not all campaigns have time based drops

            // Check if we already claimed this drop
            if (await this.#isDropClaimed(drop)) {
                continue;
            }

            // Check if this drop has ended
            if (new Date() > new Date(Date.parse(drop['endAt']))) {
                continue;
            }

            // Check if this drop has started
            if (new Date() < new Date(Date.parse(drop['startAt']))) {
                continue;
            }

            return drop;
        }

        return null;
    }

    async #isDropClaimed(drop: Drop) {
        const inventory = await this.#twitchClient.getInventory();

        // Check campaigns in progress
        const dropCampaignsInProgress = inventory['dropCampaignsInProgress'];
        if (dropCampaignsInProgress != null) {
            for (const campaign of dropCampaignsInProgress) {
                for (const d of campaign['timeBasedDrops']) {
                    if (d['id'] === drop['id']) {
                        return d['self']['isClaimed'];
                    }
                }
            }
        }

        // Check claimed drops
        const gameEventDrops = inventory['gameEventDrops'];
        if (gameEventDrops != null) {
            for (const d of gameEventDrops) {
                if (d['id'] === drop['benefitEdges'][0]['benefit']['id']) {
                    // I haven't found a way to confirm that this specific drop was claimed, but if we get to this point it
                    // means one of two things: (1) We haven't made any progress towards the campaign so it does not show up
                    // in the "dropCampaignsInProgress" section. (2) We have already claimed everything from this campaign.
                    // In the first case, the drop won't show up here either so we can just return false. In the second case
                    // I assume that if we received a drop reward of the same type after this campaign started, that it has
                    // been claimed.
                    return Date.parse(d['lastAwardedAt']) > Date.parse(drop['startAt']);
                }
            }
        }

        return false;
    }

    async #getActiveStreams(campaignId: string, details: CampaignDetails) {
        // Get a list of active streams that have drops enabled
        let streams = await this.#twitchClient.getDropEnabledStreams(this.#getDropCampaignById(campaignId)['game']['displayName']);

        // Filter out streams that are not in the allowed channels list, if any
        if (details.allow.isEnabled) {
            const channels = details.allow.channels;
            if (channels != null) {
                const channelIds = new Set();
                for (const channel of channels) {
                    channelIds.add(channel.id);
                }
                streams = streams.filter(stream => {
                    return channelIds.has(stream.broadcaster_id);
                });
            }
        }

        return streams;
    }

    #getDropCampaignFullName(campaignId: string) {
        const campaign = this.#getDropCampaignById(campaignId);
        return campaign['game']['displayName'] + ' ' + campaign['name'];
    }

    #getDropCampaignById(campaignId: string) {
        return this.#dropCampaignMap[campaignId];
    }

    #getDropName(drop: Drop) {
        return drop['benefitEdges'][0]['benefit']['name'];
    }
}
