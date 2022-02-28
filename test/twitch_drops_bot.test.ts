import {getDropName} from "../src/twitch_drops_bot";
import fs from "fs";

test("getDropName", () => {
    const dropCampaign = JSON.parse(fs.readFileSync("data/DropCampaign/1.json", {encoding: "utf-8"}));
    const expectedOutputs = [
        "A-Coin 500",
        "A-Coin 500, Tasty Carp Bread Icon",
        "A-Coin 500, Tasty Carp Bread Spray"
    ];
    for (let i = 0; i < dropCampaign.timeBasedDrops.length; ++i){
        expect(getDropName(dropCampaign.timeBasedDrops[i])).toBe(expectedOutputs[i]);
    }
});