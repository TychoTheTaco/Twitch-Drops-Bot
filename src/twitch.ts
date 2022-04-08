"use strict";

require("dnscache")({enable: true});

import axios from "axios";

import logger from "./logger";

export interface StreamData {
    url: string,
    broadcaster_id: string
}

export enum StreamTag {
    DROPS_ENABLED = "c2542d6d-cd10-4532-919b-3d19f30a768b"
}

/*
NOTE: The below interfaces do not always have all fields present! Some Twitch API calls don't return all the fields.
I could mark them all optional, but that would lead to a lot of unnecessary null checking throughout the code.
I could make a separate interface for each API call but that would get messy very quickly and lead to a lot of duplicate information.
*/

export interface Game {
    id: string,
    displayName: string,
    name: string,
    boxArtURL: string
}

export interface DropCampaign {
    id: string,
    status: string,
    game: Game,
    self: {
        isAccountConnected: boolean
    },
    startAt: string,
    endAt: string,
    name: string,
    timeBasedDrops: TimeBasedDrop[],
    allow: {
        channels: {
            id: string,
            displayName: string
        }[],
        isEnabled: boolean
    }
}

export interface TimeBasedDrop {
    id: string,
    // A `TimeBasedDrop` may have multiple rewards. Each reward is specified by a `BenefitEdge`
    benefitEdges: {
        benefit: {
            id: string,
            name: string,
            game: Game
        }
    }[],
    startAt: string,
    endAt: string,
    requiredMinutesWatched: number,
    name: string,
    preconditionDrops: {
        id: string
    }[],
    self: {
        currentMinutesWatched: number,
        dropInstanceID: string,
        isClaimed: boolean
    },
    campaign: DropCampaign
}

export interface UserDropReward {
    id: string,
    game: Game,
    lastAwardedAt: string,
    name: string,
    totalCount: number
}

export interface Inventory {
    dropCampaignsInProgress: DropCampaign[],
    gameEventDrops: UserDropReward[]
}

export interface Tag {
    id: string,
    isLanguageTag: boolean,
    localizedName: string,
    scope: string,
    tagName: string
}

export interface Stream {
    createdAt: string,
    game: Game,
    id: string,
    type: string,
    tags: Tag[]
}

export interface User {
    stream: Stream,
    lastBroadcast: {
        id: string,
        title: string
    },
    id: string,
    isPartner: boolean,
    channel: Channel
}

export interface Channel {
    id: string
}

/**
 * A client for interacting with the Twitch GQL endpoint.
 */
export class Client {

    readonly #clientId: string;
    readonly #oauthToken: string;
    readonly #channelLogin: string;

    constructor(clientId: string, oauthToken: string, channelLogin: string) {
        this.#clientId = clientId;
        this.#oauthToken = oauthToken;
        this.#channelLogin = channelLogin;
    }

    /**
     * Send a POST request to the Twitch GQL endpoint. The request will include authentication headers.
     * @param data The data to send to the API.
     * @private
     */
    async #post(data: any): Promise<any> {
        const response = await axios.post("https://gql.twitch.tv/gql", data,
            {
                headers: {
                    "Content-Type": "text/plain;charset=UTF-8",
                    "Client-Id": this.#clientId,
                    "Authorization": `OAuth ${this.#oauthToken}`
                }
            }
        );

        // The API will always return a status code of 200, even if there are errors. If there are any errors, they
        // will be included in the response data, so I check for them here and throw an error if there are any.
        // Just because there are errors does not mean the entire request failed; if you sent multiple operations in
        // a single POST request, then the errors may only refer to some operations, meaning the others were
        // successful. Despite this, it is still better to throw an exception if there are any errors since this class
        // only sends POST requests with a single operation.
        if ("errors" in response.data) {

            // Throw the first error in the response
            for (const error of response.data["errors"]) {
                if ("message" in error) {

                    const messages = ["service timeout", "service error"];

                    // For some errors, we don't need to include the response data since it is not helpful
                    const message = error["message"];
                    if (messages.includes(message)) {
                        throw new Error("API error: " + message + " " + JSON.stringify(error, null, 4));
                    }
                }
            }

            throw new Error("API error: " + JSON.stringify(response.data, null, 4));
        }

