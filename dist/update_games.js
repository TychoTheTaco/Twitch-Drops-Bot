'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("./logger"));
const twitch_1 = __importDefault(require("./twitch"));
const options_1 = require("./options");
const configuration_parser_1 = require("./configuration_parser");
// Using puppeteer-extra to add plugins
const puppeteer_extra_1 = __importDefault(require("puppeteer-extra"));
// Add stealth plugin
const puppeteer_extra_plugin_stealth_1 = __importDefault(require("puppeteer-extra-plugin-stealth"));
puppeteer_extra_1.default.use((0, puppeteer_extra_plugin_stealth_1.default)());
function onBrowserOrPageClosed() {
    logger_1.default.info('Browser was disconnected or tab was closed! Exiting...');
    process.exit(1);
}
function getUsernameFromCookies(cookies) {
    for (const cookie of cookies) {
        if (cookie['name'] === 'name' || cookie['name'] === 'login') {
            return cookie['value'];
        }
    }
}
function areCookiesValid(cookies) {
    let isOauthTokenFound = false;
    for (const cookie of cookies) {
        // Check if we have an OAuth token
        if (cookie['name'] === 'auth-token') {
            isOauthTokenFound = true;
        }
    }
    return isOauthTokenFound;
}
function updateGames(campaigns) {
    logger_1.default.info('Parsing games...');
    const gamesPath = './games.csv';
    const oldGames = fs_1.default
        .readFileSync(gamesPath, { encoding: 'utf-8' })
        .split('\r\n')
        .slice(1) // Ignore header row
        .filter(game => !!game)
        .map(game => game.split(','));
    const newGames = [
        ...oldGames,
        ...campaigns.map(campaign => [campaign['game']['displayName'], campaign['game']['id']])
    ];
    const games = newGames
        .filter((game, index) => newGames.findIndex(g => g[1] === game[1]) >= index)
        .sort((a, b) => a[0].localeCompare(b[0]));
    const toWrite = games
        .map(game => game.join(','))
        .join('\r\n');
    fs_1.default.writeFileSync(gamesPath, 'Name,ID\r\n' + toWrite + '\r\n', { encoding: 'utf-8' });
    logger_1.default.info('Games list updated');
}
// Options defined here can be configured in either the config file or as command-line arguments
const options = [
    new options_1.StringOption('--username', { alias: '-u' }),
    new options_1.StringOption('--password', { alias: '-p' }),
    new options_1.StringOption('--browser', {
        alias: '-b',
        defaultValue: () => {
            switch (process.platform) {
                case "win32":
                    return path_1.default.join("C:", "Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe");
                case "linux":
                    return path_1.default.join("google-chrome");
                default:
                    return '';
            }
        }
    }),
    new options_1.BooleanOption('--headless', false, { defaultValue: true }),
    new options_1.BooleanOption('--headless-login'),
    new options_1.StringListOption('--browser-args'),
    new options_1.StringOption('--cookies-path'),
    new options_1.StringOption('--log-level')
];
// Parse arguments
const configurationParser = new configuration_parser_1.ConfigurationParser(options);
let config = configurationParser.parse();
// Set logging level
if (config['log_level']) {
    // TODO: validate input
    logger_1.default.level = config['log_level'];
}
// Make username lowercase
if (config['username']) {
    config['username'] = config['username'].toLowerCase();
}
(() => __awaiter(void 0, void 0, void 0, function* () {
    // Start browser and open a new tab.
    const browser = yield puppeteer_extra_1.default.launch({
        headless: config['headless'],
        executablePath: config['browser'],
        args: config['browser_args']
    });
    const page = yield browser.newPage();
    // Automatically stop this program if the browser or page is closed
    browser.on('disconnected', onBrowserOrPageClosed);
    page.on('close', onBrowserOrPageClosed);
    // Check if we have saved cookies
    let cookiesPath = config['cookies_path'] || (config['username'] ? `./cookies-${config['username']}.json` : null);
    let requireLogin = false;
    if (fs_1.default.existsSync(cookiesPath)) {
        // Load cookies
        const cookies = JSON.parse(fs_1.default.readFileSync(cookiesPath, 'utf-8'));
        // Make sure these cookies are valid
        if (areCookiesValid(cookies)) {
            // If both cookies and a username are provided and the provided username does not match the username stored in the cookies, warn the user and prefer to use the one from the cookies.
            const username = config['username'];
            if (username && (username !== getUsernameFromCookies(cookies))) {
                logger_1.default.warn('Provided username does not match the one found in the cookies! Using the cookies to login...');
            }
            // Restore cookies from previous session
            logger_1.default.info('Restoring cookies from last session.');
            yield page.setCookie(...cookies);
        }
        else {
            // Saved cookies are invalid, let's delete them
            logger_1.default.info('Saved cookies are invalid.');
            fs_1.default.unlinkSync(cookiesPath);
            // We need to login again
            requireLogin = true;
        }
    }
    else {
        requireLogin = true;
    }
    let cookies = null;
    if (requireLogin) {
        logger_1.default.info('Logging in...');
        // Validate options
        if (config['headless_login'] && (config['username'] === undefined || config['password'] === undefined)) {
            console.error("You must provide a username and password to use headless login!");
            process.exit(1);
        }
        // Check if we need to create a new headful browser for the login
        const needNewBrowser = config['headless'] && !config['headless_login'];
        let loginBrowser = browser;
        if (needNewBrowser) {
            loginBrowser = yield puppeteer_extra_1.default.launch({
                headless: false,
                executablePath: config['browser'],
                args: config['browser_args']
            });
        }
        cookies = yield twitch_1.default.login(loginBrowser, config['username'], config['password'], config['headless_login']);
        yield page.setCookie(...cookies);
        if (needNewBrowser) {
            yield loginBrowser.close();
        }
    }
    // Get some data from the cookies
    let oauthToken = undefined;
    let channelLogin = undefined;
    for (const cookie of yield page.cookies('https://www.twitch.tv')) {
        switch (cookie['name']) {
            case 'auth-token': // OAuth token
                oauthToken = cookie['value'];
                break;
            case 'persistent': // "channelLogin" Used for "DropCampaignDetails" operation
                channelLogin = cookie['value'].split('%3A')[0];
                break;
            case 'login':
                config['username'] = cookie['value'];
                logger_1.default.info('Logged in as ' + cookie['value']);
                break;
        }
    }
    if (!oauthToken || !channelLogin) {
        logger_1.default.error('Invalid cookies!');
        process.exit(1);
    }
    // Save cookies
    if (requireLogin) {
        cookiesPath = `./cookies-${config['username']}.json`;
        fs_1.default.writeFileSync(cookiesPath, JSON.stringify(cookies));
        logger_1.default.info('Saved cookies to ' + cookiesPath);
    }
    // Seems to be the default hard-coded client ID
    // Found in sources / static.twitchcdn.net / assets / minimal-cc607a041bc4ae8d6723.js
    const twitchClient = new twitch_1.default.Client('kimne78kx3ncx6brgo4mv6wki5h1ko', oauthToken, channelLogin);
    updateGames(yield twitchClient.getDropCampaigns());
    browser.off('disconnected', onBrowserOrPageClosed);
    page.off('close', onBrowserOrPageClosed);
    yield browser.close();
}))().catch(error => {
    logger_1.default.error(error);
    process.exit(1);
});
