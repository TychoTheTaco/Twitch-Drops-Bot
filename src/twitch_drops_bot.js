const SortedArray = require("sorted-array-type");
const {Mutex} = require("async-mutex");
const WaitNotify = require("wait-notify");
const logger = require("./logger");
const cliProgress = require("cli-progress");
const {BarFormat} = require('cli-progress').Format;
const TimeoutError = require("puppeteer").errors.TimeoutError;

const WebSocketListener = require("./web_socket_listener");
const {TwitchDropsWatchdog} = require("./watchdog");
const {StreamPage} = require("./pages/stream");

const utils = require('./utils')

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

class TwitchDropsBot {

    #config;
    #page;
    #twitchClient;

    #twitchDropsWatchdog;

    #pendingDropCampaignIds = new SortedArray((a, b) => {

        if (a === b) {
            return 0;
        }

        const campaignA = this.#getDropCampaignById(a);
        const campaignB = this.#getDropCampaignById(b);

        // Sort campaigns based on order of game IDs specified in config
        const indexA = this.#config['games'].indexOf(campaignA['game']['id']);
        const indexB = this.#config['games'].indexOf(campaignB['game']['id']);
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

    #progressBar = null;
    #payload = null;
    #total = null;
    #currentProgress = null;
    #isFirstOutput = true;

    #webSocketListener = new WebSocketListener();

    #currentDropCampaignId = null;

    #dropCampaignMap = {};

    #pendingHighPriority = false;

    /**
     * The drop that we are currently making progress towards.
     */
    #currentDrop = null;

    /**
     * The drop that we are trying to make progress towards. Sometimes when watching a stream, we make progress towards
     * a different drop than we had intended. This can happen when a game has multiple drop campaigns and we try to
     * process one, but a different one is currently active.
     */
    #targetDrop = null;

    #viewerCount = 0;
    #currentMinutesWatched = {};
    #lastMinutesWatched = {};
    #lastProgressTime = {};
    #isDropReadyToClaim = false;
    #isStreamDown = false;

