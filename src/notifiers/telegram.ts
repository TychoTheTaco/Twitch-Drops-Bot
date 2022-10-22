import axios, {AxiosResponse} from "axios";

import {DropCampaign, getDropBenefitNames, TimeBasedDrop} from "../twitch.js";
import {EventMapType, formatTime, formatTimestamp, RateLimitedNotifier} from "./notifier.js";
import {CommunityPointsUserV1_PointsEarned} from "../web_socket_listener.js";

function escapeFormatting(text: string) {
    let safe = "";
    for (const c of text) {
        if (["*", "_", "~", ".", "-", "#", "|", "!"].includes(c)) {
            safe += "\\";
        }
        safe += c;
    }
    return safe;
}

export class TelegramNotifier extends RateLimitedNotifier<string> {

    readonly #token: string;
    readonly #chatId: string;

    constructor(events: EventMapType, token: string, chatId: string) {
        super(events);
        this.#token = token;
        this.#chatId = chatId;
    }

    protected sendNotification(data: string): Promise<AxiosResponse> {
        return axios.post(`https://api.telegram.org/bot${this.#token}/sendMessage`, {chat_id: this.#chatId, parse_mode: "MarkdownV2", text: data});
    }

    protected getRetryAfterSeconds(response: AxiosResponse): number {
        return response.data["parameters"]["retry_after"];
    }

    #createMessage(title: string, fields: { name: string, value: any }[]): string {
        let message = `__*${title}*__\n\n`;
        for (const field of fields) {
            message += `*${field.name}*\n${field.value}\n\n`;
        }
        return message;
    }

    async notifyOnNewDropCampaign(campaign: DropCampaign): Promise<void> {
        let dropsString = "";
        const timeBasedDrops = campaign.timeBasedDrops;
        if (timeBasedDrops) {
            dropsString = timeBasedDrops.map(drop => {
                return `*\\[${formatTime(drop.requiredMinutesWatched)}\\]* ${escapeFormatting(getDropBenefitNames(drop))}`;
            }).join("\n");
        }

        const fields = [
            {
                name: "Game",
                value: escapeFormatting(campaign.game.displayName)
            },
            {
                name: "Campaign",
                value: escapeFormatting(campaign.name)
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

        const message = this.#createMessage("New Drop Campaign", fields);
        await this.post(message);
    }

    async notifyOnDropClaimed(drop: TimeBasedDrop, campaign: DropCampaign): Promise<void> {
        const fields = [
            {
                name: "Game",
                value: escapeFormatting(campaign.game.displayName)
            },
            {
                name: "Campaign",
                value: escapeFormatting(campaign.name)
            },
            {
                name: "Drop",
                value: escapeFormatting(getDropBenefitNames(drop))
            }
        ];
        const message = this.#createMessage("Drop Claimed", fields);
        await this.post(message);
    }

    async notifyOnCommunityPointsEarned(data: CommunityPointsUserV1_PointsEarned, channelLogin: string): Promise<void> {
        const message = this.#createMessage("Community Points Claimed", [
            {
                name: "Channel",
                value: escapeFormatting(channelLogin)
            },
            {
                name: "Points",
                value: escapeFormatting(data.point_gain.total_points.toLocaleString())
            },
            {
                name: "Reason",
                value: escapeFormatting(data.point_gain.reason_code)
            },
            {
                name: "Balance",
                value: escapeFormatting(data.balance.balance.toLocaleString())
            }
        ]);
        await this.post(message);
    }

    async notifyOnDropReadyToClaim(drop:TimeBasedDrop, campaign: DropCampaign): Promise<void> {
        await this.post(this.#createMessage("Drop Ready To Claim", [
            {
                name: "Game",
                value: escapeFormatting(campaign.game.displayName)
            },
            {
                name: "Campaign",
                value: escapeFormatting(campaign.name)
            },
            {
                name: "Drop",
                value: escapeFormatting(getDropBenefitNames(drop))
            },
            {
                name: "Claim Here",
                value: escapeFormatting("https://www.twitch.tv/drops/inventory")
            }
        ]));
    }

}
