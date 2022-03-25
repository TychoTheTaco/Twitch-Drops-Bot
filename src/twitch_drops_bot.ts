const SortedArray = require("sorted-array-type");
const WaitNotify = require("wait-notify");
const cliProgress = require("cli-progress");
const {BarFormat} = cliProgress.Format;
const TimeoutError = require("puppeteer").errors.TimeoutError;
import {ElementHandle, Page} from "puppeteer";
import {detailedDiff} from "deep-object-diff";

import Component from "./components/component";
import DropProgressComponent from "./components/drop_progress";
import CommunityPointsComponent from "./components/community_points";
import WebSocketListener from "./web_socket_listener";
import {TwitchDropsWatchdog} from "./watchdog";
import {StreamPage} from "./pages/stream";
import utils, {TimedSet} from './utils';
import logger from "./logger";
import {Client, TimeBasedDrop, DropCampaign, StreamTag, getInventoryDrop, Tag, Inventory, isDropCompleted} from "./twitch";
import {NoStreamsError, NoProgressError, HighPriorityError, StreamLoadFailedError, StreamDownError} from "./errors";

type Class<T> = { new(...args: any[]): T };

/**
 * Check if a Drop is ready to claim.
 * @param drop
 */
function isDropReadyToClaim(drop: TimeBasedDrop): boolean {
    if (!drop.self.isClaimed) {
        return drop.self.currentMinutesWatched >= drop.requiredMinutesWatched;
    }
    return false;
}

export function getDropName(drop: TimeBasedDrop): string {
    let dropName = "";
    for (let i = 0; i < drop.benefitEdges.length; ++i) {
        if (i > 0) {
            dropName += ", ";
        }
        dropName += drop.benefitEdges[i].benefit.name;
    }
    return dropName;
}

function ansiEscape(code: string): string {
    return '\x1B[' + code;
}

function hasDropsEnabledTag(tags: Tag[]): boolean {
    for (const tag of tags) {
        if (tag.id === StreamTag.DROPS_ENABLED) {
            return true;
        }
    }
    return false;
}

function createStreamUrl(broadcasterId: string): string {
    return "https://www.twitch.tv/" + broadcasterId;
}

function getBroadcasterIdFromUrl(streamUrl: string): string {
    return streamUrl.split("twitch.tv/")[1];
}

export interface TwitchDropsBotOptions {
    gameIds?: string[],
    watchUnlistedGames?: boolean,
    ignoredGameIds?: string[],
    dropCampaignPollingInterval?: number,
    failedStreamRetryCount?: number,
    failedStreamBlacklistTimeout?: number,
    loadTimeoutSeconds?: number,
    hideVideo?: boolean,
    showAccountNotLinkedWarning?: boolean,
    attemptImpossibleDropCampaigns?: boolean,
    watchStreamsWhenNoDropCampaignsActive?: boolean,
    broadcasterIds?: string[]
}

export class TwitchDropsBot {

    /**
     * A list of game IDs to watch and claim drops for. This list is in order of priority.
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

    /**
     * The maximum number of times that a stream can fail when we are trying to watch it. If it fails more times, it
     * will get added to a temporary blacklist.
     * @private
     */
    readonly #failedStreamRetryCount: number = 3;

    /**
     * The number of minutes that failed streams should remain in the temporary blacklist.
     * @private
     */
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
    readonly #hideVideoElements: boolean = false;

    /**
     * Show a warning if the Twitch account is not linked to the drop campaign.
     * @private
     */
    readonly #showAccountNotLinkedWarning: boolean = true;

    /**
     * When true, the bot will make progress towards Drop Campaigns even if the campaign is expected to end before
     * we can finish watching to claim the Drop. For example: A Drop Campaign will end in 30 minutes. We have watched
     * 15 / 60 minutes for one of the Drops. Normally, we will not be able to finish and claim the Drop so there is no
     * point in trying. However, sometimes Drop Campaigns get extended which means we would have had enough time.
     * @private
     */
    readonly #attemptImpossibleDropCampaigns: boolean = true;

    /**
     * When true, the bot will watch streams when there are no Drop Campaigns active, or if there are no streams online
     * for any pending Drop Campaigns. This is useful if you still want to claim community points.
     * @private
     */
    readonly #watchStreamsWhenNoDropCampaignsActive: boolean = false;

    /**
     * A list of broadcasters that the bot should watch when it is idle. This list is in order of priority.
     * @private
     */
    readonly #broadcasterIds: string[] = [];

