'use strict';

const fs = require('fs');
const {ArgumentParser} = require('argparse');
const path = require('path');

const prompt = require('prompt');
const cliProgress = require('cli-progress');
const FastPriorityQueue = require('fastpriorityqueue');

// Set up logger
const {transports, createLogger, format} = require('winston');
const logger = createLogger({
    format: format.combine(
        format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
        {
            transform(info, opts) {
                const message = info.message;
                if (message instanceof Error) {
                    info.message = message.stack.replace(/^Error/g, message.constructor.name);
                }
                return info;
            }
        },
        format.printf(info => {
            let result = `[${info.timestamp}] [${info.level}] ${info.message}`;
            if (info.stack) {
                result += ` ${info.stack}`;
            }
            return result;
        })
    ),
    transports: [
        new transports.Console()
    ]
});

const twitch = require('./twitch');

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

function onBrowserOrPageClosed() {
    logger.info('Browser was disconnected or tab was closed! Exiting...');
    process.exit(1);
}

async function login(config, browser) {
    const page = await browser.newPage();

    // Automatically stop this program if the page is closed
    page.on('close', onBrowserOrPageClosed);

    // Go to login page
    await page.goto('https://www.twitch.tv/login');

    // Enter username
    const username = config['username'];
    if (username !== undefined) {
        await page.focus('#login-username');
        await page.keyboard.type(username);
    }

    // Enter password
    const password = config['password'];
    if (password !== undefined) {
        await page.focus('#password-input');
        await page.keyboard.type(password);
    }

    // Click login button
    if (username !== undefined && password !== undefined) {
        await page.click('[data-a-target="passport-login-button"]');
    }

    if (config['headless_login']) {
        while (true) {

            // TODO: This loop and try/catch statements could be replaced with Promise.any(), but it seems that Node.js 14 does not support it.

            // Check for email verification code
            try {
                logger.info('Checking for email verification...');
                await page.waitForXPath('//*[contains(text(), "please enter the 6-digit code we sent")]');
                logger.info('Email verification found.');

                // Prompt user for code
                prompt.start();
                const result = await asyncPrompt(['code']);
                const code = result['code'];
                prompt.stop();

                // Enter code
                const first_input = await page.waitForXPath('(//input)[1]');
                await first_input.click();
                await page.keyboard.type(code);
                break;
            } catch (error) {
                if (error instanceof TimeoutError) {
                    logger.info('Email verification not found.');
                } else {
                    logger.error(error);
                }
            }

            // Check for 2FA code
            try {
                logger.info('Checking for 2FA verification...');
                await page.waitForXPath('//*[contains(text(), "Enter the code found in your authenticator app")]');
                logger.info('2FA verification found.');

                // Prompt user for code
                prompt.start();
                const result = await asyncPrompt(['code']);
                const code = result['code'];
                prompt.stop();

                // Enter code
                const first_input = await page.waitForXPath('(//input[@type="text"])');
                await first_input.click();
                await page.keyboard.type(code);

                // Click submit
                const button = await page.waitForXPath('//button[@target="submit_button"]');
                await button.click();

                break;
            } catch (error) {
                if (error instanceof TimeoutError) {
                    logger.info('2FA verification not found.');
                } else {
                    logger.error(error);
                }
            }

            logger.info('No extra verification found!');
            break;
        }
    }

    // Wait for redirect to main Twitch page. The timeout is unlimited here because we may be prompted for
    // additional authentication.
    await page.waitForNavigation({timeout: 0});

    const cookies = await page.cookies();

    page.off('close', onBrowserOrPageClosed);
    await page.close();

    return cookies;
}

async function asyncPrompt(schema) {
    return new Promise((resolve, reject) => {
        prompt.get(schema, (error, result) => {
            if (error) {
                reject(error);
            }
            resolve(result);
        });
    });
}

