import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import url from "node:url";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

import {render} from "ink";
import React from "react";
import cliProgress from "cli-progress";

const {BarFormat} = cliProgress.Format;

import logger, {formatMessage} from "./logger.js";
import {Client, DropCampaign, getDropBenefitNames, TimeBasedDrop} from "./twitch.js";
import {StringOption, BooleanOption, IntegerOption, StringListOption, JsonOption} from "./options.js";
import {TwitchDropsBot} from "./twitch_drops_bot.js";
import {ConfigurationParser} from "./configuration_parser.js";
import {LoginPage} from "./pages/login.js";
import {Application} from "./ui/ui.js";
import {compareVersionString, getLatestDevelopmentVersion, getLatestReleaseVersion} from "./utils.js";
import {format, transports} from "winston";
import {DiscordWebhookSender} from "./notifiers/discord.js";
import {TransformableInfo} from "logform";
import stripAnsi from "strip-ansi";
import {TelegramNotifier} from "./notifiers/telegram.js";
import {CommunityPointsUserV1_PointsEarned} from "./web_socket_listener.js";
import {Event_CommunityPointsEarned_ClaimReason, EventMapType, EventName, Notifier} from "./notifiers/notifier.js";
import axios from "axios";

// Load version number from package.json
let VERSION = "unknown";
try {
    const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"), {encoding: "utf-8"}));
    VERSION = pkg["version"] ?? "unknown";
} catch (error) {
    logger.error("Cannot read version");
}

function onBrowserOrPageClosed() {
    logger.info("Browser was disconnected or tab was closed! Exiting...");
    process.exit(1);
}

function getUsernameFromCookies(cookies: any) {
    for (const cookie of cookies) {
        if (cookie["name"] === "name" || cookie["name"] === "login") {
            return cookie["value"];
        }
    }
}

