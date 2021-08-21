'use strict';

const fs = require('fs');
const {ArgumentParser} = require('argparse');
const path = require('path');
const prompt = require('prompt');

const cliProgress = require('cli-progress');

const FastPriorityQueue = require('fastpriorityqueue');

const twitch = require('./twitch');

// Using puppeteer-extra to add plugins
const puppeteer = require('puppeteer-extra');
const TimeoutError = require("puppeteer").errors.TimeoutError;

// Add stealth plugin
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const isEqual = require('lodash/isEqual');


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class NoStreamsError extends Error {

}

class NoProgressError extends Error {

}

function onBrowserOrPageClosed() {
    console.log('Browser was disconnected or tab was closed! Exiting...');
    process.exit(1);
}

async function getInventoryDrop(credentials, campaignId, dropId) {
    const campaigns = await twitch.getDropCampaignsInProgress(credentials);
    for (const campaign of campaigns) {
        if (campaign['id'] === campaignId) {
            const drops = campaign['timeBasedDrops'];
            for (const drop of drops) {
                if (drop['id'] === dropId) {
                    return drop;
                }
            }
        }
    }
    return null;
}

async function getActiveDropCampaigns(credentials) {
    const campaigns = await twitch.getDropCampaigns(credentials);
    return campaigns.filter(campaign => {
        return campaign['status'] === 'ACTIVE';
    });
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
                console.log('Checking for email verification...');
                await page.waitForXPath('//*[contains(text(), "please enter the 6-digit code we sent")]');
                console.log('Email verification found.');

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
                    console.log('Email verification not found.');
                } else {
                    console.error(error);
                }
            }

            // Check for 2FA code
            try {
                console.log('Checking for 2FA verification...');
                await page.waitForXPath('//*[contains(text(), "Enter the code found in your authenticator app")]');
                console.log('2FA verification found.');

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
                    console.log('2FA verification not found.');
                } else {
                    console.error(error);
                }
            }

            console.log('No extra verification found!');
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
    console.log('Claiming drop!');
    await twitch.claimDropReward(credentials, drop['self']['dropInstanceID']);
}

async function watchStreamUntilDropCompleted(page, streamUrl, twitchCredentials, campaign, drop) {
    await page.goto(streamUrl);

    try {
        // Click "Accept mature content" button
        await page.click('[data-a-target="player-overlay-mature-accept"]');
    } catch (error) {
        // Ignore errors
    }

    setLowestStreamQuality(page).catch((error) => {
        console.error('Failed to set stream to lowest quality!');
        console.error(error);
    });

    let wasInventoryDropNull = false;

    const requiredMinutesWatched = drop['requiredMinutesWatched'];

    // Create progress bar
    const progressBar = new cliProgress.SingleBar(
        {
            stopOnComplete: true,
            format: 'Watching stream |{bar}| {percentage}% | {value} / {total} minutes | Remaining: {remaining} minutes'
        },
        cliProgress.Presets.shades_classic
    );
    progressBar.start(requiredMinutesWatched, 0, {'remaining': requiredMinutesWatched});

    // Check for drop progress
    let lastMinutesWatched = -1;
    while (true) {

        // Check drop progress
        const inventoryDrop = await getInventoryDrop(twitchCredentials, campaign['id'], drop['id']);

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
            progressBar.update(currentMinutesWatched, {'remaining': requiredMinutesWatched - currentMinutesWatched});

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

        // Sleep for a few minutes
        await sleep(1000 * 60 * 2);
    }
}

async function setLowestStreamQuality(page) {
    const settingsButtonSelector = '[data-a-target="player-settings-button"]';
    await page.waitForSelector(settingsButtonSelector);
    await page.click(settingsButtonSelector);
    const qualityButtonSelector = '[data-a-target="player-settings-menu-item-quality"]';
    await page.waitForSelector(qualityButtonSelector);
    await page.click(qualityButtonSelector);
    //await page.click('div[data-a-target="player-settings-menu"]>div:last-child input');
    await page.evaluate(() => {  // This is a workaround for the commented line above, which causes "Node is either not visible or not an HTMLElement" error.
        document.querySelector('div[data-a-target="player-settings-menu"]>div:last-child input').click();
    });
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
        console.log('Drop:', drop['benefitEdges'][0]['benefit']['name']);

        // Check if we already claimed this drop
        if (await isDropClaimed(twitchCredentials, drop)) {
            console.log('Drop already claimed');
            continue;
        }

        // Check if this drop is ready to be claimed
        const inventoryDrop = await getInventoryDrop(twitchCredentials, campaign['id'], drop['id']);
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
                return !failedStreams.has(stream);
            });

            console.log('Found', streams.length, 'active streams');

            // If there are no steams, try the next campaign
            if (streams.length === 0) {
                throw new NoStreamsError();
            }

            // Watch first stream
            const stream = streams[0]['url'];
            console.log('Watching stream:', stream);
            try {
                await watchStreamUntilDropCompleted(page, stream, twitchCredentials, campaign, drop);
            } catch (error) {
                if (error instanceof NoProgressError) {
                    console.log('No progress was made since last update!');
                } else {
                    console.log('ERROR:', error);
                }

                if (!(stream in failures)) {
                    failures[stream] = 0;
                }
                failures[stream]++;

                if (failures[stream] >= 3) {
                    console.log('Stream failed too many times. Giving up...')
                    failedStreams.add(stream);
                }
                continue;
            }

            // Claim the drop
            await claimDrop(twitchCredentials, page, await getInventoryDrop(twitchCredentials, campaign['id'], drop['id']));

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

