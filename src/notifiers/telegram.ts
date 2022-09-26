import axios from "axios";

import {DropCampaign, getDropBenefitNames, TimeBasedDrop} from "../twitch.js";
import {formatTime, formatTimestamp, Notifier} from "./notifier.js";

function escapeFormatting(text: string) {
    let safe = "";
    for (const c of text) {
        if (["*", "_", "~", "."].includes(c)) {
            safe += "\\";
        }
        safe += c;
    }
    return safe;
}

export class TelegramNotifier extends Notifier {

    readonly #token: string;
    readonly #chatId: string;

    constructor(token: string, chatId: string) {
        super();
        this.#token = token;
        this.#chatId = chatId;
    }

    async #sendMessage(text: string) {
        await axios.post(`https://api.telegram.org/bot${this.#token}/sendMessage`, {chat_id: this.#chatId, parse_mode: "MarkdownV2", text: text});
    }

    async onNewDropCampaign(campaign: DropCampaign): Promise<void> {
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

        let text = "__*New Drop Campaign*__\n\n";
        for (const field of fields) {
            text += `*${field.name}*\n${field.value}\n\n`;
        }

        await this.#sendMessage(text);
    }

    async onDropClaimed(drop: TimeBasedDrop, campaign: DropCampaign): Promise<void> {
        let message = "__*Drop Claimed*__\n\n";
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
                name: "Drop",
                value: escapeFormatting(getDropBenefitNames(drop))
            }
        ];
        for (const field of fields) {
            message += `*${field.name}*\n${field.value}\n\n`;
        }
        await this.#sendMessage(message);
    }

}
