import fs from "fs";

import {updateGames} from "../src/utils";
import {DropCampaign} from "../src/twitch";

const DESTINATION_PATH = "test/data/temp/games.csv";

function cleanup() {
    if (fs.existsSync(DESTINATION_PATH)) {
        fs.unlinkSync(DESTINATION_PATH);
    }
}

beforeAll(() => {
    cleanup(); // todo: disable logger console output
})

afterAll(() => {
    cleanup();
})

test("update_games", () => {

    // Load "new" campaign data
    const campaigns: DropCampaign[] = JSON.parse(fs.readFileSync("test/data/campaigns-0.json").toString());

    // Normal update
    updateGames(campaigns, "test/data/games-0-a.csv", DESTINATION_PATH);
    const gamesRawActual0 = fs.readFileSync(DESTINATION_PATH).toString();
    const gamesRawExpected0 = fs.readFileSync("test/data/games-0-b.csv").toString().replace(/\r\n/g, '\n');
    expect(gamesRawActual0).toStrictEqual(gamesRawExpected0);

    // No changes
    updateGames(campaigns, "test/data/games-1-a.csv", DESTINATION_PATH);
    const gamesRawActual1 = fs.readFileSync(DESTINATION_PATH).toString();
    const gamesRawExpected1 = fs.readFileSync("test/data/games-1-b.csv").toString().replace(/\r\n/g, '\n');
    expect(gamesRawActual1).toStrictEqual(gamesRawExpected1);

    // Missing original games.csv
    updateGames(campaigns, "does/not/exist/games.csv", DESTINATION_PATH);
    const gamesRawActual2 = fs.readFileSync(DESTINATION_PATH).toString();
    const gamesRawExpected2 = fs.readFileSync("test/data/games-2-b.csv").toString().replace(/\r\n/g, '\n');
    expect(gamesRawActual2).toStrictEqual(gamesRawExpected2);

});