function areCookiesValid(cookies: any) {
    let isOauthTokenFound = false;
    for (const cookie of cookies) {
        // Check if we have an OAuth token
        if (cookie["name"] === "auth-token") {
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
        };
        checkForUpdates();
    }

    let progressBar: any = null;
    let payload: any = null;
    let isFirstOutput: boolean = true;

    let isProgressBarStarted: boolean = false;

    const progressBarHeight: number = 3;

    function ansiEscape(code: string): string {
        return "\x1B[" + code;
    }

    const startProgressBar = (p = payload) => {
        payload = p;
        if (!isProgressBarStarted && progressBar !== null) {
            isProgressBarStarted = true;
            isFirstOutput = true;
            for (let i = 0; i < progressBarHeight; ++i) {
                process.stdout.write("\n");
            }
            process.stdout.write(ansiEscape(`${progressBarHeight}A`));
            progressBar.start(1, 0, p);
        }
    };

    const updateProgressBar = (p = payload) => {
        payload = p;
        if (progressBar !== null) {
            progressBar.update(0, p);
        }
    };

    const stopProgressBar = (clear: boolean = false) => {
        if (isProgressBarStarted) {
            isProgressBarStarted = false;
            progressBar.stop();
            for (let i = 0; i < progressBarHeight - 1; ++i) {
                process.stdout.write(ansiEscape("1B") + ansiEscape("2K"));
            }
            process.stdout.write(ansiEscape(`${progressBarHeight - 1}A`));
        }
        if (clear) {
            progressBar = null;
            payload = null;
        }
    };

    // Intercept logging messages to stop/start the progress bar
    const onBeforeLogMessage = () => {
        stopProgressBar();
    };
    const onAfterLogMessage = () => {
        startProgressBar();
    };
    for (const level of Object.keys(logger.levels)) {
        // @ts-ignore
        const og = logger[level];

        // @ts-ignore
        logger[level] = (args: any) => {
            onBeforeLogMessage();
            const result = og(args);
            onAfterLogMessage();
            return result;
        };
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
                    gracefulExit: false, // fixes too many sigint listeners
                    format: (options: any, params: any, payload: any) => {
                        let result = "Watching " + payload["stream_url"] + ` | Viewers: ${payload["viewers"]} | Uptime: ${payload["uptime"]}` + ansiEscape("0K") + "\n";

                        const drop = currentDrop;
                        if (drop) {
                            progressBar.setTotal(drop.requiredMinutesWatched);
                            const campaign = bot.getDatabase().getDropCampaignByDropId(drop.id);
                            if (campaign) {
                                result += `${ansiEscape("36m")}${campaign.game.name ?? campaign.game.displayName}${ansiEscape("39m")} | ${ansiEscape("35m")}${campaign.name}${ansiEscape("39m")}\n`;
                            } else {
                                result += ansiEscape("2K") + "\n";
                            }
                            result += `${getDropBenefitNames(drop)} ${BarFormat((drop.self.currentMinutesWatched ?? 0) / drop.requiredMinutesWatched, options)} ${drop.self.currentMinutesWatched ?? 0} / ${drop.requiredMinutesWatched} minutes` + ansiEscape("0K") + "\n";
                        } else {
                            result += ansiEscape("2K") + "- No Drops Active -\n";
                            result += ansiEscape("2K") + " \n";
                        }

                        if (isFirstOutput) {
                            return result;
                        }

                        return ansiEscape(`${progressBarHeight}A`) + result;
                    }
                },
                cliProgress.Presets.shades_classic
            );
            progressBar.on("redraw-post", () => {
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

    render(<Application bot={bot} version={VERSION} config={config}/>);
}

// Options defined here can be configured in either the config file or as command-line arguments
const options = [
    new StringOption("--username", {alias: "-u"}),
    new StringOption("--password", {alias: "-p"}),
    new StringOption("--auth-token"),
    new StringOption("--browser", {
        alias: "-b",
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
    new StringListOption("--games", {alias: "-g"}),
    new BooleanOption("--headless", false, {defaultValue: true}),
    new BooleanOption("--headless-login"),
    new IntegerOption("--interval", {alias: "-i", defaultValue: 15}),
    new IntegerOption("--load-timeout-secs", {alias: "-t", defaultValue: 30}),
    new IntegerOption("--failed-stream-retry", {defaultValue: 3}),
    new IntegerOption("--failed-stream-timeout", {defaultValue: 30}),
    new StringListOption("--browser-args"),
    /*    new BooleanOption('--update-games', null, false), TODO: auto update games.csv ? */
    new BooleanOption("--watch-unlisted-games"),
    new BooleanOption("--hide-video"),
    new StringOption("--cookies-path"),
    new StringOption("--log-level"),
    new BooleanOption("--show-account-not-linked-warning", false, {defaultValue: true, alias: "-sanlw"}),
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
            level: "info"
        }
    }),
    new JsonOption<{
        discord: DiscordNotifier[],
        telegram: TelegramNotifier[]
    }>("--notifications", {
        defaultValue: {
            discord: [],
            telegram: []
        }
    })
];

type ConfigEventMapType = {
    "new_drops_campaign"?: { games: "all" | "config" },
    "drop_claimed"?: { games: "all" | "config" },
    "community_points_earned"?: { reasons: Event_CommunityPointsEarned_ClaimReason[] },
    "drop_ready_to_claim"?: {},
}

interface DiscordNotifier {
    webhook_url: string,
    events: ConfigEventMapType
}

interface TelegramNotifierOptions {
    token: string,
    chat_id: string,
    events: ConfigEventMapType,
}

export interface Config {
    username?: string,
    password?: string,
    auth_token?: string,
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
        level: "debug" | "info" | "warn" | "error"
    },
    notifications: {
        discord: DiscordNotifier[],
        telegram: TelegramNotifierOptions[]
    }
}

function findMostRecentlyModifiedCookiesPath() {
    const cookiesPaths = fs.readdirSync(".").filter((pathName: string) => {
        return /cookies-.+\.json/.test(pathName);
    });

    // Find the most recently modified cookies file
    let mrmPath = null;
    let mrmTime;
    for (const path of cookiesPaths) {
        const stats = fs.statSync(path);
        if (!mrmTime || stats.mtime > mrmTime) {
            mrmTime = stats.mtime;
            mrmPath = path;
        }
    }

    return mrmPath;
}

