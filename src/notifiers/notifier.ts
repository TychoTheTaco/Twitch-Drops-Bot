import {DropCampaign, TimeBasedDrop} from "../twitch.js";
import {CommunityPointsUserV1_PointsEarned} from "../web_socket_listener.js";

export type EventName = "new_drops_campaign" | "drop_claimed" | "community_points_earned";

interface EventOptions_NewDropsCampaign {
    gameIds: string[]
}

interface EventOptions_DropClaimed {
    gameIds: string[]
}

export type Event_CommunityPointsEarned_ClaimReason = "watch" | "claim";

interface Event_CommunityPointsEarned {
    reasons: Event_CommunityPointsEarned_ClaimReason[]
}

export type EventMapType = {
    "new_drops_campaign"?: EventOptions_NewDropsCampaign,
    "drop_claimed"?: EventOptions_DropClaimed,
    "community_points_earned"?: Event_CommunityPointsEarned,
};

export abstract class Notifier {

    readonly #events: EventMapType;

    protected constructor(events: EventMapType) {
        this.#events = events;
    }

    async onNewDropCampaign(campaign: DropCampaign): Promise<void> {
        const options = this.#events.new_drops_campaign;
        if (!options) {
            return;
        }
        if (options.gameIds.length > 0 && !options.gameIds.includes(campaign.game.id)) {
            return;
        }
        await this.notifyOnNewDropCampaign(campaign);
    }

    protected abstract notifyOnNewDropCampaign(campaign: DropCampaign): Promise<void>;

    async onDropClaimed(drop: TimeBasedDrop, campaign: DropCampaign): Promise<void> {
        const options = this.#events.drop_claimed;
        if (!options) {
            return;
        }
        if (options.gameIds.length > 0 && !options.gameIds.includes(campaign.game.id)) {
            return;
        }
        await this.notifyOnDropClaimed(drop, campaign);
    }

    protected abstract notifyOnDropClaimed(drop: TimeBasedDrop, campaign: DropCampaign): Promise<void>;

    async onCommunityPointsEarned(data: CommunityPointsUserV1_PointsEarned, channelLogin: string): Promise<void> {
        const options = this.#events.community_points_earned;
        if (!options) {
            return;
        }
        if (options.reasons.length > 0) {
            switch (data.point_gain.reason_code) {
                case "WATCH":
                    if (!options.reasons.includes("watch")) {
                        return;
                    }
                    break;

                case "CLAIM":
                    if (!options.reasons.includes("claim")) {
                        return;
                    }
                    break;
            }
        }
        await this.notifyOnCommunityPointsEarned(data, channelLogin);
    }

    protected abstract notifyOnCommunityPointsEarned(data: CommunityPointsUserV1_PointsEarned, channelLogin: string): Promise<void>;

}

export function formatTimestamp(timestamp: string) {
    return new Date(timestamp).toLocaleString(undefined, {
        timeStyle: "short",
        dateStyle: "short"
    });
}

export function formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
        return `${hours} hr` + (hours === 1 ? "" : "s");
    }
    return `${minutes} min` + (minutes === 1 ? "" : "s");
}