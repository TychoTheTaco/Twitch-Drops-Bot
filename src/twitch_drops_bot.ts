const SortedArray = require("sorted-array-type");
const WaitNotify = require("wait-notify");
const cliProgress = require("cli-progress");
const {BarFormat} = cliProgress.Format;
const TimeoutError = require("puppeteer").errors.TimeoutError;

import Component from "./components/component";
import DropProgressComponent from "./components/drop_progress";
import CommunityPointsComponent from "./components/community_points";
import WebSocketListener from "./web_socket_listener";
import {TwitchDropsWatchdog} from "./watchdog";
import {StreamPage} from "./pages/stream";
import utils from './utils';
import logger from "./logger";
import {ElementHandle, Page} from "puppeteer";
import {Client, TimeBasedDrop, DropCampaign, Tag, Stream} from "./twitch";
import {NoStreamsError, NoProgressError, HighPriorityError, StreamLoadFailedError, StreamDownError} from "./errors";

type Class<T> = { new(...args: any[]): T };

function getDropName(drop: TimeBasedDrop): string {
    return drop.benefitEdges[0].benefit.name;
}

function ansiEscape(code: string): string {
    return '\x1B[' + code;
}

export class TwitchDropsBot {

    /**
     * A list of game IDs to watch and claim drops for.
     * @private
     */
    readonly #gameIds: string[] = [];

    /**
     * When true, the bot will attempt to watch and claim drops for all games, even if they are not in {@link #gameIds}.
     * The games in {@link #gameIds} still have priority.
     * @private
     */
    readonly #watchUnlistedGames: boolean = false;

    /**
     * A list of game IDs that we should ignore. This is useful when {@link #watchUnlistedGames} is true, but we want to
     * ignore some games.
     * @private
     */
    readonly #ignoredGameIds: string[] = [];

    /**
     * The number of minutes to wait in between refreshing the drop campaign list.
     * @private
     */
    readonly #dropCampaignPollingInterval: number = 15;

    // When a stream fails #failedStreamRetryCount times (it went offline, or other reasons), it gets added to a
    // blacklist so we don't waste our time trying it. It is removed from the blacklist if we switch drop campaigns
    // or after #failedStreamBlacklistTimeout minutes.
    readonly #failedStreamRetryCount: number = 3;
    readonly #failedStreamBlacklistTimeout: number = 30;

    /**
     * The maximum number of seconds to wait for pages to load.
     *
     * When we use page.load(), the default timeout is 30 seconds, increasing this value can help when using low-end
     * devices (such as a Raspberry Pi) or when using a slower network connection.
     * @private
     */
    readonly #loadTimeoutSeconds: number = 30;

    /**
     * When true, this will change the visibility of all video elements to "hidden". This can be used to lower CPU
     * usage on low-end devices.
     * @private
     */
    readonly #hideVideo: boolean = false;

    /**
     * Show a warning if the Twitch account is not linked to the drop campaign.
     * @private
     */
    readonly #showAccountNotLinkedWarning: boolean = true;

    /**
     * When true, the bot will watch streams when there are no Drop Campaigns active, or if there are no streams online
     * for any pending Drop Campaigns. This is useful if you still want to claim community points.
     * @private
     */
    readonly #watchStreamsWhenNoDropCampaignsActive: boolean = false;

    /**
     * A list of broadcasters that the bot should watch when it is idle.
     * @private
     */
    readonly #idleBroadcasters: string[] = [];

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

    #webSocketListener = new WebSocketListener();

    #currentDropCampaignId: string | null = null;

    #dropCampaignMap: { [key: string]: DropCampaign } = {};

    #pendingHighPriority: boolean = false;

    #viewerCount: number = 0;
    #currentMinutesWatched: { [key: string]: number } = {};
    #requiredMinutesWatched: { [key: string]: number } = {};
    #isStreamDown: boolean = false;


    /**
     * The last time we attempted to make progress towards each drop campaign.
     * @private
     */
    readonly #lastDropCampaignAttemptTimes: { [key: string]: number } = {};

