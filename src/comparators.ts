import {DropCampaign} from "./twitch.js";

function getFirstBroadcasterIndex(campaign: DropCampaign, broadcasterDisplayNames: string[]) {
    for (let i = 0; i < broadcasterDisplayNames.length; ++i) {
        if (campaign.allow && campaign.allow.isEnabled && campaign.allow.channels) {
            for (const channel of campaign.allow.channels) {
                if (channel.displayName && channel.displayName.toLowerCase() === broadcasterDisplayNames[i].toLowerCase()) {
                    return i;
                }
            }
        }
    }
    return -1;
}

/**
 * Sort campaigns based on the order of game IDs.
 * @param a
 * @param b
 * @param gameIds
 */
export function gameIndexComparator(a: DropCampaign, b: DropCampaign, gameIds: string[]) {
    const indexA = gameIds.indexOf(a.game.id);
    const indexB = gameIds.indexOf(b.game.id);
    if (indexA === -1 && indexB !== -1) {
        return 1;
    } else if (indexA !== -1 && indexB === -1) {
        return -1;
    }
    return Math.sign(indexA - indexB);
}

/**
 * Sort campaigns based on end time.
 * @param a
 * @param b
 */
export function endTimeComparator(a: DropCampaign, b: DropCampaign) {
    const endTimeA = Date.parse(a.endAt);
    const endTimeB = Date.parse(b.endAt);
    return endTimeA < endTimeB ? -1 : 1;
}

/**
 * Sort campaigns based on the order of broadcasters.
 * @param a
 * @param b
 * @param broadcasterDisplayNames
 */
export function broadcasterComparator(a: DropCampaign, b: DropCampaign, broadcasterDisplayNames: string[]) {
    const broadcasterIndexA = getFirstBroadcasterIndex(a, broadcasterDisplayNames);
    const broadcasterIndexB = getFirstBroadcasterIndex(b, broadcasterDisplayNames);
    if (broadcasterIndexA === -1 && broadcasterIndexB !== -1) {
        return 1;
    } else if (broadcasterIndexA !== -1 && broadcasterIndexB === -1) {
        return -1;
    }
    return Math.sign(broadcasterIndexA - broadcasterIndexB);
}

/**
 * Sort campaigns by remaining watch time.
 * @param a
 * @param b
 * @param completedDropIds
 */
export function requiredMinutesComparator(a: DropCampaign, b: DropCampaign, completedDropIds: Set<string>) {
    const getRequiredMinutes = (campaign: DropCampaign): number => {
        const timeBasedDrops = campaign.timeBasedDrops;
        for (const drop of timeBasedDrops) {
            if (completedDropIds.has(drop.id)) {
                continue;
            }
            return drop.requiredMinutesWatched;
        }
        return 99999;
    };
    const requiredMinutesA = getRequiredMinutes(a);
    const requiredMinutesB = getRequiredMinutes(b);
    return Math.sign(requiredMinutesA - requiredMinutesB);
}
