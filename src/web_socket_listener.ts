import EventEmitter from "events";

import logger from "./logger.js";
import {CDPSession, Page} from "puppeteer";

export interface UserDropEvents_DropProgress {
    drop_id: string,
    current_progress_min: number,
    required_progress_min: number
}

export type CommunityPointsUserV1_PointsEarned_ReasonCode = "WATCH" | "CLAIM" | "WATCH_STREAK" | "RAID";

export interface CommunityPointsUserV1_PointsEarned {
    timestamp: string,
    channel_id: string,
    point_gain: {
        user_id: string,
        channel_id: string,
        total_points: number,
        baseline_points: number,
        reason_code: CommunityPointsUserV1_PointsEarned_ReasonCode,
        multipliers: any[]
    },
    balance: {
        user_id: string,
        channel_id: string,
        balance: number
    }
}

export declare interface WebSocketListener {
    on(event: "claim-available", listener: (data: any) => void): this;

    on(event: "points-earned", listener: (data: CommunityPointsUserV1_PointsEarned) => void): this;

    on(event: "drop-progress", listener: (data: any) => void): this;

    on(event: "drop-claim", listener: (data: any) => void): this;

    on(event: "viewcount", listener: (data: any) => void): this;

    on(event: "stream-down", listener: (data: any) => void): this;

    on(event: "stream-up", listener: (data: any) => void): this;
}

interface Payload {
    nonce: string
}

interface PongPayload extends Payload {
    type: "PONG"
}

interface MessagePayload extends Payload {
    type: "MESSAGE"
    topic: string,
    data: any
}

interface ResponsePayload extends Payload {
    type: "RESPONSE"
    error?: string
}

type PayloadType = MessagePayload | ResponsePayload | PongPayload;

interface WebSocketFrame {
    requestId: string,
    timestamp: number,
    response: {
        opcode: number,
        mask: boolean,
        payloadData: string
    }
}

export class WebSocketListener extends EventEmitter {

    #cdp?: CDPSession;

    /**
     * A cache of payloads that we have sent, but have not yet received a response for. This is used to log the payload
     * data when a response returns an error.
     * @private
     */
    #sentPayloads = new Map<string, PayloadType>();

