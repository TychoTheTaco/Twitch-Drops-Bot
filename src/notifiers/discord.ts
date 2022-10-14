import axios from "axios";

import {DropCampaign, getDropBenefitNames, TimeBasedDrop} from "../twitch.js";
import {EventMapType, formatTime, formatTimestamp, Notifier} from "./notifier.js";
import {CommunityPointsUserV1_PointsEarned} from "../web_socket_listener.js";

export class DiscordWebhookSender extends Notifier {

    readonly #webhookUrl: string;

    constructor(events: EventMapType, webhookUrl: string) {
        super(events);
        this.#webhookUrl = webhookUrl;
    }

    async notifyOnNewDropCampaign(campaign: DropCampaign): Promise<void> {
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

    async notifyOnDropClaimed(drop: TimeBasedDrop, campaign: DropCampaign): Promise<void> {
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

    async notifyOnCommunityPointsEarned(data: CommunityPointsUserV1_PointsEarned, channelLogin: string): Promise<void> {
        await axios.post(this.#webhookUrl, {
            embeds: [
                {
                    title: "Community Points Earned",
                    fields: [
                        {
                            name: "Channel",
                            value: channelLogin
                        },
                        {
                            name: "Points",
                            value: data.point_gain.total_points.toLocaleString()
                        },
                        {
                            name: "Reason",
                            value: data.point_gain.reason_code
                        },
                        {
                            name: "Balance",
                            value: data.balance.balance.toLocaleString()
                        }
                    ]
                }
            ]
        });
    }

}
