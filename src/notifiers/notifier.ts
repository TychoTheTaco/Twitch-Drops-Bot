import {DropCampaign, TimeBasedDrop} from "../twitch.js";
import {CommunityPointsUserV1_PointsEarned} from "../web_socket_listener.js";
import axios, {AxiosResponse} from "axios";
import logger from "../logger.js";

export type EventName = "new_drops_campaign" | "drop_claimed" | "community_points_earned" | "drop_ready_to_claim";

interface EventOptions_NewDropsCampaign {
    gameIds: string[]
}

interface EventOptions_DropClaimed {
    gameIds: string[]
}

export type Event_CommunityPointsEarned_ClaimReason = "watch" | "claim" | "watch_streak" | "raid";

interface Event_CommunityPointsEarned {
    reasons: Event_CommunityPointsEarned_ClaimReason[]
}

export type EventMapType = {
    "new_drops_campaign"?: EventOptions_NewDropsCampaign,
    "drop_claimed"?: EventOptions_DropClaimed,
    "community_points_earned"?: Event_CommunityPointsEarned,
    "drop_ready_to_claim"?: {},
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

                case "WATCH_STREAK":
                    if (!options.reasons.includes("watch_streak")) {
                        return;
                    }
                    break;

                case "RAID":
                    if (!options.reasons.includes("raid")) {
                        return;
                    }
                    break;
            }
        }
        await this.notifyOnCommunityPointsEarned(data, channelLogin);
    }

    protected abstract notifyOnCommunityPointsEarned(data: CommunityPointsUserV1_PointsEarned, channelLogin: string): Promise<void>;

    async onDropReadyToClaim(drop: TimeBasedDrop, campaign: DropCampaign): Promise<void> {
        const options = this.#events.drop_ready_to_claim;
        if (!options) {
            return;
        }
        await this.notifyOnDropReadyToClaim(drop, campaign);
    }

    protected abstract notifyOnDropReadyToClaim(drop: TimeBasedDrop, campaign: DropCampaign): Promise<void>;

}

export abstract class RateLimitedNotifier<T> extends Notifier {

    /**
     * Queue of pending requests. If we get rate limited, any new requests will be put into this queue. We will try
     * sending them again at {@link #tryAgainTime}.
     * @private
     */
    #pendingRequests: T[] = [];

    /**
     * The time that we can try sending requests again.
     * @private
     */
    #tryAgainTime: Date = new Date();

    protected abstract sendNotification(data: T): Promise<AxiosResponse>;

    protected abstract getRetryAfterSeconds(response: AxiosResponse): number;

    protected async post(data: T) {
        const remainingSeconds = (this.#tryAgainTime.getTime() - new Date().getTime()) / 1000;
        if (remainingSeconds > 0) {
            logger.warn(`Delaying notification due to rate limit! Trying again in ${remainingSeconds} seconds.`);
            this.#pendingRequests.push(data);
            return;
        }

        try {
            await this.sendNotification(data);
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const response = error.response;
                if (response) {
                    if (response.status === 429) {
                        const retryAfterSeconds = this.getRetryAfterSeconds(response);
                        const retryAfterMilliseconds = retryAfterSeconds * 1000;
                        this.#tryAgainTime = new Date(new Date().getTime() + retryAfterMilliseconds);
                        logger.warn(`Hit notification rate limit! Delaying notification for ${retryAfterSeconds} seconds.`);
                        this.#pendingRequests.push(data);
                        setTimeout(this.#sendPendingRequests.bind(this), retryAfterMilliseconds);
                        return;
                    }
                }
            }
            throw error;
        }
    }

    async #sendPendingRequests() {
        logger.info(`Sending ${this.#pendingRequests.length} pending notifications...`);
        while (this.#pendingRequests.length > 0) {
            const data = this.#pendingRequests.shift();
            if (data) {
                try {
                    await this.post(data);
                } catch (error) {
                    logger.error("Error sending notification: " + error);
                }
            }
        }
    }

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
