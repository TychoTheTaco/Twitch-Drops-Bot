import axios from "axios";

import {DropCampaign, getDropBenefitNames, TimeBasedDrop} from "../twitch.js";
import {formatTime, formatTimestamp, Notifier} from "./notifier.js";

export class DiscordWebhookSender extends Notifier {

    readonly #webhookUrl: string;

    constructor(webhookUrl: string) {
        super();
        this.#webhookUrl = webhookUrl;
    }

    async onNewDropCampaign(campaign: DropCampaign): Promise<void> {
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

    async onDropClaimed(drop: TimeBasedDrop, campaign: DropCampaign): Promise<void> {
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
