'use strict';

import fs from 'fs';
import path from 'path';

import axios from "axios";

import logger from './logger';
import twitch from './twitch';
import {StringOption, BooleanOption, IntegerOption, StringListOption} from './options';
import {TwitchDropsBot} from './twitch_drops_bot';
import {ConfigurationParser} from './configuration_parser';

// Using puppeteer-extra to add plugins
import puppeteer from 'puppeteer-extra';

// Add stealth plugin
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

function onBrowserOrPageClosed() {
    logger.info('Browser was disconnected or tab was closed! Exiting...');
    process.exit(1);
}

function getUsernameFromCookies(cookies: any) {
    for (const cookie of cookies) {
        if (cookie['name'] === 'name' || cookie['name'] === 'login') {
            return cookie['value'];
        }
    }
}

function areCookiesValid(cookies: any) {
    let isOauthTokenFound = false;
    for (const cookie of cookies) {
        // Check if we have an OAuth token
        if (cookie['name'] === 'auth-token') {
            isOauthTokenFound = true;
        }
    }
    return isOauthTokenFound;
}

// Options defined here can be configured in either the config file or as command-line arguments
const options = [
    new StringOption('--username', {alias: '-u'}),
    new StringOption('--password', {alias: '-p'}),
    new StringOption('--browser', {
        alias: '-b',
        defaultValue: () => {
            switch (process.platform) {
                case "win32":
                    const pathNative = path.join("C:", "Program Files", "Google", "Chrome", "Application", "chrome.exe");
                    const path32bit = path.join("C:", "Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe");
                    if (fs.existsSync(pathNative)) {
                        return pathNative;
                    } else if (fs.existsSync(path32bit)) {
                        return path32bit;
                    }
                    return pathNative;

                case "linux":
                    return path.join("google-chrome");

                case "darwin":  // macOS
                    return path.join("/", "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome");

                default:
                    return "";
            }
        }
    }),
    new StringListOption('--games', {alias: '-g'}),
    new BooleanOption('--headless', false, {defaultValue: true}),
    new BooleanOption('--headless-login'),
    new IntegerOption('--interval', {alias: '-i', defaultValue: 15}),
    new IntegerOption('--load-timeout-secs', {alias: '-t', defaultValue: 30}),
    new IntegerOption('--failed-stream-retry', {defaultValue: 3}),
    new IntegerOption('--failed-stream-timeout', {defaultValue: 30}),
    new StringListOption('--browser-args'),
    /*    new BooleanOption('--update-games', null, false), TODO: auto update games.csv ? */
    new BooleanOption('--watch-unlisted-games'),
    new BooleanOption('--hide-video'),
    new StringOption('--cookies-path'),
    new StringOption('--log-level'),
    new BooleanOption('--show-account-not-linked-warning', false, {defaultValue: true, alias: '-sanlw'}),
    new StringListOption("--ignored-games"),
    new BooleanOption("--attempt-impossible-campaigns", false, {defaultValue: true}),
    new BooleanOption("--watch-streams-when-no-drop-campaigns-active", true, {alias: "-wswndca"}),
    new StringListOption("--broadcasters"),
    new BooleanOption("--do-version-check", false, {defaultValue: true})
];

// Parse arguments
const configurationParser = new ConfigurationParser(options);
let config: any = configurationParser.parse();

// Set logging level
if (config['log_level']) {
    // TODO: validate input
    logger.level = config['log_level'];
}

logger.debug(`git commit hash: ${process.env.GIT_COMMIT_HASH}`);

// Add required browser args
const requiredBrowserArgs = [
    '--mute-audio',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--window-size=1920,1080'
];
for (const arg of requiredBrowserArgs) {
    if (!config['browser_args'].includes(arg)) {
        config['browser_args'].push(arg);
    }
}

// Make username lowercase
if (config['username']) {
    config['username'] = config['username'].toLowerCase();
}

// Print config without password
const printableConfig = {...config};
printableConfig['password'] = config['password'] ? 'present' : undefined;
logger.debug('Using config: ' + JSON.stringify(printableConfig, null, 4));

