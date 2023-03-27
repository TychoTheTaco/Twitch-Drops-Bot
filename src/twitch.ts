"use strict";

// @ts-ignore
import dnscache from "dnscache";

dnscache({enable: true});

import axios from "axios";

import logger from "./logger.js";
import assert from "assert";

export enum StreamTag {
    DROPS = "drops",
    DROPS_ENABLED = "dropsenabled"
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
            game: Game,
            imageAssetURL: string
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

export interface FreeformTag {
    id: string,
    name: string
}

export interface Broadcaster {
    id: string,
    login: string,
    displayName: string
}

export interface Stream {
    freeformTags: FreeformTag[];
    createdAt: string,
    game: Game,
    id: string,
    type: string,
    tags: Tag[],
    broadcaster: Broadcaster
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

export interface Options {
    clientId?: string,
    oauthToken?: string,
    userId?: string,
    deviceId?: string
}

interface Integrity {
    token: string,
    expiration: number,
    request_id: string
}

function parseJwt(token: string): string {
    return Buffer.from(token.split(".")[1], "base64").toString();
}

/**
 * A client for interacting with the Twitch GQL endpoint.
 */
export class Client {

    readonly #clientId: string;
    readonly #oauthToken?: string;
    #userId?: string;
    readonly #deviceId?: string;

    /**
     * https://github.com/mauricew/twitch-graphql-api#integrity
     * @private
     */
    #integrity?: Integrity;

    constructor(options?: Options) {
        this.#clientId = options?.clientId ?? "kimne78kx3ncx6brgo4mv6wki5h1ko";
        this.#oauthToken = options?.oauthToken;
        this.#userId = options?.userId;
        this.#deviceId = options?.deviceId;
    }

    static async fromCookies(cookies: any): Promise<Client> {
        // Get some data from the cookies
        let oauthToken: string | undefined = undefined;
        let channelLogin: string | undefined = undefined;
        let deviceId: string | undefined = undefined;
        for (const cookie of cookies) {
            switch (cookie["name"]) {
                case "auth-token":  // OAuth token
                    oauthToken = cookie["value"];
                    break;

                case "persistent":  // "channelLogin" Used for "DropCampaignDetails" operation
                    channelLogin = cookie["value"].split("%3A")[0];
                    break;

                case "unique_id":
                    deviceId = cookie["value"];
                    break;
            }
        }

        if (!oauthToken) {
            throw new Error("Invalid cookies!");
        }

        if (!deviceId) {
            throw new Error("Missing device ID!");
        }

        const options: Options = {oauthToken: oauthToken, userId: channelLogin, deviceId: deviceId};

        const client = new Client(options);
        if (!channelLogin) {
            await client.#autoDetectUserId();
            logger.info("auto detected user id");
        }

        return client;
    }

