'use strict';

const fs = require('fs');
const {ArgumentParser} = require('argparse');
const path = require('path');

const prompt = require('prompt');
const cliProgress = require('cli-progress');
const {BarFormat} = require('cli-progress').Format;
const WaitNotify = require('wait-notify');
const SortedArray = require('sorted-array-type');

const logger = require('./logger');
const twitch = require('./twitch');
const {StreamPage} = require('./pages/stream');
const {TwitchDropsWatchdog} = require('./watchdog');
const {StringOption, BooleanOption, IntegerOption, ListOption} = require('./options');

// Using puppeteer-extra to add plugins
const puppeteer = require('puppeteer-extra');
const TimeoutError = require("puppeteer").errors.TimeoutError;

// Add stealth plugin
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class NoStreamsError extends Error {

}

class NoProgressError extends Error {

}

class HighPriorityError extends Error {

}

function onBrowserOrPageClosed() {
    logger.info('Browser was disconnected or tab was closed! Exiting...');
    process.exit(1);
}

async function claimDrop(credentials, drop) {
    logger.info('Claiming drop!');
    await twitch.claimDropReward(credentials, drop['self']['dropInstanceID']);
}

async function waitUntilElementRendered(page, element, timeout = 1000 * 30) {
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

function ansiEscape(code) {
    return '\x1B[' + code;
}

let progressBar = null;
let payload = null;
let total = null;
let currentProgress = null;
let isFirstOutput = true;

function startProgressBar(t = total, p = payload) {
    isFirstOutput = true;
    total = t;
    payload = p;
    if (progressBar !== null) {
        progressBar.start(t, 0, p);
    }
}

function updateProgressBar(c = currentProgress, p = payload) {
    currentProgress = c;
    payload = p;
    if (progressBar !== null) {
        progressBar.update(c, p);
    }
}

function stopProgressBar(clear = false) {
    if (progressBar !== null) {
        progressBar.stop();
    }
    if (clear) {
        progressBar = null;
        payload = null;
        total = null;
        currentProgress = null;
    }
}

let pendingHighPriority = false;

async function watchStreamUntilDropCompleted(page, streamUrl, twitchCredentials, campaignId, drop) {
    await page.goto(streamUrl);

    // Wait for the page to load completely (hopefully). This checks the video player container for any DOM changes and waits until there haven't been any changes for a few seconds.
    logger.info('Waiting for page to load...');
    const element = (await page.$x('//div[@data-a-player-state]'))[0]
    await waitUntilElementRendered(page, element);

    const streamPage = new StreamPage(page);
    await streamPage.waitForLoad();

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

    const requiredMinutesWatched = drop['requiredMinutesWatched'];

    // Create progress bar
    progressBar = new cliProgress.SingleBar(
        {
            clearOnComplete: true,
            barsize: 20,
            format: (options, params, payload) => {
                let result = 'Watching ' + streamUrl + ` | Viewers: ${payload['viewers']} | Uptime: ${payload['uptime']}` + ansiEscape('0K') + '\n'
                    + `${payload['drop_name']} ${BarFormat(params.progress, options)} ${params.value} / ${params.total} minutes` + ansiEscape('0K') + '\n';
                if (isFirstOutput) {
                    return result;
                }
                return ansiEscape('2A') + result;
            }
        },
        cliProgress.Presets.shades_classic
    );
    progressBar.on('redraw-post', () => {
        isFirstOutput = false;
    });
    startProgressBar(requiredMinutesWatched, {'viewers': await streamPage.getViewersCount(), 'uptime': await streamPage.getUptime(), drop_name: drop['name']});

    let wasInventoryDropNull = false;
    let lastMinutesWatched = -1;
    let lastProgressCheckTime = 0;
    let currentMinutesWatched = 0;

    // The last time any progress was made on the current drop
    let lastProgressTime = 0;

    // The maximum amount of time to allow no progress
    const maxNoProgressTime = 1000 * 60 * 5;

    const startTime = new Date();

    while (true) {

        // Check drop progress
        if (new Date().getTime() - lastProgressCheckTime >= 1000 * 60) {

            const inventoryDrop = await twitch.getInventoryDrop(twitchCredentials, campaignId, drop['id']);

            // Check if the drop is not in our inventory yet. This can happen if we just started the campaign
            if (inventoryDrop == null) {

                // If the drop was null twice in a row, then something is wrong
                if (wasInventoryDropNull && new Date().getTime() - startTime >= maxNoProgressTime) {
                    stopProgressBar(true);
                    throw new NoProgressError('Drop was not found in your inventory! Either the campaign has ended or no progress is being made towards the drop.');
                }

                wasInventoryDropNull = true;
            } else {
                currentMinutesWatched = inventoryDrop['self']['currentMinutesWatched'];
            }

            lastProgressCheckTime = new Date().getTime();
        }

        updateProgressBar(currentMinutesWatched, {'viewers': await streamPage.getViewersCount(), 'uptime': await streamPage.getUptime(), drop_name: drop['name']});

        // Claim community points
        try {
            await page.evaluate(() => {
                const element = document.evaluate('//button[@aria-label="Claim Bonus"]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue;
                if (element.nodeType === Node.ELEMENT_NODE) {
                    element.click();
                }
            });
        } catch (error) {
            // Ignore errors
        }

        // Check if we have completed the drop
        if (currentMinutesWatched >= requiredMinutesWatched) {
            stopProgressBar(true);
            return;
        }

        // Check if any progress was made towards the drop
        if (currentMinutesWatched > lastMinutesWatched) {
            lastProgressTime = new Date().getTime();
        }

        lastMinutesWatched = currentMinutesWatched;

        // If we haven't made any progress for a while, something is wrong
        if (new Date().getTime() - lastProgressTime >= maxNoProgressTime) {
            stopProgressBar(true);
            throw new NoProgressError("No progress was detected in the last " + (maxNoProgressTime / 1000 / 60) + " minutes!");
        }

        // Check if there is a higher priority stream we should be watching
        if (pendingHighPriority) {
            pendingHighPriority = false;
            stopProgressBar(true);
            logger.info('Switching to higher priority stream');
            throw new HighPriorityError();
        }

        await page.waitForTimeout(1000);
    }
}

async function getFirstUnclaimedDrop(campaignId, twitchCredentials) {
    // Get all drops for this campaign
    const details = await twitch.getDropCampaignDetails(twitchCredentials, campaignId);

    for (const drop of details['timeBasedDrops']) {

        // Check if we already claimed this drop
        if (await isDropClaimed(twitchCredentials, drop)) {
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

async function isDropClaimed(credentials, drop) {
    const inventory = await twitch.getInventory(credentials);

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

async function getActiveStreams(campaignId, twitchCredentials, details) {
    // Get a list of active streams that have drops enabled
    let streams = await twitch.getDropEnabledStreams(twitchCredentials, getDropCampaignById(campaignId)['game']['displayName']);

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

async function processCampaign(page, campaignId, twitchCredentials) {
    // Get all drops for this campaign
    const details = await twitch.getDropCampaignDetails(twitchCredentials, campaignId);
    const drops = details['timeBasedDrops'];

    for (const drop of drops) {
        logger.info('Drop: ' + drop['benefitEdges'][0]['benefit']['name']);

        // Check if we already claimed this drop
        if (await isDropClaimed(twitchCredentials, drop)) {
            logger.info('Drop already claimed');
            continue;
        }

        // Check if this drop has expired
        if (new Date() > new Date(Date.parse(drop['endAt']))) {
            logger.info('Drop expired!');
            continue;
        }

        // Check if this has started
        if (new Date() < new Date(Date.parse(drop['startAt']))) {
            logger.info('Drop has not started yet!');
            continue;
        }

        // Check if this drop is ready to be claimed
        const inventoryDrop = await twitch.getInventoryDrop(twitchCredentials, campaignId, drop['id']);
        if (inventoryDrop != null) {
            if (inventoryDrop['self']['currentMinutesWatched'] >= inventoryDrop['requiredMinutesWatched']) {
                await claimDrop(twitchCredentials, inventoryDrop);
                continue;
            }
        }

        const failures = {};

        const failedStreams = new Set();

        while (true) {

            // Get a list of active streams that have drops enabled
            let streams = await getActiveStreams(campaignId, twitchCredentials, details);

            // Filter out streams that failed too many times
            streams = streams.filter(stream => {
                return !failedStreams.has(stream['url']);
            });

            logger.info('Found ' + streams.length + ' active streams');

            // If there are no steams, try the next campaign
            if (streams.length === 0) {
                throw new NoStreamsError();
            }

            // Watch first stream
            const streamUrl = streams[0]['url'];
            logger.info('Watching stream: ' + streamUrl);
            try {
                await watchStreamUntilDropCompleted(page, streamUrl, twitchCredentials, campaignId, drop);
            } catch (error) {
                if (error instanceof NoProgressError) {
                    logger.warn(error.message);
                } else if (error instanceof HighPriorityError) {
                    throw error;
                } else {
                    logger.error(error);
                }

                if (!(streamUrl in failures)) {
                    failures[streamUrl] = 0;
                }
                failures[streamUrl]++;

                if (failures[streamUrl] >= 3) {
                    logger.error('Stream failed too many times. Giving up...');
                    failedStreams.add(streamUrl);
                }
                continue;
            }

            // Claim the drop
            await claimDrop(twitchCredentials, await twitch.getInventoryDrop(twitchCredentials, campaignId, drop['id']));

            break;
        }

    }
}

function areCookiesValid(cookies, username) {
    let isOauthTokenFound = false;
    for (const cookie of cookies) {

        // Check if these cookies match the specified username (if any)
        if (username !== undefined) {
            if (cookie['name'] === 'name' || cookie['name'] === 'login') {
                if (cookie['value'] !== username) {
                    return false;
                }
            }
        }

        // Check if we have an OAuth token
        if (cookie['name'] === 'auth-token') {
            isOauthTokenFound = true;
        }
    }
    return isOauthTokenFound;
}

function updateGames(campaigns) {
    logger.info('Parsing games...');
    const gamesPath = './games.csv'
    const oldGames = fs
        .readFileSync(gamesPath, {encoding: 'utf-8'})
        .split('\r\n')
        .slice(1)  // Ignore header row
        .filter(game => !!game)
        .map(game => game.split(','));
    const newGames = [
        ...oldGames,
        ...campaigns.map(campaign => [campaign['game']['displayName'], campaign['game']['id']])
    ];
    const games = newGames
        .filter((game, index) => newGames.findIndex(g => g[1] === game[1]) >= index)
        .sort((a, b) => a[0].localeCompare(b[0]));
    // TODO: ask interactively if users wants to add some to the config file?
    const toWrite = games
        .map(game => game.join(','))
        .join('\r\n');
    fs.writeFileSync(
        gamesPath,
        'Name,ID\r\n' + toWrite + '\r\n',
        {encoding: 'utf-8'});
    logger.info('Games list updated');
}

// Options defined here can be configured in either the config file or as command-line arguments
const options = [
    new StringOption('--username', '-u'),
    new StringOption('--password', '-p'),
    new StringOption('--browser', '-b', () => {
        switch (process.platform) {
            case "win32":
                return path.join("C:", "Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe");

            case "linux":
                return path.join("google-chrome");

            default:
                return '';
        }
    }),
    new ListOption('--games', '-g', []),
    new BooleanOption('--headless', null, true, false),
    new BooleanOption('--headless-login', null, false),
    new IntegerOption('--interval', '-i', 15),
    new ListOption('--browser-args', null, []),
    new BooleanOption('--update-games', null, false),
    new BooleanOption('--watch-unlisted-games', null, false)
];

// Parse arguments
const parser = new ArgumentParser();
parser.add_argument('--config', '-c', {default: 'config.json'});
for (const option of options) {
    if (option.alias) {
        parser.add_argument(option.name, option.alias, option.argparseOptions);
    } else {
        parser.add_argument(option.name, option.argparseOptions);
    }
}
const args = parser.parse_args();

// Load config from file if it exists
let config = {};
logger.info('Loading config file: ' + args['config']);
const configFileExists = fs.existsSync(args['config']);
if (configFileExists) {
    try {
        config = JSON.parse(fs.readFileSync(args['config'], {encoding: 'utf-8'}));
    } catch (error) {
        logger.error('Failed to read config file!');
        logger.error(error);
        process.exit(1);
    }
} else {
    logger.warn('Config file not found! Creating a default one...');
}

// Override options from config with options from arguments and set defaults
for (const option of options) {
    const key = option['name'].replace(/^-+/g, '').replace(/-/g, '_');
    if (args[key] === undefined) {
        if (config[key] === undefined) {
            const defaultValue = option.defaultValue;
            if (typeof defaultValue === 'function') {
                config[key] = defaultValue();
            } else {
                config[key] = defaultValue;
            }
        }
    } else {
        if (typeof args[key] === 'string') {
            config[key] = option.parse(args[key]);
        } else {
            config[key] = args[key];
        }
    }
}

// Save config file if it didn't exist
if (!configFileExists) {
    fs.writeFileSync(args['config'], JSON.stringify(config));
    logger.info('Config saved to ' + args['config']);
}

// Validate options
if (config['headless_login'] && (config['username'] === undefined || config['password'] === undefined)) {
    parser.error("You must provide a username and password to use headless login!");
    process.exit(1);
}

// Add required browser args
const requiredBrowserArgs = [
    '--mute-audio',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'
]
for (const arg of requiredBrowserArgs) {
    if (!config['browser_args'].includes(arg)) {
        config['browser_args'].push(arg);
    }
}

// Make username lowercase
if (config['username']) {
    config['username'] = config['username'].toLowerCase();
}

const completedCampaignIds = new Set();

let currentDropCampaignId = null;

const dropCampaignMap = {};

const activeDropCampaignIds = new SortedArray((a, b) => {

    if (a === b) {
        return 0;
    }

    const campaignA = getDropCampaignById(a);
    const campaignB = getDropCampaignById(b);

    // Sort campaigns based on order of game IDs specified in config
    const indexA = config['games'].indexOf(campaignA['game']['id']);
    const indexB = config['games'].indexOf(campaignB['game']['id']);
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

function getDropCampaignFullName(campaignId) {
    const campaign = getDropCampaignById(campaignId);
    return campaign['game']['displayName'] + ' ' + campaign['name'];
}

function getDropCampaignById(campaignId) {
    return dropCampaignMap[campaignId];
}

(async () => {

    // Start browser and open a new tab.
    const browser = await puppeteer.launch({
        headless: config['headless'],
        executablePath: config['browser'],
        args: config['browser_args']
    });
    const page = await browser.newPage();

    // Automatically stop this program if the browser or page is closed
    browser.on('disconnected', onBrowserOrPageClosed);
    page.on('close', onBrowserOrPageClosed);

    // Check if we have saved cookies
    const cookiesPath = `./cookies-${config['username']}.json`;
    let requireLogin = false;
    if (fs.existsSync(cookiesPath)) {

        // Load cookies
        const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));

        // Make sure these cookies are valid
        if (areCookiesValid(cookies, config['username'])) {

            // Restore cookies from previous session
            logger.info('Restoring cookies from last session.');
            await page.setCookie(...cookies);

        } else {

            // Saved cookies are invalid, let's delete them
            logger.info('Saved cookies are invalid.')
            fs.unlinkSync(cookiesPath);

            // We need to login again
            requireLogin = true;

        }

    } else {
        requireLogin = true;
    }

    if (requireLogin) {
        logger.info('Logging in...');

        // Check if we need to create a new headful browser for the login
        const needNewBrowser = config['headless'] && !config['headless_login'];
        let loginBrowser = browser;
        if (needNewBrowser) {
            loginBrowser = await puppeteer.launch({
                headless: false,
                executablePath: config['browser'],
                args: [
                    '--mute-audio'
                ]
            });
        }

        const cookies = await twitch.login(loginBrowser, config['username'], config['password'], config['headless_login']);
        fs.writeFileSync(cookiesPath, JSON.stringify(cookies));
        await page.setCookie(...cookies);

        if (needNewBrowser) {
            await loginBrowser.close();
        }
    }

    // Twitch credentials for API interactions
    const twitchCredentials = {

        // Seems to be the default hard-coded client ID
        // Found in sources / static.twitchcdn.net / assets / minimal-cc607a041bc4ae8d6723.js
        'client_id': 'kimne78kx3ncx6brgo4mv6wki5h1ko'

    }

    // Get some data from the cookies
    for (const cookie of await page.cookies('https://www.twitch.tv')) {
        switch (cookie['name']) {
            case 'auth-token':  // OAuth token
                twitchCredentials['oauth_token'] = cookie['value'];
                break;

            case 'persistent':  // "channelLogin" Used for "DropCampaignDetails" operation
                twitchCredentials['channel_login'] = cookie['value'].split('%3A')[0];
                break;

            case 'login':
                logger.info('Logged in as ' + cookie['value']);
                break;
        }
    }

    const waitNotify = new WaitNotify();

    const watchdog = new TwitchDropsWatchdog(twitchCredentials, config['interval']);
    watchdog.on('before_update', () => {
        stopProgressBar();
        logger.info('Updating drop campaigns...');
    });
    watchdog.on('update', async (campaigns) => {

        logger.info('Found ' + campaigns.length + ' active campaigns.');

        while (activeDropCampaignIds.length > 0) {
            activeDropCampaignIds.pop();
        }

        // Add to pending
        campaigns.forEach(campaign => {

            const dropCampaignId = campaign['id'];
            dropCampaignMap[dropCampaignId] = campaign;

            if (config['games'].length === 0 || config['games'].includes(campaign['game']['id']) || config['watch_unlisted_games']) {

                // Check if this campaign is finished already
                if (completedCampaignIds.has(dropCampaignId)) {
                    return;
                }

                // Make sure Twitch account is linked
                if (!campaign['self']['isAccountConnected']) {
                    logger.warn('Twitch account not linked for drop campaign: ' + getDropCampaignFullName(dropCampaignId));
                    return;
                }

                activeDropCampaignIds.insert(dropCampaignId);
            }
        });
        logger.info('Found ' + activeDropCampaignIds.length + ' pending campaigns.');
        activeDropCampaignIds.forEach((value, index) => {
            logger.info(index + ') ' + getDropCampaignFullName(value));
        });

        // Update games
        if (config['update_games']) {
            updateGames(Object.values(dropCampaignMap));
            process.exit(0);
        }

        // Check if we are currently working on a drop campaign
        if (currentDropCampaignId !== null) {

            // Check if there is a higher priority stream we should be watching
            pendingHighPriority = false;
            for (let i = 0; i < activeDropCampaignIds.length; ++i) {
                const firstCampaignId = activeDropCampaignIds[i];

                if (firstCampaignId === currentDropCampaignId) {
                    break;
                }

                const firstDrop = await getFirstUnclaimedDrop(firstCampaignId, twitchCredentials);
                if (firstDrop !== null) {

                    // Check if this drop is ready to be claimed
                    let claimed = false;
                    const inventoryDrop = await twitch.getInventoryDrop(twitchCredentials, firstCampaignId, firstDrop['id']);
                    if (inventoryDrop != null) {
                        if (inventoryDrop['self']['currentMinutesWatched'] >= inventoryDrop['requiredMinutesWatched']) {
                            await claimDrop(twitchCredentials, inventoryDrop);
                            claimed = true;
                        }
                    }

                    if (!claimed) {

                        // Make sure there are active streams before switching
                        const details = await twitch.getDropCampaignDetails(twitchCredentials, firstCampaignId);
                        if ((await getActiveStreams(firstCampaignId, twitchCredentials, details)).length > 0) {
                            logger.info('Higher priority campaign found: ' + getDropCampaignFullName(firstCampaignId));
                            pendingHighPriority = true;
                            break;
                        }

                    }

                }
            }
        }

        waitNotify.notifyAll();

        startProgressBar();
    });
    watchdog.start();

    await waitNotify.wait();

    while (true) {

        while (activeDropCampaignIds.length > 0) {

            let highPriority = false;

            // Get campaign from queue
            currentDropCampaignId = activeDropCampaignIds[0];
            logger.info('Processing campaign: ' + getDropCampaignFullName(currentDropCampaignId));

            try {
                await processCampaign(page, currentDropCampaignId, twitchCredentials);
                completedCampaignIds.add(currentDropCampaignId);
            } catch (error) {
                if (error instanceof NoStreamsError) {
                    logger.info('No streams!');
                } else if (error instanceof HighPriorityError) {
                    highPriority = true;
                } else {
                    logger.error(error);
                }
            } finally {
                if (!highPriority) {
                    activeDropCampaignIds.remove(activeDropCampaignIds[0]);
                }
            }
        }

        currentDropCampaignId = null;

        logger.info('Sleeping for ' + config['interval'] + ' minutes...');
        await sleep(1000 * 60 * config['interval']);

    }

})().catch(error => {
    logger.error(error);
    process.exit(1);
});
