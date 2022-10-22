import axios, {AxiosResponse} from "axios";

import {DropCampaign, getDropBenefitNames, TimeBasedDrop} from "../twitch.js";
import {EventMapType, formatTime, formatTimestamp, RateLimitedNotifier} from "./notifier.js";
import {CommunityPointsUserV1_PointsEarned} from "../web_socket_listener.js";

export class DiscordWebhookSender extends RateLimitedNotifier<object> {

    readonly #webhookUrl: string;

    constructor(events: EventMapType, webhookUrl: string) {
        super(events);
        this.#webhookUrl = webhookUrl;
    }

    protected sendNotification(data: object): Promise<AxiosResponse> {
        return  axios.post(this.#webhookUrl, data);
    }

    protected getRetryAfterSeconds(response: AxiosResponse): number {
        return response.data["retry_after"];
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

        await this.post({
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
        await this.post({
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
        await this.post({
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

    async notifyOnDropReadyToClaim(drop: TimeBasedDrop, campaign: DropCampaign): Promise<void> {
        await this.post({
            embeds: [
                {
                    title: "Drop Ready To Claim",
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
                    url: "https://www.twitch.tv/drops/inventory"
                }
            ]
        });
    }

}
