'use strict'

const axios = require('axios')

// Using puppeteer-extra to add plugins
const puppeteer = require('puppeteer-extra');

// Add stealth plugin
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// Add Ad blocker
//const AdBlockerPlugin = require('puppeteer-extra-plugin-adblocker')
//puppeteer.use(AdBlockerPlugin())


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function watchStream(browser, cookies, url) {
    console.log('watch stream')
    const page = await browser.newPage();
    //await page.setViewport({width: 1920, height: 1080})
    await page.goto(url);
    await sleep(10000)
}

async function getDropProgress(drop) {

}

async function getDropCampaigns(credentials) {
    const response = await axios.post('https://gql.twitch.tv/gql',
        {
            'operationName': 'ViewerDropsDashboard',
            'extensions': {
                'persistedQuery': {
                    "version": 1,
                    "sha256Hash": "e8b98b52bbd7ccd37d0b671ad0d47be5238caa5bea637d2a65776175b4a23a64"
                }
            }
        },
        {
            headers: {
                'Content-Type': 'text/plain;charset=UTF-8',
                'Client-Id': credentials['client_id'],
                'Authorization': `OAuth ${credentials['oauth_token']}`
            }
        }
    );
    return response['data']['data']['currentUser']['dropCampaigns']
}

async function login(browser, username, password) {
    const page = await browser.newPage();
    await page.setViewport({width: 1920, height: 1080})
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

    // Save cookies so we don't have to login again
    const cookies = await page.cookies();

    // Close the tab
    page.close();

    return cookies;
}

(async () => {

    // Start browser
    const browser = await puppeteer.launch({headless: false});

    // Load Twitch credentials
    const twitchCredentials = require('./credentials/twitch-test.json');

    // Login to Twitch
    console.log('Logging in to Twitch...');
    const cookies = await login(browser, twitchCredentials['username'], twitchCredentials['password']);
    console.log('Login successful.');

    // Update drop campaigns
    const r = await getDropCampaigns(twitchCredentials);
    console.log('RESPONSE\n', r)

    //await getDropCampaigns(browser, cookies);

    await browser.close();
})();