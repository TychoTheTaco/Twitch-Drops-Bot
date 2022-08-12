import axios from "axios";

import {DropCampaign, getDropBenefitNames, TimeBasedDrop} from "../twitch.js";

function formatTimestamp(timestamp: string) {
    return new Date(timestamp).toLocaleString(undefined, {
        timeStyle: "short",
        dateStyle: "short"
    });
}

function formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
        return `${hours} hr` + (hours === 1 ? "" : "s");
    }
    return `${minutes} min` + (minutes === 1 ? "" : "s");
}

export class DiscordWebhookSender {

    readonly #webhookUrl: string;

    constructor(webhookUrl: string) {
        this.#webhookUrl = webhookUrl;
    }

    async sendNewDropsCampaignWebhook(campaign: DropCampaign) {
        let dropsString = "";
        const timeBasedDrops = campaign.timeBasedDrops;
        if (timeBasedDrops) {
            dropsString = timeBasedDrops.map(drop => {
                return `**[${formatTime(drop.requiredMinutesWatched)}]** ${getDropBenefitNames(drop)}`;
            }).join("\n");
        }

        const fields = [
            {
                name: "Game",
                value: campaign.game.displayName
            },
            {
                name: "Campaign",
                value: campaign.name
            },
            {
                name: "Starts",
                value: `${formatTimestamp(campaign.startAt)}`
            },
            {
                name: "Ends",
                value: `${formatTimestamp(campaign.endAt)}`
            }
        ];
        if (dropsString.length > 0) {
            fields.push({
                name: "Drops",
                value: dropsString
            });
        }

        await axios.post(this.#webhookUrl, {
            embeds: [
                {
                    title: "New Drops Campaign",
                    fields: fields,
                    thumbnail: {
                        url: campaign.game.boxArtURL
                    }
                }
            ]
        });
    }

    async sendDropClaimedWebhook(drop: TimeBasedDrop, campaign: DropCampaign) {
        await axios.post(this.#webhookUrl, {
            embeds: [
                {
                    title: "Drop Claimed",
                    fields: [
                        {
                            name: "Game",
                            value: campaign.game.displayName
                        },
                        {
                            name: "Campaign",
                            value: campaign.name
                        },
                        {
                            name: "Drop",
                            value: getDropBenefitNames(drop)
                        }
                    ],
                    thumbnail: {
                        url: drop.benefitEdges[0].benefit.imageAssetURL
                    }
                }
            ]
        });
    }

}
