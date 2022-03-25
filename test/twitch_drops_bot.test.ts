import fs from "fs";

import {isDropCompleted} from "../src/twitch";

test("isDropClaimed", () => {
    /*const inventory = JSON.parse(fs.readFileSync("test/data/Inventory/0.json", {encoding: "utf-8"}));

    const dropCampaigns = [];
    for (let i = 0; i < 6; ++i){
        dropCampaigns.push(JSON.parse(fs.readFileSync("test/data/DropCampaign/" + i + ".json", {encoding: "utf-8"})));
    }

    const expectedResults = [
        false, true,  false,
        false, false, false,
        false, false, false,
        false, false, true,
        true,  true,  false
    ];

    let i = 0;
    for (const campaign of dropCampaigns){
        for (let j = 0; j < campaign.timeBasedDrops.length; ++j){
            expect(isDropCompleted(campaign.timeBasedDrops[j], inventory)).toBe(expectedResults[i]);
            i++;
        }
    }*/

});