    #ignoreTopicHandler = (message: any) => {
        return true;
    };

    #topicHandlers: { [key: string]: (message: any) => boolean } = {
        "user-drop-events": message => {
            const messageType = message["type"];
            switch (messageType) {
                case "drop-progress":
                    logger.debug("Drop progress: " + message["data"]["drop_id"] + " " + message["data"]["current_progress_min"] + " / " + message["data"]["required_progress_min"]);
                    this.emit(messageType, message["data"]);
                    return true;

                case "drop-claim":
                    logger.debug("DROP READY TO CLAIM: " + JSON.stringify(message["data"], null, 4));
                    this.emit(messageType, message["data"]);
                    return true;
            }
            return false;
        },
        "video-playback-by-id": message => {
            const messageType = message["type"];
            switch (messageType) {
                case "viewcount":
                    this.emit(messageType, parseInt(message["viewers"]));
                    return true;

                case "stream-down":
                case "stream-up":
                    this.emit(messageType, message);
                    return true;

                case "commercial":
                    return true;

                default:
                    return false;
            }
        },
        "community-points-user-v1": message => {
            const messageType = message["type"];
            switch (messageType) {
                case "claim-available":
                    this.emit(messageType, message);
                    return true;

                case "points-earned":
                    this.emit(messageType, message["data"]);
                    return true;

                case "reward-redeemed":
                case "claim-claimed":
                case "active-multipliers-updated":
                    return true;
                
                default: 
                    return false;
            }
        },
        "presence": this.#ignoreTopicHandler,
        "leaderboard-events-v1": this.#ignoreTopicHandler,
        "predictions-channel-v1": this.#ignoreTopicHandler,
        "broadcast-settings-update": this.#ignoreTopicHandler,
        "ads": this.#ignoreTopicHandler,
        "stream-chat-room-v1": this.#ignoreTopicHandler,
        "raid": this.#ignoreTopicHandler,
        "community-boost-events-v1": this.#ignoreTopicHandler,
        "creator-goals-events-v1": this.#ignoreTopicHandler,
        "channel-sub-gifts-v1": this.#ignoreTopicHandler,
        "channel-ext-v1": this.#ignoreTopicHandler,
        "community-points-channel-v1": this.#ignoreTopicHandler,
        "hype-train-events-v1": this.#ignoreTopicHandler,
        "polls": this.#ignoreTopicHandler,
        "channel-ad-poll-update-events": this.#ignoreTopicHandler,
        "channel-bounty-board-events.cta": this.#ignoreTopicHandler,
        "crowd-chant-channel-v1": this.#ignoreTopicHandler,
        "radio-events-v1": this.#ignoreTopicHandler,
        "stream-change-v1": this.#ignoreTopicHandler,
        "user-subscribe-events-v1": this.#ignoreTopicHandler,
        "onsite-notifications-v1": this.#ignoreTopicHandler,
        "update-summary": this.#ignoreTopicHandler,
        "create-notification": this.#ignoreTopicHandler  // alternative to detect drop ready to claim
    };

    async attach(page: Page) {
        this.#cdp = await page.target().createCDPSession();
        await this.#cdp.send("Network.enable");
        await this.#cdp.send("Page.enable");
        let pubSubWebSocketRequestId: string;
        this.#cdp.on("Network.webSocketCreated", socket => {
            if (socket["url"] === "wss://pubsub-edge.twitch.tv/v1") {
                pubSubWebSocketRequestId = socket["requestId"];
            }
        });
        this.#cdp.on("Network.webSocketFrameSent", (frame: WebSocketFrame) => {
           if (frame.requestId === pubSubWebSocketRequestId) {
               const payload: PayloadType = JSON.parse(frame.response.payloadData);
               this.#sentPayloads.set(payload.nonce, payload);
           }
        });
        this.#cdp.on("Network.webSocketFrameReceived", (frame: WebSocketFrame) => {
            if (frame.requestId === pubSubWebSocketRequestId) {
                const payload: PayloadType = JSON.parse(frame.response.payloadData);
                const payloadType = payload.type;
                if (payloadType === "PONG") {
                    logger.debug("PONG");
                } else if (payloadType === "RESPONSE") {
                    const error = payload.error;
                    if (error) {
                        const requestPayload = this.#sentPayloads.get(payload.nonce);
                        logger.error("Websocket response contained an error: '" + error + "' for payload: " + JSON.stringify(requestPayload));
                    }
                } else if (payloadType === "MESSAGE") {
                    // TODO: Some topics contain more than one period!
                    /* Example:
                     {
                        "type": "MESSAGE",
                        "data": {
                            "topic": "channel-bounty-board-events.cta.84778895",
                            "message": "{\"bounty_id\":\"aebd8430-8aaf-4902-b28b-57fce501cfdc\",\"game_id\":\"514790\",\"cta_url\":\"https://gaming.amazon.com/intro\",\"cta_title\":\"\",\"timestamp\":1636011575,\"type\":\"bounty_board_show_chat_cta\"}"
                        }
                    }
                     */
                    const topic = payload["data"]["topic"].split(".")[0];
                    const message = JSON.parse(payload["data"]["message"]);

                    this.emit("message", message);

                    // Call topic handler
                    const topicHandler = this.#topicHandlers[topic];
                    if (topicHandler) {
                        if (!topicHandler(message)) {
                            logger.debug("Unhandled socket message: " + JSON.stringify(payload, null, 4));
                        }
                    } else {
                        logger.debug("No topic handler for socket message: " + JSON.stringify(payload, null, 4));
                    }
                } else {
                    logger.debug("Unknown payload type: " + JSON.stringify(payload, null, 4));
                }

                // Remove payload from sent payloads cache
                this.#sentPayloads.delete(payload.nonce);
            }
        });
        this.#cdp.on("Network.webSocketFrameError", data => {
            logger.error("Web socket frame error:" + JSON.stringify(data, null, 4));
        });
        this.#cdp.on("Network.webSocketClosed ", data => {
            logger.error("Web socket closed:" + JSON.stringify(data, null, 4));
        });
    }

    async detach() {
        await this.#cdp?.detach();
    }

}

export default WebSocketListener;