'use strict';

const fs = require('fs');

const twitch = require('./twitch');

// Using puppeteer-extra to add plugins
const puppeteer = require('puppeteer-extra');

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

async function login(page, username, password) {
    await page.goto('https://www.twitch.tv/login');

    // Enter username
    await page.focus('#login-username');
    await page.keyboard.type(username);

    // Enter password
    await page.focus('#password-input');
    await page.keyboard.type(password);

    // Login
    await page.click('[data-a-target="passport-login-button"]');
    await page.waitForNavigation();
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

    await page.waitForTimeout(5000);  // TODO: setLowestStreamQuality doesnt work right away for some reason, waiting a few seconds seems to work for now
    console.log('Setting stream quality to lowest available...');
    await setLowestStreamQuality(page);

    let wasInventoryDropNull = false;

    // Check for drop progress
    let lastMinutesWatched = -1;
    while (true) {

        // Check drop progress
        const inventoryDrop = await getInventoryDrop(twitchCredentials, campaign['id'], drop['id']);

        // Check if the drop is not in our inventory yet. This can happen if we just started the campaign
        if (inventoryDrop == null) {

            // If the drop was null twice in a row, then something is wrong
            if (wasInventoryDropNull) {
                throw new Error('Drop was still null after sleep!');
            }

            wasInventoryDropNull = true;
        } else {

            const currentMinutesWatched = inventoryDrop['self']['currentMinutesWatched'];
            const requiredMinutesWatched = inventoryDrop['requiredMinutesWatched'];
            console.log('Progress:', currentMinutesWatched, '/', requiredMinutesWatched, 'minutes.');

            // Check if we have completed the drop
            if (currentMinutesWatched >= requiredMinutesWatched) {
                console.log('Drop completed!');
                return;
            }

            // Make sure drop progress has increased. If it hasn't, then something is wrong.
            if (currentMinutesWatched <= lastMinutesWatched) {
                throw new NoProgressError();
            }

            lastMinutesWatched = currentMinutesWatched;

        }

        // Sleep for a few minutes
        await sleep(1000 * 60 * 2);
    }
}

async function setLowestStreamQuality(page) {
    await page.click('[data-a-target="player-settings-button"]');
    await page.click('[data-a-target="player-settings-menu-item-quality"]');
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
        console.log('Drop:', drop['name']);

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

        while (true) {

            // Get list of valid streams
            const streams = await twitch.getDropEnabledStreams(twitchCredentials, campaign['game']['displayName']);
            console.log('Found', streams.length, 'streams');

            // If there are no steams, try the next campaign
            if (streams.length === 0) {
                throw new NoStreamsError();
            }

            // Watch first stream
            const stream = streams[0];
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
                    break;
                }
                continue;
            }

            // Claim the drop
            await claimDrop(twitchCredentials, page, inventoryDrop);

            break;
        }

    }
}

(async () => {

    // Load config file
    const config = require('./config.json');

    // Start browser and open a new tab.
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: config['browser'],
        args: [
            '--mute-audio',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
        ]
    });
    const page = await browser.newPage();

    // Automatically stop this program if the browser is closed or page is closed
    const onBrowserOrPageClosed = () => {
        console.log('Browser was disconnected or tab was closed! Exiting...');
        process.exit(1);
    }
    browser.on('disconnected', onBrowserOrPageClosed);
    page.on('close', onBrowserOrPageClosed);

    // Load Twitch credentials
    const twitchCredentials = require('./credentials/twitch-bf.json'); // TODO: MUST DELETE COOKIES IF CHANGING ACCOUNT

    // Seems to be the default hard-coded client ID
    // Found in sources / static.twitchcdn.net / assets / minimal-cc607a041bc4ae8d6723.js
    twitchCredentials['client_id'] = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

    // Check if we have saved cookies
    const cookiesPath = './cookies.json';
    if (fs.existsSync(cookiesPath)) {

        // Restore cookies from previous session
        console.log('Restoring cookies from last session.')
        const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));
        await page.setCookie(...cookies);

    } else {

        // Login to Twitch
        console.log('Logging in to Twitch...');
        await login(page, twitchCredentials['username'], twitchCredentials['password']);
        console.log('Login successful.');

        // Save cookies for next time
        fs.writeFileSync(cookiesPath, JSON.stringify(await page.cookies()));
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

    while (true) {

        // Update drop campaigns
        console.log('Updating drop campaigns...');
        const campaigns = await getActiveDropCampaigns(twitchCredentials);
        console.log('Found', campaigns.length, 'active campaigns.');

        // Add to pending
        const pending = [];
        campaigns.forEach(campaign => {
            if (config['games'].includes(campaign['game']['id'])) {
                pending.push(campaign);
            }
        });
        console.log('Found', pending.length, 'pending campaigns.');

        while (pending.length > 0) {

            // Get campaign from queue
            const campaign = pending.pop();
            console.log('Processing campaign:', campaign['game']['displayName'], campaign['name']);

            // Make sure Twitch account is linked
            if (!campaign['self']['isAccountConnected']) {
                console.warn('Twitch account not linked! Skipping this campaign.');
                continue;
            }

            // Check campaign status
            switch (campaign['status']) {
                case 'UPCOMING':
                    console.log('This campaign is not active yet.');
                    pending.push(campaign);
                    continue;

                case 'EXPIRED':
                    console.log('This campaign has expired.');
                    break;
            }

            try {
                await processCampaign(page, campaign, twitchCredentials);
            } catch (error) {
                if (error instanceof NoStreamsError) {
                    console.log('No streams!');
                } else {
                    console.log('Error:', error);
                }
            }
        }

        console.log('Sleeping for a bit...');
        await sleep(1000 * 60 * 15);
    }

})().catch(error => {
    console.log(error);
    process.exit(1);
}).finally(() => {
    process.exit(0);
});