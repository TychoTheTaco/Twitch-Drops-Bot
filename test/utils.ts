import fs from "node:fs";

import {DropCampaign} from "../src/twitch.js";

export function loadJsonData(path: string) {
    return JSON.parse(fs.readFileSync(`test/data/${path}.json`).toString());
}

export function getCampaignIds(campaigns: DropCampaign[]) {
    return campaigns.map((campaign: DropCampaign) => {
        return campaign.id;
    });
}