async function checkVersion() {
    // The current commit SHA hash comes from the environment variable provided during the docker build
    const currentCommitSha = process.env.GIT_COMMIT_HASH;

    // If the current commit SHA hash is undefined, then we are likely not running from a docker container
    if (currentCommitSha === undefined) {
        return;
    }

    // Get the latest commit hash from the master branch
    const result = await axios.get("https://api.github.com/repos/tychothetaco/twitch-drops-bot/branches/master");
    const data = result.data;
    const latestCommitSha = data["commit"]["sha"];
    logger.debug("latestCommitSha: " + latestCommitSha);

    // Warn the user if the current version is different from the latest version
    if (currentCommitSha !== latestCommitSha) {
        logger.warn("A newer version of Twitch-Drops-Bot is available on GitHub! Use `docker pull ghcr.io/tychothetaco/twitch-drops-bot:latest` to get the latest version.");
    }
}

(async () => {

    if (config["do_version_check"]) {
        await checkVersion();
    }

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
    let cookiesPath = config['cookies_path'] || (config['username'] ? `./cookies-${config['username']}.json` : null);
    let requireLogin = false;
    if (fs.existsSync(cookiesPath)) {

        // Load cookies
        const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));

        // Make sure these cookies are valid
        if (areCookiesValid(cookies)) {

            // If both cookies and a username are provided and the provided username does not match the username stored in the cookies, warn the user and prefer to use the one from the cookies.
            const username = config['username'];
            if (username && (username !== getUsernameFromCookies(cookies))) {
                logger.warn('Provided username does not match the one found in the cookies! Using the cookies to login...');
            }

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

    let cookies = null;
    if (requireLogin) {
        logger.info('Logging in...');

        // Validate options
        if (config['headless_login'] && (config['username'] === undefined || config['password'] === undefined)) {
            logger.error("You must provide a username and password to use headless login!");
            process.exit(1);
        }

        // Check if we need to create a new headful browser for the login
        const needNewBrowser = config['headless'] && !config['headless_login'];
        let loginBrowser = browser;
        if (needNewBrowser) {
            loginBrowser = await puppeteer.launch({
                headless: false,
                executablePath: config['browser'],
                args: config['browser_args']
            });
        }

        cookies = await twitch.login(loginBrowser, config['username'], config['password'], config['headless_login'], config['load_timeout_secs']);
        await page.setCookie(...cookies);

        if (needNewBrowser) {
            await loginBrowser.close();
        }
    }

    // Get some data from the cookies
    let oauthToken: string | undefined = undefined;
    let channelLogin: string | undefined = undefined;
    for (const cookie of await page.cookies('https://www.twitch.tv')) {
        switch (cookie['name']) {
            case 'auth-token':  // OAuth token
                oauthToken = cookie['value'];
                break;

            case 'persistent':  // "channelLogin" Used for "DropCampaignDetails" operation
                channelLogin = cookie['value'].split('%3A')[0];
                break;

            case 'login':
                config['username'] = cookie['value'];
                logger.info('Logged in as ' + cookie['value']);
                break;
        }
    }

    if (!oauthToken || !channelLogin) {
        logger.error('Invalid cookies!');
        process.exit(1);
    }

    // Save cookies
    if (requireLogin) {
        cookiesPath = `./cookies-${config['username']}.json`;
        fs.writeFileSync(cookiesPath, JSON.stringify(cookies));
        logger.info('Saved cookies to ' + cookiesPath);
    }

    // Seems to be the default hard-coded client ID
    // Found in sources / static.twitchcdn.net / assets / minimal-cc607a041bc4ae8d6723.js
    const twitchClient = new twitch.Client('kimne78kx3ncx6brgo4mv6wki5h1ko', oauthToken, channelLogin);

    const bot = new TwitchDropsBot(page, twitchClient, {
        gameIds: config['games'],
        failedStreamBlacklistTimeout: config['failed_stream_timeout'],
        failedStreamRetryCount: config['failed_stream_retry'],
        dropCampaignPollingInterval: config['interval'],
        loadTimeoutSeconds: config['load_timeout_secs'],
        hideVideo: config['hide_video'],
        watchUnlistedGames: config['watch_unlisted_games'],
        showAccountNotLinkedWarning: config['show_account_not_linked_warning'],
        ignoredGameIds: config['ignored_games'],
        attemptImpossibleDropCampaigns: config['attempt_impossible_campaigns'],
        watchStreamsWhenNoDropCampaignsActive: config["watch_streams_when_no_drop_campaigns_active"],
        broadcasterIds: config["broadcasters"]
    });
    await bot.start();

})().catch(error => {
    logger.error(error);
    process.exit(1);
});