async function claimDrop(credentials, page, drop) {
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

async function getViewerCount(page){
    const element = await page.$('p[data-a-target="animated-channel-viewers-count"]');
    const property = await element.getProperty('innerText');
    const value = await property.jsonValue();
    return parseInt(value);
}

async function getUptime(page){
    const element = await page.$('span.live-time');
    const property = await element.getProperty('innerText');
    return await property.jsonValue();
}

async function watchStreamUntilDropCompleted(page, streamUrl, twitchCredentials, campaign, drop) {
    await page.goto(streamUrl);

    // Wait for the page to load completely (hopefully). This checks the video player container for any DOM changes and waits until there haven't been any changes for a few seconds.
    logger.info('Waiting for page to load...');
    const element = (await page.$x('//div[@data-a-player-state]'))[0]
    await waitUntilElementRendered(page, element);

    try {
        // Click "Accept mature content" button
        const acceptMatureContentButtonSelector = '[data-a-target="player-overlay-mature-accept"]';
        //await page.waitForSelector(acceptMatureContentButtonSelector);  // Probably don't need to wait since page should be fully loaded at this point
        await click(page, acceptMatureContentButtonSelector);
        logger.info('Accepted mature content');
    } catch (error) {
        // Ignore errors, the button is probably not there
    }

    try {
        await setLowestStreamQuality(page);
        logger.info('Set stream to lowest quality');
    } catch (error) {
        logger.error('Failed to set stream to lowest quality!');
        throw error;
    }

    let wasInventoryDropNull = false;

    const requiredMinutesWatched = drop['requiredMinutesWatched'];

    // Create progress bar
    const progressBar = new cliProgress.SingleBar(
        {
            stopOnComplete: true,
            format: 'Watching ' + streamUrl + ' | Viewers: {viewers} | Uptime: {uptime} |{bar}| {value} / {total} minutes'
        },
        cliProgress.Presets.shades_classic
    );
    progressBar.start(requiredMinutesWatched, 0, {'viewers': await getViewerCount(page), 'uptime': await getUptime(page)});

    // Check for drop progress
    let lastMinutesWatched = -1;
    while (true) {

        // Check drop progress
        const inventoryDrop = await twitch.getInventoryDrop(twitchCredentials, campaign['id'], drop['id']);

        // Check if the drop is not in our inventory yet. This can happen if we just started the campaign
        if (inventoryDrop == null) {

            // If the drop was null twice in a row, then something is wrong
            if (wasInventoryDropNull) {
                progressBar.stop();
                throw new NoProgressError('Drop was not found in your inventory! Either the campaign has ended or no progress is being made towards the drop.');
            }

            wasInventoryDropNull = true;
        } else {

            const currentMinutesWatched = inventoryDrop['self']['currentMinutesWatched'];
            progressBar.update(currentMinutesWatched, {'viewers': await getViewerCount(page), 'uptime': await getUptime(page)});

            // Check if we have completed the drop
            if (currentMinutesWatched >= requiredMinutesWatched) {
                progressBar.stop();
                return;
            }

            // Make sure drop progress has increased. If it hasn't, then something is wrong.
            if (currentMinutesWatched <= lastMinutesWatched) {
                progressBar.stop();
                throw new NoProgressError();
            }

            lastMinutesWatched = currentMinutesWatched;

        }

        // Sleep 2 minutes. This should guarantee that at least 1 minute has passed since we last checked the stream progress.
        await page.waitForTimeout(1000 * 60 * 2);
    }
}

async function click(page, selector) {
    return page.evaluate((selector) => {
        document.querySelector(selector).click();
    }, selector);
}

async function setLowestStreamQuality(page) {
    const settingsButtonSelector = '[data-a-target="player-settings-button"]';
    await page.waitForSelector(settingsButtonSelector);
    await click(page, settingsButtonSelector);

    const qualityButtonSelector = '[data-a-target="player-settings-menu-item-quality"]';
    await page.waitForSelector(qualityButtonSelector);
    await click(page, qualityButtonSelector);

    await click(page, 'div[data-a-target="player-settings-menu"]>div:last-child input');
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

async function processCampaign(page, campaign, twitchCredentials) {
    // Get all drops for this campaign
    const details = await twitch.getDropCampaignDetails(twitchCredentials, campaign['id']);
    const drops = details['timeBasedDrops'];

    for (const drop of drops) {
        logger.info('Drop: ' + drop['benefitEdges'][0]['benefit']['name']);

        // Check if we already claimed this drop
        if (await isDropClaimed(twitchCredentials, drop)) {
            logger.info('Drop already claimed');
            continue;
        }

        // Check if this drop has expired
        if (new Date() > new Date(Date.parse(drop['endAt']))){
            logger.info('Drop expired!');
            continue;
        }

        // Check if this drop is ready to be claimed
        const inventoryDrop = await twitch.getInventoryDrop(twitchCredentials, campaign['id'], drop['id']);
        if (inventoryDrop != null) {
            if (inventoryDrop['self']['currentMinutesWatched'] >= inventoryDrop['requiredMinutesWatched']) {
                await claimDrop(twitchCredentials, page, inventoryDrop);
                continue;
            }
        }

        const failures = {};

        const failedStreams = new Set();

        while (true) {

            // Get a list of active streams that have drops enabled
            let streams = await twitch.getDropEnabledStreams(twitchCredentials, campaign['game']['displayName']);

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
                await watchStreamUntilDropCompleted(page, streamUrl, twitchCredentials, campaign, drop);
            } catch (error) {
                if (error instanceof NoProgressError) {
                    logger.warn('No progress was made since last update!');
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
            await claimDrop(twitchCredentials, page, await twitch.getInventoryDrop(twitchCredentials, campaign['id'], drop['id']));

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

// Options defined here can be configured in either the config file or as command-line arguments
const options = [
    {
        name: '--username',
        alias: '-u'
    },
    {
        name: '--password',
        alias: '-p'
    },
    {
        name: '--browser',
        default: () => {
            switch (process.platform) {
                case "win32":
                    return path.join("C:", "Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe");

                case "linux":
                    return path.join("google-chrome");

                default:
                    return '';
            }
        }
    },
    {
        name: '--games',
        default: [],
        parse: (x) => {
            return x.split(',').filter(x => x.length > 0);
        }
    },
    {
        name: '--headless',
        default: true,
        parse: (x) => {
            return x === 'true';
        }
    },
    {
        name: '--headless-login',
        default: false,
        argparse: {
            action: 'store_true',
        },
        parse: (x) => {
            return x === 'true';
        }
    },
    {
        name: '--interval',
        default: 15,
        argparse: {
            type: 'int'
        },
        parse: (x) => {
            return parseInt(x);
        }
    },
    {
        name: '--browser-args',
        default: [],
        parse: (x) => {
            return x.split(',').filter(x => x.length > 0);
        }
    }
]

// Parse arguments
const parser = new ArgumentParser();
parser.add_argument('--config', '-c', {default: 'config.json'});
for (const option of options) {
    if (option['alias']) {
        parser.add_argument(option['name'], option['alias'], option['argparse'] || {});
    } else {
        parser.add_argument(option['name'], option['argparse'] || {});
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
            const defaultValue = option['default'];
            if (typeof defaultValue === 'function') {
                config[key] = defaultValue();
            } else {
                config[key] = defaultValue;
            }
        }
    } else {
        const parse = option['parse'];
        if (parse === undefined) {
            config[key] = args[key];
        } else {
            config[key] = parse(args[key]);
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
    const cookiesPath = './cookies.json';
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

        const cookies = await login(config, loginBrowser);
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

    const completedCampaignIds = new Set();
    while (true) {

        // Update drop campaigns
        logger.info('Updating drop campaigns...');
        const campaigns = (await twitch.getDropCampaigns(twitchCredentials)).filter(campaign => {
            return campaign['status'] === 'ACTIVE';
        });
        logger.info('Found ' + campaigns.length + ' active campaigns.');

        // Add to pending
        const pending = new FastPriorityQueue((a, b) => {
            const indexA = config['games'].indexOf(a['game']['id']);
            const indexB = config['games'].indexOf(b['game']['id']);
            if (indexA === -1 && indexB !== -1) {
                return false;
            } else if (indexA !== -1 && indexB === -1) {
                return true;
            }
            return indexA < indexB;
        });
        campaigns.forEach(campaign => {
            if ((config['games'].length === 0 || config['games'].includes(campaign['game']['id'])) && !completedCampaignIds.has(campaign['id'])) {
                pending.add(campaign);
            }
        });
        logger.info('Found ' + pending.size + ' pending campaigns.');
        pending.forEach((value, index) => {
            logger.info(index + ') ' + value['game']['displayName'] + ' ' + value['name']);
        });

        while (!pending.isEmpty()) {

            // Get campaign from queue
            const campaign = pending.poll();
            logger.info('Processing campaign: ' + campaign['game']['displayName'] + ' ' + campaign['name']);

            // Make sure Twitch account is linked
            if (!campaign['self']['isAccountConnected']) {
                logger.warn('Twitch account not linked! Skipping this campaign.');
                continue;
            }

            try {
                await processCampaign(page, campaign, twitchCredentials);
                completedCampaignIds.add(campaign['id']);
            } catch (error) {
                if (error instanceof NoStreamsError) {
                    logger.info('No streams!');
                } else {
                    logger.error(error);
                }
            }
        }

        logger.info('Sleeping for ' + config['interval'] + ' minutes...');
        await sleep(1000 * 60 * config['interval']);
    }

})().catch(error => {
    logger.error(error);
    process.exit(1);
}).finally(() => {
    process.exit(0);
});