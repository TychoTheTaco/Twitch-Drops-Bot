"use strict";

import fs from "fs";
import path from "path";

import logger from "./logger.js";
import {Client} from "./twitch.js";
import {StringOption, BooleanOption, StringListOption} from "./options.js";
import {ConfigurationParser} from "./configuration_parser.js";
import {LoginPage} from "./pages/login.js";
import {updateGames} from "./utils.js";

// Using puppeteer-extra to add plugins
import puppeteer from "puppeteer-extra";

// Add stealth plugin
import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());

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

// Options defined here can be configured in either the config file or as command-line arguments
const options = [
    new StringOption("--username", {alias: "-u"}),
    new StringOption("--password", {alias: "-p"}),
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
    new BooleanOption("--headless", false, {defaultValue: true}),
    new BooleanOption("--headless-login"),
    new StringListOption("--browser-args"),
    new StringOption("--cookies-path"),
    new StringOption("--log-level")
];

// Parse arguments
const configurationParser = new ConfigurationParser(options);
let config: any = configurationParser.parse();

// Set logging level
if (config["log_level"]) {
    // TODO: validate input
    logger.level = config["log_level"];
}

// Make username lowercase
if (config["username"]) {
    config["username"] = config["username"].toLowerCase();
}

(async () => {

    // Start browser and open a new tab.
    const browser = await puppeteer.launch({
        headless: config["headless"] ? "new" : false,
        executablePath: config["browser"],
        args: config["browser_args"]
    });
    const page = await browser.newPage();

    // Automatically stop this program if the browser or page is closed
    browser.on("disconnected", onBrowserOrPageClosed);
    page.on("close", onBrowserOrPageClosed);

    // Check if we have saved cookies
    let cookiesPath = config["cookies_path"] || (config["username"] ? `./cookies-${config["username"]}.json` : null);
    let requireLogin = false;
    if (fs.existsSync(cookiesPath)) {

        // Load cookies
        const cookies = JSON.parse(fs.readFileSync(cookiesPath, "utf-8"));

        // Make sure these cookies are valid
        if (areCookiesValid(cookies)) {

            // If both cookies and a username are provided and the provided username does not match the username stored in the cookies, warn the user and prefer to use the one from the cookies.
            const username = config["username"];
            if (username && (username !== getUsernameFromCookies(cookies))) {
                logger.warn("Provided username does not match the one found in the cookies! Using the cookies to login...");
            }

            // Restore cookies from previous session
            logger.info("Restoring cookies from last session.");
            await page.setCookie(...cookies);

        } else {

            // Saved cookies are invalid, let's delete them
            logger.info("Saved cookies are invalid.");
            fs.unlinkSync(cookiesPath);

            // We need to login again
            requireLogin = true;

        }

    } else {
        requireLogin = true;
    }

    let cookies = null;
    if (requireLogin) {
        logger.info("Logging in...");

        // Validate options
        if (config["headless_login"] && (config["username"] === undefined || config["password"] === undefined)) {
            console.error("You must provide a username and password to use headless login!");
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
        await page.setCookie(...cookies);

        if (needNewBrowser) {
            await loginBrowser.close();
        }
    }

    // Get some data from the cookies
    let oauthToken: string | undefined = undefined;
    let channelLogin: string | undefined = undefined;
    for (const cookie of await page.cookies("https://www.twitch.tv")) {
        switch (cookie["name"]) {
            case "auth-token":  // OAuth token
                oauthToken = cookie["value"];
                break;

            case "persistent":  // "channelLogin" Used for "DropCampaignDetails" operation
                channelLogin = cookie["value"].split("%3A")[0];
                break;

            case "login":
                config["username"] = cookie["value"];
                logger.info("Logged in as " + cookie["value"]);
                break;
        }
    }

    if (!oauthToken || !channelLogin) {
        logger.error("Invalid cookies!");
        process.exit(1);
    }

    // Save cookies
    if (requireLogin) {
        cookiesPath = `./cookies-${config["username"]}.json`;
        fs.writeFileSync(cookiesPath, JSON.stringify(cookies));
        logger.info("Saved cookies to " + cookiesPath);
    }

    // Seems to be the default hard-coded client ID
    // Found in sources / static.twitchcdn.net / assets / minimal-cc607a041bc4ae8d6723.js
    const twitchClient = new Client({oauthToken: oauthToken, userId: channelLogin});

    updateGames(await twitchClient.getDropCampaigns());

    browser.off("disconnected", onBrowserOrPageClosed);
    page.off("close", onBrowserOrPageClosed);
    await browser.close();

})().catch(error => {
    logger.error(error);
    process.exit(1);
});