/**
 * Log some environment information that is useful for debugging.
 */
function logEnvironmentInfo() {
    logger.debug("current system time: " + new Date());
    logger.debug(`git commit hash: ${process.env.GIT_COMMIT_HASH}`);
    logger.debug("NodeJS version: " + process.version);
}

/**
 * Mask some fields of the config such as username, password, etc.
 * @param config The same config with sensitive fields masked.
 */
function createMaskedConfig(config: Config): Config {
    const masked = {...config};
    masked.username = config.username ? "present" : undefined;
    masked.password = config.password ? "present" : undefined;
    masked.auth_token = config.auth_token ? "present" : undefined;
    return masked;
}

async function main(): Promise<void> {
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
            format: format.combine(format((info: TransformableInfo) => {
                info.message = stripAnsi(info.message);
                return info;
            })(), formatMessage),
            options: {
                flags: "w" // Overwrite file
            }
        }));
    }

    logEnvironmentInfo();

    process.setUncaughtExceptionCaptureCallback(error => {
        logger.error("Uncaught exception: " + error.stack);
    });

    // todo: move this into a validation step in the config parser
    if (!["release", "dev"].includes(config.updates.type)) {
        logger.error("Invalid update type: " + config.updates.type);
        process.exit(1);
    }

    // Add default browser args
    const defaultBrowserArgs = [
        "--mute-audio",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--window-size=1920,1080",
        "--disable-features=HardwareMediaKeyHandling"
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
            config["browser_args"].push(arg);
        }
    }

    // Check if we are running inside a Docker container
    if (isInsideDocker()) {

        const requiredBrowser = "chromium";
        const actualBrowser = config.browser;
        if (actualBrowser !== requiredBrowser) {
            logger.warn("Overriding browser option because we are inside a docker container!");
            config.browser = requiredBrowser;
        }

        const requiredHeadless = true;
        const actualHeadless = config.headless;
        if (actualHeadless !== requiredHeadless) {
            logger.warn("Overriding headless option because we are inside a docker container!");
            config.headless = requiredHeadless;
        }

        const requiredHeadlessLogin = true;
        const actualHeadlessLogin = config.headless_login;
        if (actualHeadlessLogin !== requiredHeadlessLogin) {
            logger.warn("Overriding headless_login option because we are inside a docker container!");
            config.headless_login = requiredHeadlessLogin;
        }

        const requiredBrowserArgs = ["--no-sandbox"];
        const actualBrowserArgs = config.browser_args;
        const actualBrowserArgsNames = getArgNames(actualBrowserArgs);
        for (const arg of requiredBrowserArgs) {
            const argName = arg.split("=")[0];
            if (!actualBrowserArgsNames.includes(argName)) {
                logger.warn("Adding browser option: " + arg + " because we are inside a docker container!");
                config.browser_args.push(arg);
            }
        }

    }

    // Make username lowercase
    if (config["username"]) {
        config["username"] = config["username"].toLowerCase();
    }

    // Print masked config
    logger.debug("Using config: " + JSON.stringify(createMaskedConfig(config), null, 4));

    // Start browser
    const browser = await puppeteer.launch({
        headless: config["headless"],
        executablePath: config["browser"],
        args: config["browser_args"]
    });

    // Automatically stop this program if the browser is closed
    browser.on("disconnected", onBrowserOrPageClosed);

    // Check if we have saved cookies
    let cookiesPath = null;
    if (config.cookies_path) {
        cookiesPath = config.cookies_path;
    } else if (config.username) {
        cookiesPath = `./cookies-${config["username"]}.json`;
    } else {
        // The user has not specified a cookies path or a username, lets see if there are any saved cookies in this directory.
        // If there are, lets use those.
        const mrmPath = findMostRecentlyModifiedCookiesPath();
        if (mrmPath) {
            logger.warn("No username specified! Using existing cookies: " + mrmPath);
            cookiesPath = mrmPath;
        }
    }
    let areSavedCookiesValid = false;
    let cookies = null;
    if (cookiesPath && fs.existsSync(cookiesPath)) {

        // Load cookies
        cookies = JSON.parse(fs.readFileSync(cookiesPath, "utf-8"));

        // Make sure these cookies are valid
        if (areCookiesValid(cookies)) {

            // If both cookies and a username are provided and the provided username does not match the username stored in the cookies, warn the user and prefer to use the one from the cookies.
            const username = config["username"];
            if (username && (username !== getUsernameFromCookies(cookies))) {
                logger.warn("Provided username does not match the one found in the cookies! Using the cookies to login...");
                config.username = getUsernameFromCookies(cookies);
            }

            // Restore cookies from previous session
            logger.info("Restoring cookies from last session.");
            areSavedCookiesValid = true;

        } else {

            // Saved cookies are invalid, let's delete them
            logger.info("Saved cookies are invalid.");
            fs.unlinkSync(cookiesPath);

        }

    }

    // If the saved cookies were not valid, let's create some with the provided auth token (if any)
    if (!areSavedCookiesValid) {

        if (config.auth_token) {

            logger.info("Using auth_token to log in");
            cookies = [
                {
                    "name": "auth-token",
                    "value": config.auth_token,
                    "domain": ".twitch.tv",
                    "path": "/",
                    "expires": new Date().getTime() + (1000 * 60 * 60 * 24 * 365), // Set expire date to + 1 year
                    "size": 40, // TODO: Not sure what this is for, seems to be same for all cookies
                    "httpOnly": false,
                    "secure": true,
                    "session": false,
                    "sameSite": "None",
                    "sameParty": false,
                    "sourceScheme": "Secure",
                    "sourcePort": 443
                }
            ];
            areSavedCookiesValid = true;

        }

    }

    // If the saved cookies are not valid, and we don't have an auth token, then we have to log in with username and password
    if (!areSavedCookiesValid) {
        logger.info("Logging in...");

        // Validate options
        if (config["headless_login"] && (config["username"] === undefined || config["password"] === undefined) && config.auth_token === undefined) {
            logger.error("You must provide a username and password or an auth token to use headless login!");
            process.exit(1);
        }

        // Check if we need to create a new headful browser for the login
        const needNewBrowser = config["headless"] && !config["headless_login"];
        let loginBrowser = browser;
        if (needNewBrowser) {
            loginBrowser = await puppeteer.launch({
                headless: false,
                executablePath: config["browser"],
                args: config["browser_args"]
            });
        }

        const loginPage = new LoginPage(await loginBrowser.newPage());
        cookies = await loginPage.login(config["username"], config["password"], config["headless_login"], config["load_timeout_secs"]);

        if (needNewBrowser) {
            await loginBrowser.close();
        }

        config.username = getUsernameFromCookies(cookies);

        // Save cookies
        cookiesPath = `./cookies-${config.username}.json`;
        fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 4));
        logger.info("Saved cookies to " + cookiesPath);
    }

    const client = await Client.fromCookies(cookies);

    const gameIds = await convertGameNamesToIds(client, config.games);

    const bot = await TwitchDropsBot.create(browser, cookies, client, {
        gameIds: gameIds,
        failedStreamBlacklistTimeout: config["failed_stream_timeout"],
        failedStreamRetryCount: config["failed_stream_retry"],
        dropCampaignPollingInterval: config["interval"],
        loadTimeoutSeconds: config["load_timeout_secs"],
        hideVideo: config["hide_video"],
        watchUnlistedGames: config["watch_unlisted_games"],
        showAccountNotLinkedWarning: config["show_account_not_linked_warning"],
        ignoredGameIds: config["ignored_games"],
        attemptImpossibleDropCampaigns: config["attempt_impossible_campaigns"],
        watchStreamsWhenNoDropCampaignsActive: config["watch_streams_when_no_drop_campaigns_active"],
        broadcasterIds: config.broadcasters
    });

    await setUpNotifiers(bot, config, client, gameIds);

    if (config.tui.enabled) {
        startUiMode(bot, config);
    } else {
        startProgressBarMode(bot, config);
    }

    await bot.start();
}

