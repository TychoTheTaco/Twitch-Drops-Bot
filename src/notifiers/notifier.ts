import {DropCampaign, TimeBasedDrop} from "../twitch.js";

export abstract class Notifier {

    abstract onNewDropCampaign(campaign: DropCampaign): Promise<void>;

    abstract onDropClaimed(drop: TimeBasedDrop, campaign: DropCampaign): Promise<void>;

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