    async #autoDetectUserId(): Promise<string | undefined> {
        const data = await this.#postAuthorized({
            "operationName": "CoreActionsCurrentUser",
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "6b5b63a013cf66a995d61f71a508ab5c8e4473350c5d4136f846ba65e8101e95"
                }
            }
        });
        this.#userId = data["data"]["currentUser"]["id"];
        return this.#userId;
    }

    async postWrapper(data: any, headers: { [key: string]: string }) {
        const response = await axios.post("https://gql.twitch.tv/gql", data,
            {
                headers: headers
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

                    const messages = ["service timeout", "service error", "failed integrity check"];

                    // For some errors, we don't need to include the response data since it is not helpful
                    const message = error["message"];
                    if (messages.includes(message)) {
                        throw new Error("API error: " + message);
                    }
                }
            }

            throw new Error("API error: " + JSON.stringify(response.data, null, 4));
        }

        // Return the response data
        return response.data;
    }

    async #postIntegrity(): Promise<Integrity> {
        logger.debug("post integrity");
        assert(this.#deviceId, "Missing device ID");
        const response = await axios.post("https://gql.twitch.tv/integrity", null, {
            headers: {
                "Client-Id": this.#clientId,
                "Authorization": `OAuth ${this.#oauthToken}`,
                "X-Device-Id": this.#deviceId
            }
        });
        logger.debug("integrity response: " + JSON.stringify(response.data, null, 4));
        const decoded = parseJwt((response.data.token as string).slice(3));
        logger.debug("decoded: " + decoded);
        if (decoded.includes('"is_bad_bot":"true"')) {
            logger.debug("BAD BOT!");
        }
        return response.data;
    }

    async #ensureIntegrity() {
        logger.debug("EXP: " + this.#integrity?.expiration + " NOW: " + new Date().getTime());
        if (this.#integrity && this.#integrity.expiration > new Date().getTime()) {
            logger.debug("integ still valid");
            return;
        }
        this.#integrity = await this.#postIntegrity();
    }

    /**
     * Send a POST request to the Twitch GQL endpoint.
     * @param data The data to send to the API.
     * @private
     */
    async #post(data: any): Promise<any> {
        return this.postWrapper(data, {
            "Content-Type": "text/plain;charset=UTF-8",
            "Client-Id": this.#clientId
        });
    }

    /**
     * Send a POST request to the Twitch GQL endpoint. The request will include authentication headers.
     * @param data The data to send to the API.
     * @param headers
     * @private
     */
    async #postAuthorized(data: any, headers: any = {}): Promise<any> {
        assert(this.#oauthToken !== undefined, "Missing OAuth token!");
        headers["Content-Type"] = "text/plain;charset=UTF-8";
        headers["Client-Id"] = this.#clientId;
        headers["Authorization"] = `OAuth ${this.#oauthToken}`;
        return this.postWrapper(data, headers);
    }

    async getGameIdFromName(name: string): Promise<string | null> {
        const data = await this.#post({
            "operationName": "DirectoryRoot_Directory",
            "variables": {
                "name": name
            },
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "9f4f6ae67f21ee50b454fcf048691107a52bfe7907ead73b9427398e343ca319"
                }
            }
        });
        const game = data.data.game;
        if (game) {
            return game.id;
        }
        return null;
    }

    /**
     * Get a list of drop campaigns. This can include expired, active, and future campaigns.
     */
    async getDropCampaigns(): Promise<DropCampaign[]> {
        const data = await this.#postAuthorized({
            "operationName": "ViewerDropsDashboard",
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "8d5d9b5e3f088f9d1ff39eb2caab11f7a4cf7a3353da9ce82b5778226ff37268"
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
        const data = await this.#postAuthorized({
            "operationName": "DropCampaignDetails",
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "f6396f5ffdde867a8f6f6da18286e4baf02e5b98d14689a69b5af320a4c7b7b8"
                }
            },
            "variables": {
                "dropID": dropId,
                "channelLogin": this.#userId
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
        const data = await this.#postAuthorized({
            "operationName": "Inventory",
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "37fea486d6179047c41d0f549088a4c3a7dd60c05c70956a1490262f532dccd9"
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
    async getActiveStreams(gameName: string, options?: { tags?: string[] }): Promise<Stream[]> {
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
                    "freeformTags": options?.tags ?? [],
                    "tags": []
                },
                "sortTypeIsRecency": false,
                "limit": 30
            },
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "df4bb6cc45055237bfaf3ead608bbafb79815c7100b6ee126719fac3762ddf8b"
                }
            }
        });
        

        const streams = data["data"]["game"]["streams"];
        if (streams === null) {
            return [];
        }

        const result = [];
        for (const stream of streams["edges"]) {
            result.push(stream["node"]);
        }
        return result;
    }

    async claimDropReward(dropId: string) {
        await this.#ensureIntegrity();
        assert(this.#integrity, "Missing integrity");
        assert(this.#deviceId, "Missing device ID");
        return await this.#postAuthorized({
            "operationName": "DropsPage_ClaimDropRewards",
            "variables": {
                "input": {
                    "dropInstanceID": dropId
                }
            },
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "a455deea71bdc9015b78eb49f4acfbce8baa7ccbedd28e549bb025bd0f751930"
                }
            }
        }, {
            "Client-Integrity": this.#integrity.token,
            "X-Device-Id": this.#deviceId
        });
    }

    async getStream(username: string): Promise<{
        id: string,
        viewersCount: number
    } | null> {
        const data = await this.#post({
            "operationName": "ChannelShell",
            "variables": {
                "login": username
            },
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "580ab410bcd0c1ad194224957ae2241e5d252b2c5173d8e0cce9d32d5bb14efe"
                }
            }
        });
        return data["data"]["userOrError"]["stream"];
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
                    "sha256Hash": "a4747cac9d8e8bf6cf80969f6da6363ca1bdbd80fe136797e71504eb404313fd"
                }
            }
        });
        return data["data"]["user"];
    }

    async getAvailableCampaigns(channelId: string): Promise<TimeBasedDrop[]> {
        const data = await this.#postAuthorized({
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

    async getUserLoginFromId(id: string) {
        const data = await this.#post({
            "operationName": "ChannelLeaderboards",
            "variables": {
                "first": 1,
                "channelID": id
            },
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "226807519d6ef966dc5a74e8d5dbad3d4d1a46b135511f1dd69e4f0b417aaf9c"
                }
            }
        });
        return data["data"]["user"]["login"];
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

export function getDropBenefitNames(drop: TimeBasedDrop): string {
    let result = "";
    for (let i = 0; i < drop.benefitEdges.length; ++i) {
        result += drop.benefitEdges[i].benefit.name;
        if (i < drop.benefitEdges.length - 1) {
            result += ", ";
        }
    }
    return result;
}

export function getStreamUrl(username: string) {
    return "https://www.twitch.tv/" + username;
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