function isInteger(string: string): boolean {
    return string.match(/^\d+$/) !== null;
}

async function convertGameNamesToIds(client: Client, games: string[]) {
    // Convert all game IDs/names to IDs
    const ids: string[] = [];
    for (const game of games) {
        if (isInteger(game)) {
            ids.push(game);
        } else {
            const id = await client.getGameIdFromName(game);
            if (id) {
                logger.debug(`Matched game name "${game}" to ID "${id}"`);
                ids.push(id);
            } else {
                logger.error("Failed to find game ID from name: " + game);
            }
        }
    }
    return ids;
}

async function setUpNotifiers(bot: TwitchDropsBot, config: Config, client: Client, gameIds: string[]) {

    const getGames = (games: "all" | "config") => {
        return games == "all" ? [] : gameIds;
    };

    const convertEventMap = (events: ConfigEventMapType): EventMapType => {
        const eventMap: EventMapType = {};
        if (events.new_drops_campaign) {
            eventMap.new_drops_campaign = {gameIds: getGames(events.new_drops_campaign.games)};
        }
        if (events.drop_claimed) {
            eventMap.drop_claimed = {gameIds: getGames(events.drop_claimed.games)};
        }
        if (events.community_points_earned) {
            eventMap.community_points_earned = events.community_points_earned;
        }
        if (events.drop_ready_to_claim) {
            eventMap.drop_ready_to_claim = events.drop_ready_to_claim;
        }
        return eventMap;
    };

    const notifiers: Notifier[] = [];
    for (const notifier of config.notifications.discord) {
        notifiers.push(new DiscordWebhookSender(convertEventMap(notifier.events), notifier.webhook_url));
    }
    for (const notifier of config.notifications.telegram) {
        notifiers.push(new TelegramNotifier(convertEventMap(notifier.events), notifier.token, notifier.chat_id));
    }

    const onError = (event: EventName, notifier: Notifier, error: any) => {
        logger.error(`Failed to send notification for event: new_drop_campaign_found notifier: ${notifier.constructor.name}`);
        logger.debug(error);
        if (axios.isAxiosError(error)) {
            logger.debug("RESPONSE: " + JSON.stringify(error.response?.data, null, 4));
        }
    };

    bot.on("new_drop_campaign_found", (campaign: DropCampaign) => {
        for (const notifier of notifiers) {
            notifier.onNewDropCampaign(campaign).catch(error => {
                onError("new_drops_campaign", notifier, error);
            });
        }
    });

    bot.on("drop_claimed", (dropId => {
        const drop = bot.getDatabase().getDropById(dropId);
        if (!drop) {
            logger.error("Failed to send Discord webhook: drop was null. id: " + dropId);
            return;
        }

        const campaign = bot.getDatabase().getDropCampaignByDropId(dropId);
        if (!campaign) {
            logger.error("Failed to send Discord webhook: campaign was null");
            logger.debug("drop: " + JSON.stringify(drop, null, 4));
            return;
        }

        for (const notifier of notifiers) {
            notifier.onDropClaimed(drop, campaign).catch(error => {
                onError("drop_claimed", notifier, error);
            });
        }

    }));

    bot.on("community_points_earned", async (data: CommunityPointsUserV1_PointsEarned) => {
        const userLogin = await client.getUserLoginFromId(data.channel_id);
        for (const notifier of notifiers) {
            notifier.onCommunityPointsEarned(data, userLogin).catch(error => {
                onError("community_points_earned", notifier, error);
            });
        }
    });

    bot.on("drop_ready_to_claim", async (dropId: string) => {
        const drop = bot.getDatabase().getDropById(dropId);
        if (!drop) {
            logger.error("Drop is null when ready to claim!");
            return;
        }
        const campaign = bot.getDatabase().getDropCampaignByDropId(dropId);
        if (!campaign) {
            logger.error("Campaign is null when ready to claim!");
            return;
        }
        for (const notifier of notifiers) {
            notifier.onDropReadyToClaim(drop, campaign).catch(error => {
                onError("drop_ready_to_claim", notifier, error);
            });
        }
    });
}

// Check if this file is being run directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        logger.error(error);
        process.exit(1);
    });
}