    /**
     * The amount of time, in milliseconds, to wait after failing to make progress towards a drop campaign before trying it again
     * @private
     */
    readonly sleepTimeMilliseconds: number = 1000 * 60 * 5;

    constructor(page: Page, client: Client, options?: { gameIds?: string[], failedStreamBlacklistTimeout?: number, failedStreamRetryCount?: number, dropCampaignPollingInterval?: number, loadTimeoutSeconds?: number, hideVideo?: boolean, watchUnlistedGames?: boolean, showAccountNotLinkedWarning?: boolean, ignoredGameIds?: string[] }) {
        this.#page = page;
        this.#twitchClient = client;

        // Intercept logging messages to stop/start the progress bar
        const onBeforeLogMessage = () => {
            this.#stopProgressBar();
        }
        const onAfterLogMessage = () => {
            this.#startProgressBar();
        }
        for (const level of Object.keys(logger.levels)) {
            // @ts-ignore
            const og = logger[level];

            // @ts-ignore
            logger[level] = (args: any) => {
                onBeforeLogMessage();
                const result = og(args);
                onAfterLogMessage();
                return result;
            }
        }

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
        options?.ignoredGameIds?.forEach((id => {
            this.#ignoredGameIds.push(id);
        }));

        // Set up Twitch Drops Watchdog
        this.#twitchDropsWatchdog = new TwitchDropsWatchdog(this.#twitchClient, this.#dropCampaignPollingInterval);
        this.#twitchDropsWatchdog.on('before_update', () => {
            logger.debug('Updating drop campaigns...');
        });
        this.#twitchDropsWatchdog.on('error', (error) => {
            logger.error('Error checking twitch drops!');
            logger.error(error);
        })
        this.#twitchDropsWatchdog.on('update', async (campaigns: DropCampaign[]) => {

            logger.debug('Found ' + campaigns.length + ' campaigns.');

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

                // Ignore some games
                if (this.#ignoredGameIds.includes(campaign.game.id)) {
                    return;
                }

                const dropCampaignId = campaign.id;
                this.#dropCampaignMap[dropCampaignId] = campaign;

                if (this.#gameIds.length === 0 || this.#gameIds.includes(campaign.game.id) || this.#watchUnlistedGames) {

                    // Check if this campaign is finished already TODO: Find a reliable way of checking if we finished a campaign
                    /*if (this.#completedCampaignIds.has(dropCampaignId)) {
                        return;
                    }*/

                    this.#pendingDropCampaignIds.insert(dropCampaignId);
                }
            });
            logger.debug('Found ' + this.#pendingDropCampaignIds.length + ' pending campaigns.');

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
                        inventoryDrop = await this.#twitchClient.getInventoryDrop(firstUnclaimedDrop.id, firstCampaignId);
                    } catch (error) {
                        logger.error('Error getting inventory drop');
                        logger.debug(error);
                        continue;
                    }
                    if (inventoryDrop !== null) {
                        if (inventoryDrop.self.currentMinutesWatched >= inventoryDrop.requiredMinutesWatched) {
                            try {
                                await this.#claimDropReward(inventoryDrop);
                            } catch (error) {
                                logger.error('Error claiming drop');
                                logger.debug(error);
                            }
                            continue;
                        }
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
        });
    }

    /**
     * Get the next pending Drop Campaign ID. Returns null if there are no pending campaigns or all campaigns have
     * already been attempted in the last {@link sleepTimeMilliseconds} milliseconds.
     * @private
     */
    #getNextPendingDropCampaignId(): string | null {
        for (const dropCampaignId of this.#pendingDropCampaignIds) {

            const campaign = this.#dropCampaignMap[dropCampaignId];

            // Check if this drop campaign is active
            if (campaign.status !== 'ACTIVE') {
                continue;
            }

            // Check if we already tried this campaign within the last `sleepTimeMilliseconds` milliseconds
            const lastAttemptTime = this.#lastDropCampaignAttemptTimes[dropCampaignId];
            if (lastAttemptTime) {
                if (new Date().getTime() - lastAttemptTime < this.sleepTimeMilliseconds) {
                    continue;
                }
            }

            return dropCampaignId;
        }
        return null;
    }

    async #getNextIdleStream(): Promise<Stream | null> {
        // Check if any of the idle broadcasters are online

        // Check provided game ID list
        for (const gameId of this.#gameIds) {
            const streams = await this.#twitchClient.getActiveStreams(gameId);
            if (streams.length > 0) {
                return streams[0];
            }
        }

        // Check pending drop campaigns

        return null;
    }

    /**
     * Starts the bot.
     */
    async start() {

        // Start the Drop Campaign watchdog
        this.#twitchDropsWatchdog.start();

        // Wait for the TwitchDropsWatchdog to retrieve a list of Drop Campaigns
        await this.#pendingDropCampaignIdsNotifier.wait();

        // noinspection InfiniteLoopJS
        while (true) {

            // Get the next pending Drop Campaign ID
            this.#currentDropCampaignId = this.#getNextPendingDropCampaignId();

            if (this.#currentDropCampaignId === null) {

                if (this.#watchStreamsWhenNoDropCampaignsActive) {

                    // todo: start new thread to check campaigns every 5 min

                    // Choose a stream to watch
                    let stream = null;
                    try {
                        stream = await this.#getNextIdleStream();
                    } catch (error) {
                        logger.error(error);
                    }
                    if (stream === null) {
                        // todo: panic!
                        continue;
                    }

                    const components: Component[] = [
                        new CommunityPointsComponent()
                    ];

                    // Watch stream
                    try {
                        await this.#watchStreamWrapper(stream.url, components);
                    } catch (error) {
                        logger.error(error);
                        await this.#page.goto("about:blank");
                    }

                } else {

                    // No campaigns active/streams online, then set the page to "about:blank"
                    await this.#page.goto("about:blank");

                    // Determine how long to sleep
                    let minLastDropCampaignCheckTime = new Date().getTime();
                    for (const pendingDropCampaignId of this.#pendingDropCampaignIds) {
                        const lastCheckTime = this.#lastDropCampaignAttemptTimes[pendingDropCampaignId];
                        if (lastCheckTime) {
                            minLastDropCampaignCheckTime = Math.min(minLastDropCampaignCheckTime ?? lastCheckTime, lastCheckTime);
                        }
                    }
                    const sleepTime = Math.max(0, this.sleepTimeMilliseconds - (new Date().getTime() - minLastDropCampaignCheckTime));

                    // Sleep
                    logger.info('No campaigns active/streams online. Checking again in ' + (sleepTime / 1000 / 60).toFixed(1) + ' min.');
                    setTimeout(() => {
                        logger.debug('notify all!');
                        this.#pendingDropCampaignIdsNotifier.notifyAll();
                    }, sleepTime);
                    logger.debug('waiting for waitNotify');
                    await this.#pendingDropCampaignIdsNotifier.wait();
                    logger.debug('done');
                }

            } else {
                try {
                    await this.#processDropCampaign(this.#currentDropCampaignId);
                    //completedCampaignIds.add(currentDropCampaignId);
                    //logger.info('campaign completed');
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

        // Attempt to make progress towards the current drop campaign
        logger.info('Processing campaign: ' + this.#getDropCampaignFullName(dropCampaignId));
        this.#lastDropCampaignAttemptTimes[dropCampaignId] = new Date().getTime();

        const campaign = this.#dropCampaignMap[dropCampaignId];

        // Warn the user if the Twitch account is not linked. Users can still earn progress and claim
        // rewards from campaigns that are not linked to their Twitch account (they will still show up
        // in the twitch inventory), but they will not show up in-game until their account is linked.
        if (!campaign.self.isAccountConnected) {
            if (this.#showAccountNotLinkedWarning) {
                logger.warn('Twitch account not linked for this campaign!');
            }
        }

        const details = await this.#twitchClient.getDropCampaignDetails(dropCampaignId);

        while (true) {

            const drop = await this.#getFirstUnclaimedDrop(dropCampaignId);
            if (drop === null) {
                logger.info('no active drops');
                break;
            }
            logger.debug('working on drop ' + drop.id);

            // Check if this drop is ready to be claimed
            const inventoryDrop = await this.#twitchClient.getInventoryDrop(drop.id, dropCampaignId);
            if (inventoryDrop != null) {
                if (inventoryDrop.self.currentMinutesWatched >= inventoryDrop['requiredMinutesWatched']) {
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

                if (streams.length === 0) {
                    throw new NoStreamsError();
                }

                const dropProgressComponent = new DropProgressComponent(drop);
                dropProgressComponent.on('drop-claimed', drop => {
                    this.#onDropRewardClaimed(drop);
                });
                dropProgressComponent.on('drop-data-changed', () => {
                    this.#total = dropProgressComponent.requiredMinutesWatched;
                    this.#progressBar.setTotal(this.#total);
                });

                const components: Component[] = [
                    dropProgressComponent,
                    new CommunityPointsComponent()
                ]

                // Watch first stream
                const streamUrl = streams[0]['url'];
                logger.info('Watching stream: ' + streamUrl);
                try {
                    await this.#watchStreamWrapper(streamUrl, components);
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

    #onDropRewardClaimed(drop: TimeBasedDrop) {
        logger.info(ansiEscape("32m") + "Claimed drop: " + getDropName(drop) + ansiEscape("39m"));
    }

    async #claimDropReward(drop: TimeBasedDrop) {
        await this.#twitchClient.claimDropReward(drop.self.dropInstanceID);
        this.#onDropRewardClaimed(drop);
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

    #startProgressBar(t = this.#total, p = this.#payload) {
        this.#isFirstOutput = true;
        this.#total = t;
        this.#payload = p;
        if (this.#progressBar !== null) {
            process.stdout.write("\n\n" + ansiEscape("2A"));
            this.#progressBar.start(t, this.#currentProgress, p);
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
            process.stdout.write(ansiEscape("1B") + ansiEscape("2K") + ansiEscape("1A"));
        }
        if (clear) {
            this.#progressBar = null;
            this.#payload = null;
            this.#total = null;
            this.#currentProgress = null;
        }
    }

    #progressBarHeight: number = 2;

    async #watchStreamWrapper(streamUrl: string, components: Component[]) {
        const startWatchTime = new Date().getTime();
        try {
            await this.#watchStream(streamUrl, components);
        } catch (error) {
            throw error;
        } finally {
            logger.info(ansiEscape("36m") + "Watched stream for " + Math.floor((new Date().getTime() - startWatchTime) / 1000 / 60) + " minutes" + ansiEscape("39m"));
        }
    }

    async #watchStream(streamUrl: string, components: Component[]) {

        // Create a "Chrome Devtools Protocol" session to listen to websocket events
        this.#webSocketListener = new WebSocketListener();
        await this.#webSocketListener.attach(this.#page)

        // Set up web socket listener
        this.#webSocketListener.on('viewcount', count => {
            this.#viewerCount = count;
        });
        this.#webSocketListener.on('stream-down', message => {
            this.#isStreamDown = true;
        });

        // call onstart
        for (const component of components) {
            await component.onStart(this.#twitchClient, this.#webSocketListener);
        }

        // Go to the stream URL
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
        if (this.#hideVideo) {
            try {
                await streamPage.hideVideoElements();
                logger.info('Set stream visibility to hidden');
            } catch (error) {
                logger.error('Failed to set stream visibility to hidden!');
                throw error;
            }
        }

        this.#progressBarHeight = 1;
        for (const component of components) {
            if (component instanceof DropProgressComponent) {
                this.#progressBarHeight = 2;
                break
            }
        }

        const getComponent = <T extends Component>(c: Class<T>): T | null => {
            for (const component of components) {
                if (component instanceof c) {
                    return component;
                }
            }
            return null;
        }

        // Create progress bar
        this.#progressBar = new cliProgress.SingleBar(
            {
                barsize: 20,
                clearOnComplete: true,
                stream: process.stdout,
                format: (options: any, params: any, payload: any) => {
                    let result = 'Watching ' + payload['stream_url'] + ` | Viewers: ${payload['viewers']} | Uptime: ${payload['uptime']}` + ansiEscape('0K') + '\n';

                    for (const component of components) {
                        if (component instanceof DropProgressComponent) {
                            result += `${payload['drop_name']} ${BarFormat(params.progress, options)} ${params.value} / ${params.total} minutes` + ansiEscape('0K') + '\n';
                            break
                        }
                    }

                    if (this.#isFirstOutput) {
                        return result;
                    }

                    return ansiEscape(`${this.#progressBarHeight}A`) + result;
                }
            },
            cliProgress.Presets.shades_classic
        );
        this.#progressBar.on('redraw-post', () => {
            this.#isFirstOutput = false;
        });

        this.#viewerCount = await streamPage.getViewersCount();
        const dropProgressComponent = getComponent(DropProgressComponent);
        if (dropProgressComponent !== null) {
            // @ts-ignore
            this.#startProgressBar(dropProgressComponent.requiredMinutesWatched, {
                'viewers': this.#viewerCount,
                'uptime': await streamPage.getUptime(),
                // @ts-ignore
                drop_name: getDropName(dropProgressComponent.currentDrop),
                stream_url: streamUrl
            });
        } else {
            this.#startProgressBar(100, {'viewers': this.#viewerCount, 'uptime': await streamPage.getUptime(), stream_url: streamUrl});
        }

        try {
            // Main loop
            while (true) {

                if (this.#isStreamDown) {
                    this.#isStreamDown = false;
                    this.#stopProgressBar(true);
                    await this.#page.goto("about:blank");
                    throw new StreamDownError('Stream went down!');
                }

                // Check if there is a higher priority stream we should be watching
                if (this.#pendingHighPriority) {
                    this.#pendingHighPriority = false;
                    this.#stopProgressBar(true);
                    logger.info('Switching to higher priority stream');
                    throw new HighPriorityError();
                }

                for (const component of components) {
                    if (await component.onUpdate(this.#page, this.#twitchClient)) {
                        return;
                    }
                }

                if (dropProgressComponent !== null) {
                    // @ts-ignore
                    this.#updateProgressBar(dropProgressComponent.currentMinutesWatched, {
                        'viewers': this.#viewerCount,
                        'uptime': await streamPage.getUptime(),
                        // @ts-ignore
                        drop_name: getDropName(dropProgressComponent.currentDrop),
                        stream_url: streamUrl
                    });
                } else {
                    this.#updateProgressBar(0, {
                        'viewers': this.#viewerCount,
                        'uptime': await streamPage.getUptime(),
                        stream_url: streamUrl
                    });
                }

                await this.#page.waitForTimeout(1000);
            }
        } catch (error) {
            throw error;
        } finally {
            logger.debug('stopped bar');
            this.#stopProgressBar(true);
        }
    }

    /*async #watchStreamUntilCampaignCompleted(streamUrl: string, targetDrop: TimeBasedDrop) {
        this.#targetDrop = targetDrop;
        this.#currentDrop = targetDrop;
        logger.debug('target: ' + targetDrop.id);

        // Reset variables
        this.#viewerCount = 0;
        this.#currentMinutesWatched = {};
        this.#currentMinutesWatched[targetDrop.id] = 0;
        this.#lastMinutesWatched = {};
        this.#lastMinutesWatched[targetDrop.id] = -1;
        this.#lastProgressTime = {};
        this.#lastProgressTime[targetDrop.id] = new Date().getTime();
        this.#isDropReadyToClaim = false;
        this.#isStreamDown = false;

        // Get initial drop progress
        const inventoryDrop = await this.#twitchClient.getInventoryDrop(targetDrop.id);
        if (inventoryDrop) {
            this.#currentMinutesWatched[targetDrop.id] = inventoryDrop.self.currentMinutesWatched;
            this.#lastMinutesWatched[targetDrop.id] = this.#currentMinutesWatched[targetDrop.id];
            logger.debug('Initial drop progress: ' + this.#currentMinutesWatched[targetDrop.id] + ' minutes');
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

        const requiredMinutesWatched = targetDrop.requiredMinutesWatched;

        this.#createProgressBar();
        this.#viewerCount = await streamPage.getViewersCount();
        this.#startProgressBar(requiredMinutesWatched, {'viewers': this.#viewerCount, 'uptime': await streamPage.getUptime(), drop_name: TwitchDropsBot.#getDropName(targetDrop), stream_url: streamUrl});

        // The maximum amount of time to allow no progress
        const maxNoProgressTime = 1000 * 60 * 5;

        while (true) {

            if (this.#isStreamDown) {
                this.#isStreamDown = false;
                this.#stopProgressBar(true);
                await this.#page.goto("about:blank");
                throw new StreamDownError('Stream went down!');
            }

            this.#updateProgressBar(this.#currentMinutesWatched[this.#currentDrop['id']], {
                'viewers': this.#viewerCount,
                'uptime': await streamPage.getUptime(),
                drop_name: TwitchDropsBot.#getDropName(this.#currentDrop),
                stream_url: streamUrl
            });

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
                    this.#currentMinutesWatched[currentDropId] = inventoryDrop.self.currentMinutesWatched;
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

                const inventoryDrop = await this.#twitchClient.getInventoryDrop(this.#currentDrop.id);

                if (inventoryDrop === null) {
                    return;  // This should never happen
                }

                // Claim the drop
                await this.#claimDropReward(inventoryDrop);

                // After the reward was claimed set streamUrl to "about:blank".
                await this.#page.goto("about:blank");

                // TODO: dont return, check for more drops

                return;
            }

            await this.#page.waitForTimeout(1000);
        }
    }*/

    async #getFirstUnclaimedDrop(campaignId: string): Promise<TimeBasedDrop | null> {
        // Get all drops for this campaign
        const details = await this.#twitchClient.getDropCampaignDetails(campaignId);

        for (const drop of details.timeBasedDrops) { // TODO: Not all campaigns have time based drops

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

    async #isDropClaimed(drop: TimeBasedDrop) {
        const inventory = await this.#twitchClient.getInventory();

        // Check campaigns in progress
        const dropCampaignsInProgress = inventory.dropCampaignsInProgress;
        if (dropCampaignsInProgress != null) {
            for (const campaign of dropCampaignsInProgress) {
                for (const d of campaign.timeBasedDrops) {
                    if (d.id === drop.id) {
                        return d.self.isClaimed;
                    }
                }
            }
        }

        // Check claimed drops
        const gameEventDrops = inventory.gameEventDrops;
        if (gameEventDrops != null) {
            for (const d of gameEventDrops) {
                if (d.id === drop.benefitEdges[0].benefit.id) {
                    // I haven't found a way to confirm that this specific drop was claimed, but if we get to this point it
                    // means one of two things: (1) We haven't made any progress towards the campaign so it does not show up
                    // in the "dropCampaignsInProgress" section. (2) We have already claimed everything from this campaign.
                    // In the first case, the drop won't show up here either so we can just return false. In the second case
                    // I assume that if we received a drop reward of the same type after this campaign started, that it has
                    // been claimed.
                    return Date.parse(d.lastAwardedAt) > Date.parse(drop.startAt);
                }
            }
        }

        return false;
    }

    async #getActiveStreams(campaignId: string, details: DropCampaign) {
        // Get a list of active streams that have drops enabled
        let streams = await this.#twitchClient.getActiveStreams(this.#getDropCampaignById(campaignId).game.displayName, {tags: [Tag.DROPS_ENABLED]});

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
}