        // Return the response data
        return response.data;
    }

    /**
     * Get a list of drop campaigns. This can include expired, active, and future campaigns.
     */
    async getDropCampaigns(): Promise<DropCampaign[]> {
        const data = await this.#post({
            "operationName": "ViewerDropsDashboard",
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "e8b98b52bbd7ccd37d0b671ad0d47be5238caa5bea637d2a65776175b4a23a64"
                }
            }
        });
        try {
            return data["data"]["currentUser"]["dropCampaigns"];
        } catch (error) {
            logger.debug("Error in function getDropCampaigns! Response: " + JSON.stringify(data, null, 4));
            throw error;
        }
    }

    async getDropCampaignDetails(dropId: string): Promise<DropCampaign> {
        const data = await this.#post({
            "operationName": "DropCampaignDetails",
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "14b5e8a50777165cfc3971e1d93b4758613fe1c817d5542c398dce70b7a45c05"
                }
            },
            "variables": {
                "dropID": dropId,
                "channelLogin": this.#channelLogin
            }
        });
        try {
            return data["data"]["user"]["dropCampaign"];
        } catch (error) {
            logger.debug("Error in function getDropCampaignDetails! Response: " + JSON.stringify(data, null, 4));
            throw error;
        }
    }

    async getInventory(): Promise<Inventory> {
        const data = await this.#post({
            "operationName": "Inventory",
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "9cdfc5ebf8ee497e49c5b922829d67e5bce039f3c713f0706d234944195d56ad"
                }
            }
        });
        try {
            return data["data"]["currentUser"]["inventory"];
        } catch (error) {
            logger.debug("Error in function getInventory! Response: " + JSON.stringify(data, null, 4));
            throw error;
        }
    }

    /**
     * Get a list of active streams.
     * @param gameName
     * @param options
     */
    async getActiveStreams(gameName: string, options?: { tags?: string[] }): Promise<StreamData[]> {
        const data = await this.#post({
            "operationName": "DirectoryPage_Game",
            "variables": {
                "name": gameName.toLowerCase(),
                "options": {
                    "includeRestricted": [
                        "SUB_ONLY_LIVE"
                    ],
                    "sort": "VIEWER_COUNT",
                    "recommendationsContext": {
                        "platform": "web"
                    },
                    "requestID": "JIRA-VXP-2397", // TODO: what is this for???
                    "tags": options?.tags ?? []
                },
                "sortTypeIsRecency": false,
                "limit": 30
            },
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "d5c5df7ab9ae65c3ea0f225738c08a36a4a76e4c6c31db7f8c4b8dc064227f9e"
                }
            }
        });

        const streams = data["data"]["game"]["streams"];
        if (streams === null) {
            return [];
        }

        const result = [];
        for (const stream of streams["edges"]) {
            result.push({
                "url": "https://www.twitch.tv/" + stream["node"]["broadcaster"]["login"],
                "broadcaster_id": stream["node"]["broadcaster"]["id"]
            });
        }
        return result;
    }

    async claimDropReward(dropId: string) {
        const data = await this.#post({
            "operationName": "DropsPage_ClaimDropRewards",
            "variables": {
                "input": {
                    "dropInstanceID": dropId
                }
            },
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "2f884fa187b8fadb2a49db0adc033e636f7b6aaee6e76de1e2bba9a7baf0daf6"
                }
            }
        });
    }

    /**
     * Check if a stream is online.
     * @param broadcasterId
     */
    async isStreamOnline(broadcasterId: string): Promise<boolean> {
        const data = await this.#post({
            "operationName": "ChannelShell",
            "variables": {
                "login": broadcasterId
            },
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "580ab410bcd0c1ad194224957ae2241e5d252b2c5173d8e0cce9d32d5bb14efe"
                }
            }
        });
        const stream = data["data"]["userOrError"]["stream"];
        return stream !== null && stream !== undefined;
    }

    async getStreamMetadata(channelLogin: string): Promise<User> {
        const data = await this.#post({
            "operationName": "StreamMetadata",
            "variables": {
                "channelLogin": channelLogin
            },
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "a647c2a13599e5991e175155f798ca7f1ecddde73f7f341f39009c14dbf59962"
                }
            }
        });
        return data["data"]["user"];
    }

    async getStreamTags(channelLogin: string): Promise<User | null> {
        const data = await this.#post({
            "operationName": "RealtimeStreamTagList",
            "variables": {
                "channelLogin": channelLogin
            },
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "9d952e4aacd4f8bb9f159bd4d5886d72c398007249a8b09e604a651fc2f8ac17"
                }
            }
        });
        return data["data"]["user"];
    }

    async getAvailableCampaigns(channelId: string): Promise<TimeBasedDrop[]> {
        const data = await this.#post({
            "operationName": "DropsHighlightService_AvailableDrops",
            "variables": {
                "channelID": channelId
            },
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "e589e213f16d9b17c6f0a8ccd18bdd6a8a6b78bc9db67a75efd43793884ff4e5"
                }
            }
        });
        return data["data"]["channel"]["viewerDropCampaigns"];
    }

}