    constructor(config, page, client) {
        this.#config = config;
        this.#page = page;
        this.#twitchClient = client;

        // Set up Twitch Drops Watchdog
        this.#twitchDropsWatchdog = new TwitchDropsWatchdog(this.#twitchClient, config['interval']);
        this.#twitchDropsWatchdog.on('before_update', () => {
            this.#stopProgressBar();
            logger.info('Updating drop campaigns...');
        });
        this.#twitchDropsWatchdog.on('update', async (campaigns) => {

            logger.info('Found ' + campaigns.length + ' active campaigns.');

            while (this.#pendingDropCampaignIds.length > 0) {
                this.#pendingDropCampaignIds.pop();
            }

            // Add to pending
            campaigns.forEach(campaign => {

                const dropCampaignId = campaign['id'];
                this.#dropCampaignMap[dropCampaignId] = campaign;

                if (config['games'].length === 0 || config['games'].includes(campaign['game']['id']) || config['watch_unlisted_games']) {

                    // Check if this campaign is finished already
                    /*if (this.#completedCampaignIds.has(dropCampaignId)) {
                        return;
                    }*/

                    // Make sure Twitch account is linked
                    if (!campaign['self']['isAccountConnected']) {
                        //logger.warn('Twitch account not linked for drop campaign: ' + getDropCampaignFullName(dropCampaignId));
                        return;
                    }

                    this.#pendingDropCampaignIds.insert(dropCampaignId);
                }
            });
            logger.info('Found ' + this.#pendingDropCampaignIds.length + ' pending campaigns.');
            this.#pendingDropCampaignIds.forEach((value, index) => {
                //logger.debug(index + ') ' + getDropCampaignFullName(value));
            });

            // Check if we are currently working on a drop campaign
            if (this.#currentDropCampaignId !== null) {

                // Check if there is a higher priority stream we should be watching
                this.#pendingHighPriority = false;
                for (let i = 0; i < this.#pendingDropCampaignIds.length; ++i) {
                    const firstCampaignId = this.#pendingDropCampaignIds[i];

                    if (firstCampaignId === this.#currentDropCampaignId) {
                        break;
                    }

                    const firstDrop = await this.#getFirstUnclaimedDrop(firstCampaignId);
                    if (firstDrop !== null) {

                        // Check if this drop is ready to be claimed
                        let claimed = false;
                        const inventoryDrop = await this.#twitchClient.getInventoryDrop(firstDrop['id'], firstCampaignId);
                        if (inventoryDrop != null) {
                            if (inventoryDrop['self']['currentMinutesWatched'] >= inventoryDrop['requiredMinutesWatched']) {
                                await this.#claimDropReward(inventoryDrop);
                                claimed = true;
                            }
                        }

                        if (!claimed) {

                            // Make sure there are active streams before switching
                            const details = await this.#twitchClient.getDropCampaignDetails(firstCampaignId);
                            if ((await this.#getActiveStreams(firstCampaignId, details)).length > 0) {
                                logger.info('Higher priority campaign found: ' + this.#getDropCampaignFullName(firstCampaignId) + ' id: ' + firstCampaignId + ' time: ' + new Date().getTime());
                                this.#pendingHighPriority = true;
                                break;
                            }

                        }

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
            if (dropId !== this.#currentDrop['id']) {
                logger.debug('Drop progress message does not match expected drop: ' + this.#currentDrop['id'] + ' vs ' + dropId);

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

                if (dropId !== this.#currentDrop['id']) {
                    // If we made progress for a different drop, switch to it
                    this.#currentDrop = await this.#twitchClient.getInventoryDrop(dropId);

                    if (!(this.#currentDrop['id'] in this.#currentMinutesWatched)) {
                        this.#currentMinutesWatched[this.#currentDrop['id']] = this.#currentDrop['self']['currentMinutesWatched'];
                        this.#lastMinutesWatched[this.#currentDrop['id']] = this.#currentDrop['self']['currentMinutesWatched'];
                        this.#lastProgressTime[this.#currentDrop['id']] = new Date();
                    }

                    // Restart the progress bar
                    this.#stopProgressBar(true);
                    logger.info('Drop progress does not match expected drop: ' + this.#currentDrop['id'] + ' vs ' + dropId);
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
        this.#webSocketListener.on('claim-available', data => {
            logger.debug('Claim available: ' + JSON.stringify(data, null, 4));
            // TODO: Claim button may not be visible
            /*await page.screenshot({
                fullPage: true,
                path: 'claim-ss.png'
            })
             try {
                 await page.evaluate(() => {
                     const element = document.evaluate('//button[@aria-label="Claim Bonus"]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue;
                     if (element.nodeType === Node.ELEMENT_NODE) {
                         element.click();
                     }
                 });
             } catch (error) {
                 // Ignore errors
                 console.log('oof', error);
             }*/
        });
        this.#webSocketListener.on('claim-claimed', data => {
            logger.debug('Claim claimed: ' + JSON.stringify(data, null, 4));
        })
    }

    async login(username, password, headless = false) {

    }

    async start() {

        // The last time we attempted to make progress towards each drop campaign
        const lastDropCampaignAttemptTimes = {};

        // Amount of time to wait after failing to make progress towards a drop campaign before trying it again
        const SLEEP_TIME_MS = 1000 * 60 * 5;

        // noinspection InfiniteLoopJS
        while (true) {

            // Get the first pending drop campaign ID
            inner: while (true) {

                logger.debug('Finding next drop campaign...');

                if (this.#pendingDropCampaignIds.length > 0) {

                    // Find the first pending drop campaign that we haven't checked in the past 5 minutes
                    let minLastDropCampaignCheckTime = null;
                    for (const pendingDropCampaignId of this.#pendingDropCampaignIds) {
                        const lastCheckTime = lastDropCampaignAttemptTimes[pendingDropCampaignId];
                        logger.debug('id: ' + pendingDropCampaignId + ' last check time: ' + lastCheckTime);
                        if (lastCheckTime) {
                            minLastDropCampaignCheckTime = Math.min(minLastDropCampaignCheckTime ?? lastCheckTime, lastCheckTime);
                            if (new Date().getTime() - lastCheckTime < SLEEP_TIME_MS) {
                                logger.debug('skip');
                                continue;
                            }
                        }

                        this.#currentDropCampaignId = pendingDropCampaignId;
                        logger.debug('currentDropCampaignId=' + this.#currentDropCampaignId);
                        break inner;
                    }

                    // We already checked all pending drop campaigns in the past 5 minutes, lets wait for the oldest one
                    logger.debug('final minlastdropcampaignchecktime: ' + minLastDropCampaignCheckTime + ' time: ' + new Date().getTime());
                    logger.debug(SLEEP_TIME_MS + ' ' + (new Date().getTime() - minLastDropCampaignCheckTime));
                    const sleepTime = Math.max(0, SLEEP_TIME_MS - (new Date().getTime() - minLastDropCampaignCheckTime));
                    logger.info('No campaigns/streams active. Sleeping for ' + (sleepTime / 1000 / 60).toFixed(1) + ' min.');
                    setTimeout(() => {
                        logger.debug('notify all!');
                        this.#pendingDropCampaignIdsNotifier.notifyAll();
                    }, sleepTime);

                }

                logger.debug('waiting for waitNotify');
                await this.#pendingDropCampaignIdsNotifier.wait();
                logger.debug('done');
            }

            // Attempt to make progress towards the current drop campaign
            logger.info('Processing campaign: ' + this.#getDropCampaignFullName(this.#currentDropCampaignId));
            lastDropCampaignAttemptTimes[this.#currentDropCampaignId] = new Date().getTime();
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

    stop() {

    }

    /**
     * Attempt to make progress towards the specified drop campaign.
     * @param dropCampaignId
     * @returns {Promise<void>}
     */
    async #processDropCampaign(dropCampaignId) {
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
            const failedStreamUrlCounts = {};

            const failedStreamUrls = new Set();

            while (true) {

                // Get a list of active streams that have drops enabled
                let streams = await this.#getActiveStreams(dropCampaignId, details);
                logger.info('Found ' + streams.length + ' active streams');

                // Filter out streams that failed too many times
                streams = streams.filter(stream => {
                    return !failedStreamUrls.has(stream['url']);
                });
                logger.info('Found ' + streams.length + ' potential streams');

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
                    await this.#watchStreamUntilCampaignCompleted(streamUrl, dropCampaignId, drop);
                } catch (error) {
                    if (error instanceof NoProgressError) {
                        logger.warn(error.message);
                    } else if (error instanceof HighPriorityError) {
                        throw error;
                    } else if (error instanceof StreamLoadFailedError) {
                        logger.warn('Stream failed to load!');
                    } else if (error instanceof StreamDownError) {
                        /*
                        If the stream goes down, add it to the failed stream urls immediately so we don't try it again.
                        This is needed because getActiveStreams() can return streams that are down if they went down
                        very recently.
                         */
                        failedStreamUrls.add(streamUrl);
                    } else {
                        logger.error(error);
                        await utils.saveScreenshotAndHtml(this.#page, 'error')
                    }

                    // Increment failure counter
                    if (!(streamUrl in failedStreamUrlCounts)) {
                        failedStreamUrlCounts[streamUrl] = 0;
                    }
                    failedStreamUrlCounts[streamUrl]++;

                    // Move on if this stream failed too many times
                    if (failedStreamUrlCounts[streamUrl] >= 3) {
                        logger.error('Stream failed too many times. Giving up...');
                        failedStreamUrls.add(streamUrl);
                    }
                    continue;
                } finally {
                    await this.#webSocketListener.detach();
                }

                break;
            }
        }
    }

    async #claimDropReward(drop) {
        logger.info('Claiming drop!');
        await this.#twitchClient.claimDropReward(drop['self']['dropInstanceID']);
    }

    async #waitUntilElementRendered(page, element, timeout = 1000 * 30) {
        const checkDurationMsecs = 1000;
        const maxChecks = timeout / checkDurationMsecs;
        let lastHTMLSize = 0;
        let checkCounts = 1;
        let countStableSizeIterations = 0;
        const minStableSizeIterations = 3;

        while (checkCounts++ <= maxChecks) {
            let html = await (await element.getProperty('outerHTML')).jsonValue();
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

    #ansiEscape(code) {
        return '\x1B[' + code;
    }

    #startProgressBar(t = this.#total, p = this.#payload) {
        this.#isFirstOutput = true;
        this.#total = t;
        this.#payload = p;
        if (this.#progressBar !== null) {
            this.#progressBar.start(t, 0, p);
        }
    }

    #updateProgressBar(c = this.#currentProgress, p = this.#payload) {
        this.#currentProgress = c;
        this.#payload = p;
        if (this.#progressBar !== null) {
            this.#progressBar.update(c, p);
        }
    }

    #stopProgressBar(clear = false) {
        if (this.#progressBar !== null) {
            this.#progressBar.stop();
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
                clearOnComplete: true,
                barsize: 20,
                stream: process.stdout,
                format: (options, params, payload) => {
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

    async #watchStreamUntilCampaignCompleted(streamUrl, campaignId, targetDrop) {
        this.#targetDrop = targetDrop;
        this.#currentDrop = targetDrop;
        logger.debug('target: ' + targetDrop['id']);

        this.#viewerCount = 0;
        this.#currentMinutesWatched = {};
        this.#currentMinutesWatched[targetDrop['id']] = 0;
        this.#lastMinutesWatched = {};
        this.#lastMinutesWatched[targetDrop['id']] = -1;
        this.#lastProgressTime = {};
        this.#lastProgressTime[targetDrop['id']] = new Date();
        this.#isDropReadyToClaim = false;
        this.#isStreamDown = false;

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

        const requiredMinutesWatched = targetDrop['requiredMinutesWatched'];

        this.#createProgressBar();
        this.#startProgressBar(requiredMinutesWatched, {'viewers': await streamPage.getViewersCount(), 'uptime': await streamPage.getUptime(), drop_name: this.#getDropName(targetDrop), stream_url: streamUrl});

        // The maximum amount of time to allow no progress
        const maxNoProgressTime = 1000 * 60 * 5;

        while (true) {

            if (this.#isStreamDown) {
                this.#isStreamDown = false;
                this.#stopProgressBar(true);
                throw new StreamDownError('Stream went down!');
            }

            this.#updateProgressBar(this.#currentMinutesWatched[this.#currentDrop['id']], {'viewers': this.#viewerCount, 'uptime': await streamPage.getUptime(), drop_name: this.#getDropName(this.#currentDrop), stream_url: streamUrl});

            // Check if we have made progress towards the current drop
            if (new Date().getTime() - this.#lastProgressTime[this.#currentDrop['id']] >= maxNoProgressTime) {

                // Maybe we haven't got any updates from the web socket, lets check our inventory
                const currentDropId = this.#currentDrop['id'];
                const inventoryDrop = await this.#twitchClient.getInventoryDrop(currentDropId);
                this.#currentMinutesWatched[currentDropId] = inventoryDrop['self']['currentMinutesWatched'];
                if (this.#currentMinutesWatched[currentDropId] > this.#lastMinutesWatched[currentDropId]) {
                    this.#lastProgressTime[currentDropId] = new Date().getTime();
                    this.#lastMinutesWatched[currentDropId] = this.#currentMinutesWatched[currentDropId];
                    logger.debug('no progress from web socket! using inventory progress');
                } else {
                    this.#stopProgressBar(true);
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

                // TODO: dont return, check for more drops

                return;
            }

            await this.#page.waitForTimeout(1000);
        }
    }

    async #getFirstUnclaimedDrop(campaignId) {
        // Get all drops for this campaign
        const details = await this.#twitchClient.getDropCampaignDetails(campaignId);

        for (const drop of details['timeBasedDrops']) {

            // Check if we already claimed this drop
            if (await this.#isDropClaimed(drop)) {
                continue;
            }

            // Check if this drop has expired
            if (new Date() > new Date(Date.parse(drop['endAt']))) {
                continue;
            }

            // Check if this has started
            if (new Date() < new Date(Date.parse(drop['startAt']))) {
                continue;
            }

            return drop;
        }

        return null;
    }

    async #isDropClaimed(drop) {
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

    async #getActiveStreams(campaignId, details) {
        // Get a list of active streams that have drops enabled
        let streams = await this.#twitchClient.getDropEnabledStreams(this.#getDropCampaignById(campaignId)['game']['displayName']);

        // Filter out streams that are not in the allowed channels list, if any
        const channels = details['allow']['channels'];
        if (channels != null) {
            const channelIds = new Set();
            for (const channel of channels) {
                channelIds.add(channel['id']);
            }
            streams = streams.filter(stream => {
                return channelIds.has(stream['broadcaster_id']);
            });
        }

        return streams;
    }

    #getDropCampaignFullName(campaignId) {
        const campaign = this.#getDropCampaignById(campaignId);
        return campaign['game']['displayName'] + ' ' + campaign['name'];
    }

    #getDropCampaignById(campaignId) {
        return this.#dropCampaignMap[campaignId];
    }

    #getDropName(drop) {
        return drop['benefitEdges'][0]['benefit']['name'];
    }
}

module.exports = {
    TwitchDropsBot
}