function overrideConfigurationWithArguments(config, args) {
    const override = (key, modifier = (x) => x) => {
        if (args[key] !== undefined) {
            config[key] = modifier(args[key]);
        }
    }
    override('username');
    override('password');
    override('headless_login');
    override('headful');
    override('interval');
    override('browser_args', (x) => x.split(',').filter(x => x.length > 0));
}

function loadConfigFile(file_path) {
    console.log('Loading config file:', file_path);

    // Load config from file if it exists
    let config = {};
    if (fs.existsSync(file_path)){
        try {
            config = JSON.parse(fs.readFileSync(file_path, {encoding: 'utf-8'}));
        } catch (error) {
            console.error('Failed to read config file!');
            console.error(error);
            process.exit(1);
        }
    } else {
        console.warn('Config file does not exist! Creating a default...');
    }

    // Save a copy of the config to compare changes later
    const config_before = JSON.parse(JSON.stringify(config));

    // Should the process exit with an error after saving the updated config (in case some values are invalid)
    let exitAfterSave = false;

    // Browser
    let browser_path = config['browser'];
    if (browser_path === undefined) {
        switch (process.platform) {
            case "win32":
                browser_path = path.join("C:", "Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe");
                break;

            case "linux":
                browser_path = path.join("google-chrome");
                break;

            default:
                browser_path = '';
                break;
        }
    }
    config['browser'] = browser_path;

    const setIfUndefined = (key, value) => {
        if (config[key] === undefined) {
            config[key] = value;
        }
    }

    // If no games are specified, an empty list represents all games
    setIfUndefined('games', []);

    // Interval
    setIfUndefined('interval', 15);

    // Save config if different
    if (!isEqual(config_before, config)){
        fs.writeFileSync(file_path, JSON.stringify(config));
        console.log('Config saved to', file_path);
    }

    if (exitAfterSave){
        process.exit(1);
    }

    return config;
}

(async () => {

    // Parse arguments
    const parser = new ArgumentParser();
    parser.add_argument('--config', '-c', {default: 'config.json'});
    parser.add_argument('--username', '-u');
    parser.add_argument('--password', '-p');
    parser.add_argument('--headless-login', {default: false, action: 'store_true'});
    parser.add_argument('--headful', {default: false, action: 'store_true'});
    parser.add_argument('--interval', {type: 'int'});
    parser.add_argument('--browser-args');
    const args = parser.parse_args();

    // Load config file
    const config = loadConfigFile(args['config']);

    // Override config with command line arguments
    overrideConfigurationWithArguments(config, args);

    if (args['headless_login'] && args['headful']){
        parser.error('You cannot use headless-login and headful at the same time!');
    }

    if (args['headless_login'] && (config['username'] === undefined || config['password'] === undefined)) {
        parser.error("You must provide a username and password to use headless login!");
        process.exit(1);
    }

    // Make username lowercase
    if (config.hasOwnProperty('username')) {
        config['username'] = config['username'].toLowerCase();
    }

    if (config['browser_args'] === undefined){
        config['browser_args'] = [];
    }

    // Add required browser args
    const requiredBrowserArgs = [
        '--mute-audio',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
    ]
    for (const arg of requiredBrowserArgs){
        if (!config['browser_args'].includes(arg)){
            config['browser_args'].push(arg);
        }
    }

    // Start browser and open a new tab.
    const browser = await puppeteer.launch({
        headless: !config['headful'],
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
            console.log('Restoring cookies from last session.');
            await page.setCookie(...cookies);

        } else {

            // Saved cookies are invalid, let's delete them
            console.log('Saved cookies are invalid.')
            fs.unlinkSync(cookiesPath);

            // We need to login again
            requireLogin = true;

        }

    } else {
        requireLogin = true;
    }

    if (requireLogin) {
        console.log('Logging in...');

        // Check if we need to create a new headful browser for the login
        let loginBrowser = browser;
        if (!config['headful'] && !config['headless_login']){
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
                console.log('Logged in as', cookie['value']);
                break;
        }
    }

    const completedCampaigns = new Set();
    while (true) {

        // Update drop campaigns
        console.log('Updating drop campaigns...');
        const campaigns = await getActiveDropCampaigns(twitchCredentials);
        console.log('Found', campaigns.length, 'active campaigns.');

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
            if ((config['games'].length === 0 || config['games'].includes(campaign['game']['id'])) && !completedCampaigns.has(campaign['id'])) {
                pending.add(campaign);
            }
        });
        console.log('Found', pending.size, 'pending campaigns.');
        pending.forEach((value, index) => {
            console.log(index + ')', value['game']['displayName'], value['name']);
        });

        while (!pending.isEmpty()) {

            // Get campaign from queue
            const campaign = pending.poll();
            console.log('Processing campaign:', campaign['game']['displayName'], campaign['name']);

            // Make sure Twitch account is linked
            if (!campaign['self']['isAccountConnected']) {
                console.warn('Twitch account not linked! Skipping this campaign.');
                continue;
            }

            try {
                await processCampaign(page, campaign, twitchCredentials);
                completedCampaigns.add(campaign['id']);
            } catch (error) {
                if (error instanceof NoStreamsError) {
                    console.log('No streams!');
                } else {
                    console.log('Error:', error);
                }
            }
        }

        console.log('Sleeping for', config['interval'], 'minutes...');
        await sleep(1000 * 60 * config['interval']);
    }

})().catch(error => {
    console.error(error);
    process.exit(1);
}).finally(() => {
    process.exit(0);
});