/**
 * Get the {@link TimeBasedDrop} object with the specified Drop ID from the given {@link Inventory}.
 * @param dropId
 * @param inventory
 * @param campaignId
 */
export function getInventoryDrop(dropId: string, inventory: Inventory, campaignId?: string): TimeBasedDrop | null {
    const campaigns = inventory.dropCampaignsInProgress;
    if (campaigns === null) {
        return null;
    }
    for (const campaign of campaigns) {
        if (!campaignId || campaign.id === campaignId) {
            const drops = campaign.timeBasedDrops;
            for (const drop of drops) {
                if (drop.id === dropId) {
                    return drop;
                }
            }
        }
    }
    return null;
}

/**
 * Check if the specified Drop has been completed already. A Drop is considered completed if we have claimed it or
 * if it is expired.
 * @param drop
 * @param inventory
 */
export function isDropCompleted(drop: TimeBasedDrop, inventory: Inventory): boolean {
    const dropCampaignsInProgress = inventory.dropCampaignsInProgress;
    if (dropCampaignsInProgress != null) {
        for (const campaign of dropCampaignsInProgress) {
            //todo: consider event based drops!
            const timeBasedDrops = campaign.timeBasedDrops;
            if (timeBasedDrops) {
                for (const d of campaign.timeBasedDrops) {
                    if (d.id === drop.id) {
                        if (d.self.isClaimed) {
                            return true;
                        }
                        return Date.now() > Date.parse(d.endAt);
                    }
                }
            }
        }
    }
    return false;
}

/**
 *
 * @param drop
 * @param inventory
 */
/*
export function areBenefitsInInventory(drop: TimeBasedDrop, inventory: Inventory): boolean {
    const gameEventDrops = inventory.gameEventDrops;
    if (gameEventDrops != null) {
        for (const benefitEdge of drop.benefitEdges) {
            let isBenefitClaimed = false;
            for (const d of gameEventDrops) {
                if (d.id === benefitEdge.benefit.id) {
                    // I haven't found a way to confirm that this specific drop was claimed, but if we get to this point it
                    // means one of two things: (1) We haven't made any progress towards the campaign, so it does not show up
                    // in the "dropCampaignsInProgress" section. (2) We have already claimed everything from this campaign.
                    // In the first case, the drop won't show up here either, so we can just return false. In the second case
                    // I assume that if we received a drop reward of the same type after this campaign started, that it has
                    // been claimed.
                    isBenefitClaimed = Date.parse(d.lastAwardedAt) > Date.parse(drop.startAt);
                    break;
                }
            }
            if (!isBenefitClaimed) {
                return false;
            }
        }
    }
    return false;
}*/
