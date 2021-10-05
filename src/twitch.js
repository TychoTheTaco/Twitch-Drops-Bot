'use strict';
const fs = require('fs');

const axios = require('axios');
const TimeoutError = require("puppeteer").errors.TimeoutError;
const prompt = require('prompt');

const logger = require("./logger");
const utils = require('./utils');

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

async function getDropCampaignDetails(credentials, dropId) {
    const response = await axios.post('https://gql.twitch.tv/gql',
        {
            'operationName': 'DropCampaignDetails',
            'extensions': {
                'persistedQuery': {
                    "version": 1,
                    "sha256Hash": "14b5e8a50777165cfc3971e1d93b4758613fe1c817d5542c398dce70b7a45c05"
                }
            },
            'variables': {
                'dropID': dropId,
                'channelLogin': credentials['channel_login']
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
    return response['data']['data']['user']['dropCampaign']
}

async function getDropCampaignsInProgress(credentials) {
    const inventory = await getInventory(credentials);
    const campaigns = inventory['dropCampaignsInProgress'];
    if (campaigns === null) {
        return [];
    }
    return campaigns;
}

async function getInventory(credentials) {
    const response = await axios.post('https://gql.twitch.tv/gql',
        {
            'operationName': 'Inventory',
            'extensions': {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "9cdfc5ebf8ee497e49c5b922829d67e5bce039f3c713f0706d234944195d56ad"
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
    return response['data']['data']['currentUser']['inventory'];
}

async function getDropEnabledStreams(credentials, game) {
    const response = await axios.post('https://gql.twitch.tv/gql',
        {
            "operationName": "DirectoryPage_Game",
            "variables": {
                "name": game.toLowerCase(),
                "options": {
                    "includeRestricted": [
                        "SUB_ONLY_LIVE"
                    ],
                    "sort": "VIEWER_COUNT",
                    "recommendationsContext": {
                        "platform": "web"
                    },
                    "requestID": "JIRA-VXP-2397", // TODO: what is this for???
                    "tags": [
                        "c2542d6d-cd10-4532-919b-3d19f30a768b"  // "Drops enabled"
                    ]
                },
                "sortTypeIsRecency": false,
                "limit": 30
            },
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "d5c5df7ab9ae65c3ea0f225738c08a36a4a76e4c6c31db7f8c4b8dc064227f9e"
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
    const streams = response['data']['data']['game']['streams'];
    if (streams === null) {
        return [];
    }

    const result = [];
    for (const stream of streams['edges']) {
        result.push({
            'url': 'https://www.twitch.tv/' + stream['node']['broadcaster']['login'],
            'broadcaster_id': stream['node']['broadcaster']['id']
        });
    }
    return result;
}

async function claimDropReward(credentials, dropId) {
    const response = await axios.post('https://gql.twitch.tv/gql',
        {
            "operationName": "DropsPage_ClaimDropRewards",
            "variables": {
                "input": {
                    "dropInstanceID": dropId
                }
            },
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "2f884fa187b8fadb2a49db0adc033e636f7b6aaee6e76de1e2bba9a7baf0daf6"
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
    if ('errors' in response.data) {
        throw new Error(JSON.stringify(response.data['errors']));
    }
}

async function getInventoryDrop(credentials, campaignId, dropId) {
    const campaigns = await getDropCampaignsInProgress(credentials);
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

async function login(browser, username, password, headless = false) {
    const page = await browser.newPage();

    // Throw an error if the page is closed for any reason
    const onPageClosed = () => {
        throw new Error('Page closed!');
    }
    page.on('close', onPageClosed);

    // Go to login page
    await page.goto('https://www.twitch.tv/login');

    // Enter username
    if (username !== undefined) {
        await page.focus('#login-username');
        await page.keyboard.type(username);
    }

    // Enter password
    if (password !== undefined) {
        await page.focus('#password-input');
        await page.keyboard.type(password);
    }

    // Click login button
    if (username !== undefined && password !== undefined) {
        await page.click('[data-a-target="passport-login-button"]');
    }

    if (headless) {
        while (true) {

            // TODO: This loop and try/catch statements could be replaced with Promise.any(), but it seems that Node.js 14 does not support it.

            // Check for email verification code
            try {
                logger.info('Checking for email verification...');
                await page.waitForXPath('//*[contains(text(), "please enter the 6-digit code we sent")]');
                logger.info('Email verification found.');

                // Prompt user for code
                prompt.start();
                const result = await utils.asyncPrompt(['code']);
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
                const result = await utils.asyncPrompt(['code']);
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

            // Wait for redirect to main Twitch page. If this times out then there is probably a different type of verification that we haven't checked for.
            try {
                await page.waitForNavigation();
            } catch (error) {
                if (error instanceof TimeoutError){
                    const time = new Date().getTime();
                    const screenshotPath = 'failed-login-screenshot-' + time + '.png';
                    const htmlPath = 'failed-login-html-' + time + '.html';
                    logger.error('Failed to login. There was probably an extra verification step that this app didn\'t check for. ' +
                        'A screenshot of the page will be saved to ' + screenshotPath + ' and the page content will be saved to ' + htmlPath +
                        '. Please create an issue on GitHub with both of these files.');
                    await page.screenshot({
                        fullPage: true,
                        path: screenshotPath
                    });
                    fs.writeFileSync(htmlPath, await page.content());
                }
                throw error;
            }

            break;
        }
    } else {
        // Wait for redirect to main Twitch page. The timeout is unlimited here because we may be prompted for additional authentication.
        await page.waitForNavigation({timeout: 0});
    }

    const cookies = await page.cookies();

    page.off('close', onPageClosed);
    await page.close();

    return cookies;
}

module.exports = {
    getDropCampaigns,
    getDropCampaignDetails,
    getDropCampaignsInProgress,
    getDropEnabledStreams,
    getInventory,
    claimDropReward,
    getInventoryDrop,
    login
}