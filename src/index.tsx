import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import url from "node:url";

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

import {render} from "ink";
import React from "react";
import cliProgress from "cli-progress";

const {BarFormat} = cliProgress.Format;

import logger from './logger.js';
import {getDropBenefitNames, TimeBasedDrop} from './twitch.js';
import {StringOption, BooleanOption, IntegerOption, StringListOption, JsonOption} from './options.js';
import {TwitchDropsBot} from './twitch_drops_bot.js';
import {ConfigurationParser} from './configuration_parser.js';
import {LoginPage} from "./pages/login.js";
import {Application} from "./ui/ui.js";
import {compareVersionString, getLatestDevelopmentVersion, getLatestReleaseVersion} from "./utils.js";
import {transports} from "winston";

// Load version number from package.json
let VERSION = "unknown";
try {
    const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"), {encoding: "utf-8"}));
    VERSION = pkg["version"] ?? "unknown";
} catch (error) {
    logger.error("Cannot read version");
}

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

function isInsideDocker(): boolean {
    return fs.existsSync("/.dockerenv");
}

function startProgressBarMode(bot: TwitchDropsBot, config: Config) {

    async function checkVersion() {
        logger.debug("checking for updates...");

        // Get the latest release version
        const latest = await getLatestReleaseVersion();
        logger.debug("latest release version: " + latest);
        if (compareVersionString(VERSION, latest) == -1) {
            logger.info(ansiEscape("35m") + "A newer release of Twitch-Drops-Bot is available on GitHub! " + VERSION + " -> " + latest + ansiEscape("39m"));
            return;
        }

        // Get the latest development version
        if (config.updates.type === "dev") {
            // The current commit SHA hash comes from the environment variable provided during the docker build
            const currentCommitSha = process.env.GIT_COMMIT_HASH;

            // If the current commit SHA hash is undefined, then we are likely not running from a docker container
            if (currentCommitSha === undefined) {
                return;
            }

            const latestCommitSha = await getLatestDevelopmentVersion();
            logger.debug("latest dev version: " + latestCommitSha);

            // Warn the user if the current version is different from the latest version
            if (currentCommitSha !== latestCommitSha) {
                logger.info(ansiEscape("35m") + "A newer development version of Twitch-Drops-Bot is available! Use `docker pull ghcr.io/tychothetaco/twitch-drops-bot:latest` to get the latest version." + ansiEscape("39m"));
            }
        }
    }

    // Check for updates
    if (config.updates.enabled) {
        const checkForUpdates = () => {
            checkVersion().catch((error) => {
                logger.debug("Failed to check for updates.");
                logger.debug(error);
            }).finally(() => {
                logger.debug("Done checking for updates");
            });
            setTimeout(checkForUpdates, 1000 * 60 * 60 * 24);
        }
        checkForUpdates();
    }

    let progressBar: any = null;
    let payload: any = null;
    let isFirstOutput: boolean = true;

    let isProgressBarStarted: boolean = false;

    const progressBarHeight: number = 3;

    function ansiEscape(code: string): string {
        return '\x1B[' + code;
    }

    const startProgressBar = (p = payload) => {
        payload = p;
        if (!isProgressBarStarted && progressBar !== null) {
            isProgressBarStarted = true;
            isFirstOutput = true;
            for (let i = 0; i < progressBarHeight; ++i) {
                process.stdout.write('\n');
            }
            process.stdout.write(ansiEscape(`${progressBarHeight}A`));
            progressBar.start(1, 0, p);
        }
    }

    const updateProgressBar = (p = payload) => {
        payload = p;
        if (progressBar !== null) {
            progressBar.update(0, p);
        }
    }

    const stopProgressBar = (clear: boolean = false) => {
        if (isProgressBarStarted) {
            isProgressBarStarted = false;
            progressBar.stop();
            for (let i = 0; i < progressBarHeight - 1; ++i) {
                process.stdout.write(ansiEscape(`1B`) + ansiEscape("2K"));
            }
            process.stdout.write(ansiEscape(`${progressBarHeight - 1}A`));
        }
        if (clear) {
            progressBar = null;
            payload = null;
        }
    }

    // Intercept logging messages to stop/start the progress bar
    const onBeforeLogMessage = () => {
        stopProgressBar();
    }
    const onAfterLogMessage = () => {
        startProgressBar();
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

    let currentDrop: TimeBasedDrop | null = null;
    let dropId: string | null = null;

    bot.on("drop_progress_updated", (drop => {
        currentDrop = drop;
        if (drop !== null && drop.id !== dropId) {
            dropId = drop.id;
            stopProgressBar();
            startProgressBar();
        }
    }));
    bot.on("watch_status_updated", data => {
        if (!isProgressBarStarted && progressBar === null) {
            progressBar = new cliProgress.SingleBar(
                {
                    barsize: 20,
                    clearOnComplete: true,
                    stream: process.stdout,
                    format: (options: any, params: any, payload: any) => {
                        let result = 'Watching ' + payload['stream_url'] + ` | Viewers: ${payload['viewers']} | Uptime: ${payload['uptime']}` + ansiEscape('0K') + '\n';

                        const drop = currentDrop;
                        if (drop) {
                            progressBar.setTotal(drop.requiredMinutesWatched);
                            const campaign = bot.getDatabase().getDropCampaignByDropId(drop.id);
                            if (campaign) {
                                result += `${ansiEscape("36m")}${campaign.game.name ?? campaign.game.displayName}${ansiEscape("39m")} | ${ansiEscape("35m")}${campaign.name}${ansiEscape("39m")}\n`;
                            } else {
                                result += '\n'
                            }
                            result += `${getDropBenefitNames(drop)} ${BarFormat((drop.self.currentMinutesWatched ?? 0) / drop.requiredMinutesWatched, options)} ${drop.self.currentMinutesWatched ?? 0} / ${drop.requiredMinutesWatched} minutes` + ansiEscape('0K') + '\n';
                        } else {
                            result += `- No Drops Active -\n\n`;
                        }

                        if (isFirstOutput) {
                            return result;
                        }

                        return ansiEscape(`${progressBarHeight}A`) + result;
                    }
                },
                cliProgress.Presets.shades_classic
            );
            progressBar.on('redraw-post', () => {
                isFirstOutput = false;
            });
            startProgressBar(data);
        } else if (data === null) {
            stopProgressBar(true);
        } else {
            updateProgressBar(data);
        }
    });
    bot.on("drop_claimed", (dropId: string) => {
        const drop = bot.getDatabase().getDropById(dropId);
        if (!drop) {
            return;
        }
        logger.info(ansiEscape("32m") + "Claimed drop: " + getDropBenefitNames(drop) + ansiEscape("39m"));
    });
    bot.on("stop_watching_stream", (watchTimeMs: number) => {
        logger.info(ansiEscape("36m") + "Watched stream for " + Math.floor(watchTimeMs / 1000 / 60) + " minutes" + ansiEscape("39m"));
    });

}

function startUiMode(bot: TwitchDropsBot, config: Config) {
    process.stdout.write("\x1b[?1049h");
    process.on("exit", () => {
        process.stdout.write("\x1b[?1049l");
    });
    logger.transports[0].silent = true;

    render(<Application bot={bot} username={config.username} version={VERSION} config={config}/>);
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
    new BooleanOption("--do-version-check", false, {defaultValue: true}),
    new JsonOption<{ enabled: boolean }>("--tui", {defaultValue: {enabled: false}}),
    new JsonOption<{
        type: "release" | "dev",
        enabled: boolean,
        //schedule: string
    }>("--updates", {
        defaultValue: {
            type: "release",
            enabled: true,
            //schedule: "1"
        }
    }),
    new JsonOption<{
        enabled: boolean,
        file?: string,
        level: string
    }>("--logging", {
        defaultValue: {
            enabled: true,
            file: undefined,
            level: 'debug'
        }
    })
];

export interface Config {
    username: string,
    password?: string,
    browser: string,
    games: string[],
    headless: boolean,
    headless_login: boolean,
    interval: number,
    load_timeout_secs: number,
    failed_stream_retry: number,
    failed_stream_timeout: number,
    browser_args: string[],
    watch_unlisted_games: boolean,
    hide_video: boolean,
    cookies_path: string,
    show_account_not_linked_warning: boolean,
    ignored_games: string[],
    attempt_impossible_campaigns: boolean,
    watch_streams_when_no_drop_campaigns_active: boolean,
    broadcasters: string[],
    tui: {
        enabled: boolean
    },
    updates: {
        type: "release" | "dev",
        enabled: boolean,
        //schedule: string //todo: implement this
    },
    logging: {
        enabled: boolean,
        file: string,
        level: string
    }
}

async function main() {
    // Parse arguments
    const configurationParser = new ConfigurationParser(options);
    let config: Config = configurationParser.parse() as Config;

    // Add file transport to logger
    if (config.logging.enabled) {
        // TODO: validate input
        const level = config.logging.level;

        const fileName = config.logging.file ?? `log-${new Date().getTime()}.txt`;
        logger.add(new transports.File({
            filename: fileName,
            level: level,
            options: {
                flags: 'w' // Overwrite file
            }
        }));
    }

    // Log the current time
    logger.debug("current system time: " + new Date());

    // todo: move this into a validation step in the config parser
    if (!["release", "dev"].includes(config.updates.type)) {
        logger.error("Invalid update type: " + config.updates.type);
        process.exit(1);
    }

    logger.debug(`git commit hash: ${process.env.GIT_COMMIT_HASH}`);

    // Add default browser args
    const defaultBrowserArgs = [
        '--mute-audio',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--window-size=1920,1080'
    ];

    function getArgNames(args: string[]) {
        const names: string[] = [];
        for (const arg of args) {
            names.push(arg.split("=")[0]);
        }
        return names;
    }

    const argNames = getArgNames(config["browser_args"]);
    for (const arg of defaultBrowserArgs) {
        const argName = arg.split("=")[0];
        if (!argNames.includes(argName)) {
            config['browser_args'].push(arg);
        }
    }

    // Check if we are running inside a Docker container
    if (isInsideDocker()) {

        const requiredBrowser = "chromium";
        const actualBrowser = config["browser"];
        if (actualBrowser !== requiredBrowser) {
            logger.warn("Overriding browser option because we are inside a docker container!");
            config["browser"] = requiredBrowser;
        }

        const requiredHeadlessLogin = true;
        const actualHeadlessLogin = config["headless_login"];
        if (actualHeadlessLogin !== requiredHeadlessLogin) {
            logger.warn("Overriding headless_login option because we are inside a docker container!");
            config["headless_login"] = requiredHeadlessLogin;
        }

        const requiredBrowserArgs = ["--no-sandbox"]
        const actualBrowserArgs = config["browser_args"];
        const actualBrowserArgsNames = getArgNames(actualBrowserArgs);
        for (const arg of requiredBrowserArgs) {
            const argName = arg.split("=")[0];
            if (!actualBrowserArgsNames.includes(argName)) {
                logger.warn("Adding browser option: " + arg + " because we are inside a docker container!");
                config["browser_args"].push(arg);
            }
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

    // Start browser and open a new tab.
    const browser = await puppeteer.launch({
        headless: config['headless'],
        executablePath: config['browser'],
        args: config['browser_args']
    });

    // Automatically stop this program if the browser or page is closed
    browser.on('disconnected', onBrowserOrPageClosed);

    // Check if we have saved cookies
    let cookiesPath = config['cookies_path'] || (config['username'] ? `./cookies-${config['username']}.json` : null);
    let requireLogin = false;
    let cookies = null;
    if (cookiesPath && fs.existsSync(cookiesPath)) {

        // Load cookies
        cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));

        // Make sure these cookies are valid
        if (areCookiesValid(cookies)) {

            // If both cookies and a username are provided and the provided username does not match the username stored in the cookies, warn the user and prefer to use the one from the cookies.
            const username = config['username'];
            if (username && (username !== getUsernameFromCookies(cookies))) {
                logger.warn('Provided username does not match the one found in the cookies! Using the cookies to login...');
            }

            // Restore cookies from previous session
            logger.info('Restoring cookies from last session.');

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

        const loginPage = new LoginPage(await loginBrowser.newPage());
        cookies = await loginPage.login(config['username'], config['password'], config['headless_login'], config['load_timeout_secs']);

        if (needNewBrowser) {
            await loginBrowser.close();
        }
    }

    // Get some data from the cookies
    for (const cookie of cookies) {
        switch (cookie['name']) {
            case 'login':
                config['username'] = cookie['value'];
                logger.info('Logged in as ' + cookie['value']);
                break;
        }
    }

    // Save cookies
    if (requireLogin) {
        cookiesPath = `./cookies-${config['username']}.json`;
        fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 4));
        logger.info('Saved cookies to ' + cookiesPath);
    }

    const bot = await TwitchDropsBot.create(browser, cookies, {
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

    if (config.tui.enabled) {
        startUiMode(bot, config);
    } else {
        startProgressBarMode(bot, config);
    }

    await bot.start();
}

// Check if this file is being run directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        logger.error(error);
        process.exit(1);
    });
}