    // Twitch API client to use.
    readonly #twitchClient: Client;

    readonly #page: Page;

    #twitchDropsWatchdog: TwitchDropsWatchdog;

    /**
     * A priority queue of Drop Campaign IDs that the bot is trying to make progress towards. Drop Campaigns are
     * prioritized based on the order of the games specified in {@link #gameIds}. If there are multiple Drop Campaigns
     * active for the same game, the Drop Campaign that ends first will be given priority.
     * @private
     */
    readonly #pendingDropCampaignIds = new SortedArray((a: string, b: string) => {

        if (a === b) {
            return 0;
        }

        const campaignA = this.#getDropCampaignById(a);
        const campaignB = this.#getDropCampaignById(b);

        // Sort campaigns based on order of game IDs specified in config
        const indexA = this.#gameIds.indexOf(campaignA.game.id);
        const indexB = this.#gameIds.indexOf(campaignB.game.id);
        if (indexA === -1 && indexB !== -1) {
            return 1;
        } else if (indexA !== -1 && indexB === -1) {
            return -1;
        } else if (indexA === indexB) {  // Both games have the same priority. Give priority to the one that ends first.
            const endTimeA = Date.parse(campaignA.endAt);
            const endTimeB = Date.parse(campaignB.endAt);
            if (endTimeA === endTimeB) {
                return a < b ? -1 : 1;
            }
            return endTimeA < endTimeB ? -1 : 1;
        }
        return Math.sign(indexA - indexB);
    });
    #pendingDropCampaignIdsNotifier = new WaitNotify();

    /**
     * A mapping of Drop Campaign IDs to Drop Campaigns. This "database" stores the latest information on each Drop Campaign.
     * @private
     */
    readonly #dropCampaignMap: { [key: string]: DropCampaign } = {};

    #progressBar: any = null;
    #payload: any = null;
    #isFirstOutput: boolean = true;

    #currentDropCampaignId: string | null = null;

    #pendingHighPriority: boolean = false;

    #viewerCount: number = 0;
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

    /**
     * A mapping of stream URLs to an integer representing the number of times the stream failed while we were trying to watch it.
     * If this number reaches {@link #failedStreamRetryCount}, then the stream is added to a temporary blacklist.
     * @private
     */
    readonly #failedStreamUrlCounts: { [key: string]: number } = {};

    // TODO: make a separate permanent blacklist?
    /**
     * Streams that failed too many times (determined by {@link #failedStreamRetryCount}) are temporarily added to this
     * blacklist and automatically removed after {@link #failedStreamBlacklistTimeout} minutes.
     * @private
     */
    readonly #streamUrlTemporaryBlacklist: TimedSet<string>;

    /**
     * A list of Drop Campaign IDs for Drop Campaigns that we have already completed. This may contain IDs for Drop
     * Campaigns that we completed in the past, not just the Drop Campaigns that we completed in this session.
     * @private
     */
    readonly #completedDropCampaignIds: string[] = [];

    /**
     * A list of Drop IDs for Drops that we have completed. A Drop is considered completed if we have claimed it or if
     * it has expired. This may contain IDs for Drops that we have completed in the past, not just the Drops that we
     * claimed in this session.
     * @private
     */
    readonly #completedDropIds: Set<string> = new Set<string>();

    constructor(page: Page, client: Client, options?: TwitchDropsBotOptions) {
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
        this.#hideVideoElements = options?.hideVideo ?? this.#hideVideoElements;

        this.#loadTimeoutSeconds = options?.loadTimeoutSeconds ?? this.#loadTimeoutSeconds;
        this.#page.setDefaultTimeout(this.#loadTimeoutSeconds * 1000);

        this.#watchUnlistedGames = options?.watchUnlistedGames ?? this.#watchUnlistedGames;
        this.#showAccountNotLinkedWarning = options?.showAccountNotLinkedWarning ?? this.#showAccountNotLinkedWarning;
        options?.ignoredGameIds?.forEach((id => {
            this.#ignoredGameIds.push(id);
        }));
        this.#attemptImpossibleDropCampaigns = options?.attemptImpossibleDropCampaigns ?? this.#attemptImpossibleDropCampaigns;
        options?.broadcasterIds?.forEach((id => {
            this.#broadcasterIds.push(id);
        }));
        this.#watchStreamsWhenNoDropCampaignsActive = options?.watchStreamsWhenNoDropCampaignsActive ?? this.#watchStreamsWhenNoDropCampaignsActive;
        this.#streamUrlTemporaryBlacklist = new TimedSet<string>(1000 * 60 * this.#failedStreamBlacklistTimeout);

        // Set up Twitch Drops Watchdog
        this.#twitchDropsWatchdog = new TwitchDropsWatchdog(this.#twitchClient, this.#dropCampaignPollingInterval);
        this.#twitchDropsWatchdog.on('before_update', () => {
            logger.debug('Updating drop campaigns...');
        });
        this.#twitchDropsWatchdog.on('error', (error) => {
            logger.debug("Error checking twitch drops: " + error);
        })
        this.#twitchDropsWatchdog.on('update', async (campaigns: DropCampaign[]) => {

            logger.debug('Found ' + campaigns.length + ' campaigns.');

            // Claim any Drops that are ready to be claimed
            const inventory = await this.#twitchClient.getInventory();  //todo: track inventory changes?
            const dropCampaignsInProgress = inventory.dropCampaignsInProgress;
            if (dropCampaignsInProgress != null) {
                for (const campaign of dropCampaignsInProgress) {
                    //todo: consider event based drops!
                    for (const drop of campaign.timeBasedDrops) {
                        if (isDropReadyToClaim(drop)) {
                            await this.#claimDropReward(drop);
                        }
                    }
                }
            }

            while (this.#pendingDropCampaignIds.length > 0) {
                this.#pendingDropCampaignIds.pop();
            }

            // Add pending Drop campaigns
            for (const campaign of campaigns) {

                // Add Drop campaign to database (updating it if it already existed)
                const dropCampaignId = campaign.id;
                if (dropCampaignId in this.#dropCampaignMap) {
                    // Check if the campaign data changed
                    const oldCampaign = this.#dropCampaignMap[dropCampaignId];
                    const difference: any = detailedDiff(oldCampaign, campaign);
                    const added = difference["added"];
                    const deleted = difference["deleted"];
                    const updated = difference["updated"];
                    if (Object.keys(added).length > 0 || Object.keys(deleted).length > 0 || Object.keys(updated).length > 0) {
                        while (true) {

                            // Check if status changed
                            const updatedStatus = updated["status"];
                            if (updatedStatus) {
                                logger.debug("status changed: " + campaign.id + " from " + oldCampaign.status + " to " + updatedStatus);

                                // Check if this was the only thing that changed
                                if (Object.keys(added).length == 0 && Object.keys(deleted).length == 0 && Object.keys(updated).length == 1) {
                                    break;
                                }
                            }

                            logger.debug("Campaign data changed: " + JSON.stringify(oldCampaign, null, 4));
                            logger.debug("Campaign data changed: " + JSON.stringify(difference, null, 4));
                            //todo: check if the drops changed. this is from getcampaigndetails?
                            break;
                        }
                    }
                }
                this.#dropCampaignMap[dropCampaignId] = campaign;

                // Add Drops campaigns to the pending campaign queue
                if (this.#gameIds.length === 0 || this.#gameIds.includes(campaign.game.id) || this.#watchUnlistedGames) {

                    // Ignore campaigns that are not either active or upcoming
                    const campaignStatus = campaign.status;
                    if (campaignStatus !== 'ACTIVE' && campaignStatus !== 'UPCOMING') {
                        continue;
                    }

                    // Ignore campaigns for games that are on the ignored games list
                    if (this.#ignoredGameIds.includes(campaign.game.id)) {
                        continue;
                    }

                    // Ignore campaigns that we already completed
                    if (this.#completedDropCampaignIds.includes(dropCampaignId)) {
                        logger.debug("ignoring completed campaign: " + dropCampaignId);
                        continue;
                    }

                    // Check if we already completed this campaign
                    const dropCampaignDetails = await this.#twitchClient.getDropCampaignDetails(dropCampaignId);
                    if (this.#isCampaignCompleted(dropCampaignDetails, inventory)) {
                        logger.info("campaign already completed: " + this.#getDropCampaignFullName(dropCampaignId));
                        this.#completedDropCampaignIds.push(dropCampaignId);
                        continue;
                    }

                    // We haven't finished this campaign yet, add it to the pending campaigns queue
                    this.#pendingDropCampaignIds.insert(dropCampaignId);
                }
            }
            logger.debug('Found ' + this.#pendingDropCampaignIds.length + ' pending campaigns.');

            // Check if we are currently working on a drop campaign
            if (this.#currentDropCampaignId !== null) {

                // Check if there is a higher priority stream we should be watching
                if (await this.#hasPendingHigherPriorityStream()) {
                    this.#pendingHighPriority = true;
                }
            }

            this.#pendingDropCampaignIdsNotifier.notifyAll();
        });
    }

    #isCampaignCompleted(dropCampaignDetails: DropCampaign, inventory: Inventory): boolean {
        const timeBasedDrops = dropCampaignDetails.timeBasedDrops;
        if (timeBasedDrops != null) {
            for (const drop of timeBasedDrops) {

                // Check if the Drop is in the competed set
                if (this.#completedDropIds.has(drop.id)) {
                    continue;
                }

                // Check if the Drop is completed
                if (isDropCompleted(drop, inventory)) {
                    if (!this.#completedDropIds.has(drop.id)) {
                        this.#completedDropIds.add(drop.id);
                        logger.debug('discovered completed drop: ' + drop.id);
                    }
                } else {
                    return false;
                }
            }
        }
        // TODO: consider event based drops
        return true;
    }

    /**
     * Get the first unclaimed {@link TimeBasedDrop} from the specified {@link DropCampaign}.
     * @param campaignId
     * @param dropCampaignDetails
     * @param inventory
     */
    #getFirstUnclaimedDrop(campaignId: string, dropCampaignDetails: DropCampaign, inventory: Inventory): TimeBasedDrop | null {
        // TODO: Not all campaigns have time based drops
        for (const drop of dropCampaignDetails.timeBasedDrops) {

            // Check if we already completed this Drop
            if (this.#completedDropIds.has(drop.id)) {
                continue;
            }

            // Check if this drop has ended
            if (new Date() > new Date(Date.parse(drop.endAt))) {
                continue;
            }

            // Check if this drop has started
            if (new Date() < new Date(Date.parse(drop.startAt))) {
                continue;
            }

            return drop;
        }

        return null;
    }

    /**
     * Check if there is a higher priority stream that we should be watching.
     * @private
     */
    async #hasPendingHigherPriorityStream(): Promise<boolean> {
        for (const dropCampaignId of this.#pendingDropCampaignIds) {

            const campaign = this.#dropCampaignMap[dropCampaignId];

            // Check if we are currently watching this campaign
            if (dropCampaignId === this.#currentDropCampaignId) {
                break;
            }

            // Check if we already tried this campaign within the last `sleepTimeMilliseconds` milliseconds
            const lastAttemptTime = this.#lastDropCampaignAttemptTimes[dropCampaignId];
            if (lastAttemptTime) {
                if (new Date().getTime() - lastAttemptTime < this.sleepTimeMilliseconds) {
                    continue;
                }
            }

            // Check if this drop campaign is active
            if (campaign.status !== 'ACTIVE') {
                continue;
            }

            let inventory = null;
            try {
                inventory = await this.#twitchClient.getInventory();
            } catch (error) {
                logger.debug("Failed to get inventory: " + error);
                continue;
            }

            let details = null;
            try {
                details = await this.#twitchClient.getDropCampaignDetails(dropCampaignId);
            } catch (error) {
                logger.debug("Failed to get campaign details: " + error);
                continue;
            }

            // Find the first drop that we haven't claimed yet
            const firstUnclaimedDrop = this.#getFirstUnclaimedDrop(dropCampaignId, details, inventory);
            if (firstUnclaimedDrop === null) {
                continue;
            }

            // Claim the drop if it is ready to be claimed
            const inventoryDrop = getInventoryDrop(firstUnclaimedDrop.id, inventory, dropCampaignId);
            if (inventoryDrop !== null) {
                if (isDropReadyToClaim(inventoryDrop)) {
                    try {
                        await this.#claimDropReward(inventoryDrop);
                    } catch (error) {
                        logger.error('Error claiming drop');
                        logger.debug(error);
                    }
                    continue;
                }
            }

            // Check if there are active streams
            try {
                const streams = await this.#getActiveStreams(dropCampaignId, details);  //todo: check good streams
                if (streams.length === 0) {
                    continue;
                }

                // Check if the first active stream has Drops available. If it doesn't, then we most likely completed
                // this campaign already, so we shouldn't start watching the stream.
                if (!(await this.#hasDropsAvailable(streams[0].url, dropCampaignId))) {
                    continue;
                }

            } catch (error) {
                logger.debug("Failed to check stream count: " + error);
            }

            logger.info('Higher priority campaign found: ' + this.#getDropCampaignFullName(dropCampaignId) + ' id: ' + dropCampaignId);
            return true;
        }

        return false;
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

    async #getNextPreferredBroadcasterStreamUrl(): Promise<string | null> {
        // Check if any of the preferred broadcasters are online
        for (const broadcasterId of this.#broadcasterIds) {
            if (await this.#twitchClient.isStreamOnline(broadcasterId)) {
                const streamUrl = createStreamUrl(broadcasterId);
                if (this.#streamUrlTemporaryBlacklist.has(streamUrl)) {
                    continue;
                }
                return streamUrl;
            }
        }
        return null;
    }

    async #getNextIdleStreamUrl(): Promise<string | null> {
        // Check if any of the preferred broadcasters are online
        const streamUrl = await this.#getNextPreferredBroadcasterStreamUrl();
        if (streamUrl !== null) {
            return streamUrl;
        }

        // Check provided game ID list
        for (const gameId of this.#gameIds) {
            /*const streams = await this.#twitchClient.getActiveStreams(gameId);
            if (streams.length > 0) {
                return streams[0];
            }*/
        }

        // Check pending Drop Campaigns' games
        for (const dropCampaignId of this.#pendingDropCampaignIds) {
            const streams = await this.#twitchClient.getActiveStreams(this.#dropCampaignMap[dropCampaignId].game.displayName);
            if (streams.length > 0) {
                const streamUrl = streams[0].url;
                if (this.#streamUrlTemporaryBlacklist.has(streamUrl)) {
                    continue;
                }
                return streamUrl;
            }
        }

        return null;
    }

    /**
     * Wait for an update from the {@link TwitchDropsWatchdog}, or for {@link sleepTime} milliseconds, whichever comes
     * first.
     */
    async waitForDropCampaignUpdateOrTimeout(sleepTime: number) {
        const timeout = setTimeout(() => {
            logger.debug('notify all!');
            this.#pendingDropCampaignIdsNotifier.notifyAll();
        }, sleepTime);
        logger.debug('waiting for waitNotify: ' + timeout);
        await this.#pendingDropCampaignIdsNotifier.wait();
        logger.debug('clear: ' + timeout)
        clearTimeout(timeout);
        logger.debug('done');
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

                    logger.info("No drop campaigns active, watching a stream instead.");

                    // Choose a stream to watch
                    let streamUrl: string | null = null;
                    try {
                        streamUrl = await this.#getNextIdleStreamUrl();
                    } catch (error) {
                        logger.error("Error getting next idle stream!");
                        logger.debug(error);
                    }
                    if (streamUrl === null) {
                        logger.info("No idle streams available! sleeping for a bit...");
                        await this.waitForDropCampaignUpdateOrTimeout(this.sleepTimeMilliseconds);
                        continue;
                    }
                    logger.info("stream: " + streamUrl)

                    const dropProgressComponent = new DropProgressComponent({requireProgress: false, exitOnClaim: false});

                    const components: Component[] = [
                        dropProgressComponent,
                        new CommunityPointsComponent()
                    ];

                    let timeout: any = null;
                    const a = async () => {

                        if (await this.#hasPendingHigherPriorityStream()) {
                            this.#pendingHighPriority = true;
                        } else {
                            // Check if a more preferred broadcaster is online
                            const preferredBroadcasterStreamUrl = await this.#getNextPreferredBroadcasterStreamUrl();
                            if (preferredBroadcasterStreamUrl !== null) {
                                if (preferredBroadcasterStreamUrl !== streamUrl) {
                                    this.#pendingHighPriority = true;
                                }
                            }
                        }

                        timeout = setTimeout(a, 1000 * 60 * 5);
                    }
                    timeout = setTimeout(a, 0);

                    // Watch stream
                    try {
                        await this.#watchStreamWrapper(streamUrl, components);
                    } catch (error) {
                        await this.#page.goto("about:blank");
                    } finally {
                        clearTimeout(timeout);
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
                    await this.waitForDropCampaignUpdateOrTimeout(sleepTime);
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
                        logger.error("Error processing campaign");
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

            const inventory = await this.#twitchClient.getInventory();

            const drop = this.#getFirstUnclaimedDrop(dropCampaignId, details, inventory);
            if (drop === null) {
                logger.info('no active drops');
                break;
            }
            logger.debug('working on drop ' + JSON.stringify(drop, null, 4));

            let currentMinutesWatched = 0;

            // Check if this drop is ready to be claimed
            const inventoryDrop = getInventoryDrop(drop.id, inventory, dropCampaignId);
            if (inventoryDrop != null) {
                currentMinutesWatched = inventoryDrop.self.currentMinutesWatched;
                if (currentMinutesWatched >= inventoryDrop.requiredMinutesWatched) {
                    await this.#claimDropReward(inventoryDrop);
                    continue;
                }
            }

            // Check if we have enough time to watch and claim this drop
            if (!this.#attemptImpossibleDropCampaigns) {
                const remainingWatchTimeMinutes = drop.requiredMinutesWatched - currentMinutesWatched;
                const remainingDropActiveTimeMinutes = (new Date(Date.parse(drop.endAt)).getTime() - new Date().getTime()) / 1000 / 60;
                if (remainingDropActiveTimeMinutes < remainingWatchTimeMinutes) {
                    logger.warn('impossible drop! remaining campaign time (minutes): ' + remainingDropActiveTimeMinutes + ' required watch time (minutes): ' + remainingWatchTimeMinutes);
                    break;
                }
            }

            // Reset failed stream counts
            for (const streamUrl of Object.getOwnPropertyNames(this.#failedStreamUrlCounts)) {
                delete this.#failedStreamUrlCounts[streamUrl];
            }

            const getStreamToWatch = async () => {

                // Check if one of our preferred broadcasters has a valid stream for this Drop Campaign
                for (const broadcasterId of this.#broadcasterIds) {

                    const streamUrl = createStreamUrl(broadcasterId);

                    // Check if this stream is on the temporary blacklist
                    if (this.#streamUrlTemporaryBlacklist.has(streamUrl)) {
                        continue;
                    }

                    // Check if they are on the "allow" list
                    if (details.allow.isEnabled) {
                        const channels = details.allow.channels;
                        if (channels != null) {
                            let isChannelAllowed = false;
                            for (const channel of details.allow.channels) {
                                if (channel.id === broadcasterId) {
                                    isChannelAllowed = true;
                                    break;
                                }
                            }
                            if (!isChannelAllowed) {
                                continue;
                            }
                        }
                    }

                    // Get the tags on the stream
                    const user = await this.#twitchClient.getStreamTags(broadcasterId);
                    if (user === null) {
                        logger.warn("Unknown user: " + broadcasterId);
                        continue;
                    }
                    const stream = user.stream;
                    if (stream === null) {
                        logger.debug("stream offline: " + broadcasterId);
                        continue;
                    }

                    // Check if they have drops enabled
                    if (!hasDropsEnabledTag(stream.tags)) {
                        continue;
                    }

                    // Check if they are streaming the correct game
                    const streamMetadata = await this.#twitchClient.getStreamMetadata(broadcasterId);
                    if (streamMetadata.stream.game.id !== details.game.id) {
                        continue;
                    }

                    return streamUrl;
                }

                // Get a list of active streams that have drops enabled
                let streams = await this.#getActiveStreams(dropCampaignId, details);
                logger.debug('Found ' + streams.length + ' active streams');

                // Filter out streams that failed too many times
                streams = streams.filter(stream => {
                    return !this.#streamUrlTemporaryBlacklist.has(stream.url);
                });
                logger.info('Found ' + streams.length + ' good streams');

                if (streams.length === 0) {
                    return null;
                }

                return streams[0].url;
            }

            while (true) {

                const streamUrl = await getStreamToWatch();

                if (streamUrl === null) {
                    throw new NoStreamsError();
                }

                if (!(await this.#hasDropsAvailable(streamUrl, dropCampaignId))) {
                    logger.warn("This stream has no available Drops. This is likely because you already completed this campaign");
                    return;
                }

                const dropProgressComponent = new DropProgressComponent({targetDrop: drop});

                const components: Component[] = [
                    dropProgressComponent,
                    new CommunityPointsComponent()
                ]

                // Watch first stream
                logger.info('Watching stream: ' + streamUrl);
                try {
                    await this.#watchStreamWrapper(streamUrl, components);
                } catch (error) {
                    if (error instanceof NoProgressError) {
                        logger.warn(error.message);
                    } else if (error instanceof HighPriorityError) {
                        throw error;
                    }
                    continue;
                }

                break;
            }
        }
    }

    #onDropRewardClaimed(drop: TimeBasedDrop) {
        logger.info(ansiEscape("32m") + "Claimed drop: " + getDropName(drop) + ansiEscape("39m"));
        this.#completedDropIds.add(drop.id);
    }

    async #claimDropReward(drop: TimeBasedDrop) {
        await this.#twitchClient.claimDropReward(drop.self.dropInstanceID);
        this.#onDropRewardClaimed(drop);
        //todo: check if campaign is completed
    }

    /**
     * Check if a stream has Drops available. If it does, then we can earn Drop progress by watching. If it does not,
     * then we will not earn Drop progress while watching.
     * @param streamUrl
     * @param campaignId
     * @private
     */
    async #hasDropsAvailable(streamUrl: string, campaignId: string): Promise<boolean> {
        const channelLogin = getBroadcasterIdFromUrl(streamUrl);

        // Get channel ID
        const user = await this.#twitchClient.getStreamMetadata(channelLogin);
        const channelId = user.channel.id;

        // Get available campaigns
        const availableCampaigns = await this.#twitchClient.getAvailableCampaigns(channelId);
        for (const campaign of availableCampaigns) {
            if (campaignId === campaign.id) {
                return true;
            }
        }
        return false;
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

    #isProgressBarStarted: boolean = false;

    #startProgressBar(p = this.#payload) {
        this.#payload = p;
        if (!this.#isProgressBarStarted && this.#progressBar !== null) {
            this.#isProgressBarStarted = true;
            this.#isFirstOutput = true;
            for (let i = 0; i < this.#progressBarHeight; ++i) {
                process.stdout.write('\n');
            }
            process.stdout.write(ansiEscape(`${this.#progressBarHeight}A`));
            this.#progressBar.start(1, 0, p);
        }
    }

    #updateProgressBar(p = this.#payload) {
        this.#payload = p;
        if (this.#progressBar !== null) {
            this.#progressBar.update(0, p);
        }
    }

    #stopProgressBar(clear: boolean = false) {
        if (this.#isProgressBarStarted) {
            this.#isProgressBarStarted = false;
            this.#progressBar.stop();
            process.stdout.write(ansiEscape(`${this.#progressBarHeight - 1}B`) + ansiEscape("2K") + ansiEscape(`${this.#progressBarHeight - 1}A`));
        }
        if (clear) {
            this.#progressBar = null;
            this.#payload = null;
        }
    }

    #progressBarHeight: number = 2;

    async #watchStreamWrapper(streamUrl: string, components: Component[]) {

        const getComponent = <T extends Component>(c: Class<T>): T | null => {
            for (const component of components) {
                if (component instanceof c) {
                    return component;
                }
            }
            return null;
        }

        // Set up components
        const dropProgressComponent = getComponent(DropProgressComponent);
        if (dropProgressComponent !== null) {
            dropProgressComponent.on('drop-claimed', drop => {
                this.#onDropRewardClaimed(drop);
            });
            dropProgressComponent.on('drop-data-changed', () => {
                this.#stopProgressBar();
                this.#startProgressBar();
            });
        }

        const startWatchTime = new Date().getTime();
        try {
            await this.#watchStream(streamUrl, components);
        } catch (error) {
            if (error instanceof HighPriorityError) {
                // Ignore
            } else if (error instanceof StreamLoadFailedError) {
                logger.warn('Stream failed to load!');
            } else if (error instanceof StreamDownError) {
                logger.info('Stream went down');
                // If the stream goes down, add it to the failed stream urls immediately so we don't try it again.
                // This is needed because getActiveStreams() can return streams that are down if they went down
                // very recently.
                this.#streamUrlTemporaryBlacklist.add(streamUrl);
                this.#failedStreamUrlCounts[streamUrl] = 0;
            } else if (error instanceof NoProgressError) {
                // Ignore
            } else {
                logger.error("Error watching stream");
                logger.error(error);
                if (process.env.SAVE_ERROR_SCREENSHOTS?.toLowerCase() === 'true') {
                    await utils.saveScreenshotAndHtml(this.#page, 'error');
                }
            }

            // Increment failure counter
            if (!(streamUrl in this.#failedStreamUrlCounts)) {
                this.#failedStreamUrlCounts[streamUrl] = 0;
            }
            this.#failedStreamUrlCounts[streamUrl]++;
            if (this.#failedStreamUrlCounts[streamUrl] >= this.#failedStreamRetryCount) {
                logger.error('Stream failed too many times. Giving up for ' + this.#failedStreamBlacklistTimeout + ' minutes...');
                this.#streamUrlTemporaryBlacklist.add(streamUrl);
                this.#failedStreamUrlCounts[streamUrl] = 0;
            }

            // Re-throw the error
            throw error;
        } finally {
            logger.info(ansiEscape("36m") + "Watched stream for " + Math.floor((new Date().getTime() - startWatchTime) / 1000 / 60) + " minutes" + ansiEscape("39m"));
        }
    }

    async #watchStream(streamUrl: string, components: Component[]) {

        // Create a "Chrome Devtools Protocol" session to listen to websocket events
        const webSocketListener = new WebSocketListener();

        // Set up web socket listener
        webSocketListener.on('viewcount', count => {
            this.#viewerCount = count;
        });
        webSocketListener.on('stream-down', message => {
            this.#isStreamDown = true;
        });

        // Wrap everything in a try/finally block so that we can detach the web socket listener at the end
        try {
            await webSocketListener.attach(this.#page);

            // call onstart
            for (const component of components) {
                await component.onStart(this.#twitchClient, webSocketListener);
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
            if (this.#hideVideoElements) {
                try {
                    await streamPage.hideVideoElements();
                    logger.info('Set stream visibility to hidden');
                } catch (error) {
                    logger.error('Failed to set stream visibility to hidden!');
                    throw error;
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

            // Wrap everything in a try/finally block so that we can stop the progress bar at the end
            try {

                // Create progress bar
                this.#progressBar = new cliProgress.SingleBar(
                    {
                        barsize: 20,
                        clearOnComplete: true,
                        stream: process.stdout,
                        format: (options: any, params: any, payload: any) => {
                            let result = 'Watching ' + payload['stream_url'] + ` | Viewers: ${payload['viewers']} | Uptime: ${payload['uptime']}` + ansiEscape('0K') + '\n';

                            const dropProgressComponent = getComponent(DropProgressComponent);
                            if (dropProgressComponent !== null && dropProgressComponent.currentDrop !== null) {
                                const drop = dropProgressComponent.currentDrop;
                                this.#progressBar.setTotal(drop.requiredMinutesWatched);
                                result += `${getDropName(drop)} ${BarFormat((dropProgressComponent.currentMinutesWatched ?? 0) / drop.requiredMinutesWatched, options)} ${dropProgressComponent.currentMinutesWatched ?? 0} / ${drop.requiredMinutesWatched} minutes` + ansiEscape('0K') + '\n';
                            } else {
                                result += `- No Drops Active -\n`;
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
                this.#startProgressBar({'viewers': this.#viewerCount, 'uptime': await streamPage.getUptime(), stream_url: streamUrl});

                // Main loop
                while (true) {

                    if (this.#isStreamDown) {
                        this.#isStreamDown = false;
                        throw new StreamDownError();
                    }

                    // Check if there is a higher priority stream we should be watching
                    if (this.#pendingHighPriority) {
                        this.#pendingHighPriority = false;
                        logger.info('Switching to higher priority stream');
                        throw new HighPriorityError();
                    }

                    // Check if the URL changed since we started watching. This can happen when a broadcaster ends their stream via a Raid.
                    const currentUrl = this.#page.url();
                    if (currentUrl !== streamUrl) {
                        logger.debug("url mismatch: " + currentUrl + " vs " + streamUrl);
                        throw new StreamDownError("url mismatch");
                    }

                    for (const component of components) {
                        if (await component.onUpdate(this.#page, this.#twitchClient)) {
                            return;
                        }
                    }

                    this.#updateProgressBar({
                        'viewers': this.#viewerCount,
                        'uptime': await streamPage.getUptime(),
                        stream_url: streamUrl
                    });

                    await this.#page.waitForTimeout(1000);
                }
            } finally {
                this.#stopProgressBar(true);
            }
        } finally {
            await webSocketListener.detach();
        }
    }

    async #getActiveStreams(campaignId: string, details: DropCampaign) {
        // Get a list of active streams that have drops enabled
        // todo: this only returns 30 streams. if they all get filtered out by the "allow" filter then we should check for more
        let streams = await this.#twitchClient.getActiveStreams(this.#getDropCampaignById(campaignId).game.displayName, {tags: [StreamTag.DROPS_ENABLED]});

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
        return campaign.game.displayName + ' ' + campaign.name;
    }

    #getDropCampaignById(campaignId: string) {
        return this.#dropCampaignMap[campaignId];
    }
}
