import fs from "node:fs"
import path from "node:path";

import {Page} from "puppeteer";
import {parse} from "csv-parse/sync";
import {stringify} from "csv-stringify/sync";
import axios from "axios";

import {DropCampaign} from "./twitch.js";
import logger from "./logger.js";

export async function saveScreenshotAndHtml(page: Page, pathPrefix: string) {
    const time = new Date().getTime();
    const screenshotPath = pathPrefix + '-screenshot-' + time + '.png';
    const htmlPath = pathPrefix + '-page-' + time + '.html';
    await page.screenshot({
        fullPage: true,
        path: screenshotPath
    });
    fs.writeFileSync(htmlPath, await page.content());
}

export async function getLatestReleaseVersion(): Promise<string> {
    interface Release {
        tag_name: string
    }
    const releases = (await axios.get("https://api.github.com/repos/tychothetaco/twitch-drops-bot/releases")).data as Release[];
    return releases[0].tag_name;
}

export async function getLatestDevelopmentVersion(): Promise<string> {
    const result = await axios.get("https://api.github.com/repos/tychothetaco/twitch-drops-bot/branches/dev");
    const data = result.data;
    return data["commit"]["sha"];
}

export function compareVersionString(a: string, b: string): -1 | 0 | 1 {
    const numbersA = a.split(/\D+/g).filter(value => value.length > 0).map(value => parseInt(value));
    const numbersB = b.split(/\D+/g).filter(value => value.length > 0).map(value => parseInt(value));
    for (let i = 0; i < Math.max(numbersA.length, numbersB.length); ++i) {
        const numberA = numbersA.at(i) ?? 0;
        const numberB = numbersB.at(i) ?? 0;
        if (numberA < numberB) {
            return -1;
        } else if (numberA > numberB) {
            return 1;
        }
    }
    return 0;
}

export class TimedSet<T> extends Set<T> {

    readonly #timeout: number;

    /**
     * A {@link Set} that automatically removes items after {@link timeout} milliseconds.
     * @param timeout
     */
    constructor(timeout: number) {
        super();
        this.#timeout = timeout;
    }

    add(value: T): this {
        const isValueInSet = this.has(value);
        const result = super.add(value);
        if (!isValueInSet) {
            setTimeout(() => {
                this.delete(value);
            }, this.#timeout);
        }
        return result;
    }
}

export function updateGames(campaigns: DropCampaign[], sourcePath: string = "./games.csv", destinationPath: string = sourcePath) {
    logger.info('Parsing games...');

    // Read games from source file
    let oldGames = [];
    if (fs.existsSync(sourcePath)) {
        // Read data from file as string
        let oldGamesRaw = fs.readFileSync(sourcePath, {encoding: "utf-8"});

        // Detect and replace line endings
        if (oldGamesRaw.includes('\r\n')) {
            logger.info('File games.csv contains CRLF line endings. Will replace with LF.');
            oldGamesRaw = oldGamesRaw.replace(/\r\n/g, '\n');
        }

        // Parse string into list of columns
        oldGames = parse(oldGamesRaw, {
            from_line: 2, // Skip header
            skip_empty_lines: true
        });
    }

    // @ts-ignore
    const oldNameToIdMap = new Map<string, string>(oldGames);
    // @ts-ignore
    const oldIdToNameMap = new Map<string, string>(oldGames.map(game => game.reverse()));

    // Create list of [name, id] for new games
    const newGames = campaigns.map(campaign => [campaign['game']['displayName'], campaign['game']['id']]);

    const newIdToNameMap = new Map<string, string>();

    // Add all old games
    for (const item of oldIdToNameMap) {
        newIdToNameMap.set(item[0], item[1]);
    }

    for (const game of newGames) {
        const [newName, newId] = game;

        const oldName = oldIdToNameMap.get(newId);
        const oldId = oldNameToIdMap.get(newName);

        if (oldName === undefined && oldId === undefined) { // Game did not exist
            logger.info("Found new game: " + game);
        } else if (oldName && !oldId) {
            if (newIdToNameMap.get(newId) !== newName) {
                logger.info("Found new name for game: " + oldName + " -> " + newName);
            }
        } else if (!oldName && oldId) {
            if (newIdToNameMap.has(oldId)) {
                logger.info("Found new ID for game: " + newName + " " + oldId + " -> " + newId);
                // @ts-ignore
                newIdToNameMap.delete(oldId);
            }
        } else if (oldName === newName && oldId == newId) {
            // same data
        } else {
            logger.info("interesting: " + oldName + " vs " + newName + "   " + oldId + " vs " + newId)
        }

        newIdToNameMap.set(newId, newName);
    }

    //
    const games = [...newIdToNameMap.entries()]
        .map(game => [game[1], game[0]])
        .sort((a, b) => a[0].localeCompare(b[0]));

    const toWrite = stringify(games);

    const destDir = path.dirname(destinationPath);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir);
    }

    fs.writeFileSync(
        destinationPath,
        'Name,ID\n' + toWrite);
    logger.info('Games list updated');
}

export default {
    saveScreenshotAndHtml
};
