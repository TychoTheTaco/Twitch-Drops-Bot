'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _WebSocketListener_cdp, _WebSocketListener_ignoreTopicHandler, _WebSocketListener_topicHandlers;
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = __importDefault(require("events"));
const logger_1 = __importDefault(require("./logger"));
class WebSocketListener extends events_1.default {
    constructor() {
        super(...arguments);
        _WebSocketListener_cdp.set(this, void 0);
        _WebSocketListener_ignoreTopicHandler.set(this, (message) => {
            return true;
        });
        _WebSocketListener_topicHandlers.set(this, {
            'user-drop-events': message => {
                const messageType = message['type'];
                switch (messageType) {
                    case 'drop-progress':
                        logger_1.default.debug('Drop progress: ' + message['data']['drop_id'] + ' ' + message['data']['current_progress_min'] + ' / ' + message['data']['required_progress_min']);
                        this.emit(messageType, message['data']);
                        return true;
                    case 'drop-claim':
                        logger_1.default.debug('DROP READY TO CLAIM: ' + JSON.stringify(message['data'], null, 4));
                        this.emit(messageType, message['data']);
                        return true;
                }
                return false;
            },
            'video-playback-by-id': message => {
                const messageType = message['type'];
                switch (messageType) {
                    case 'viewcount':
                        this.emit(messageType, parseInt(message['viewers']));
                        return true;
                    case 'stream-down':
                        this.emit(messageType, message);
                        return true;
                    case 'stream-up':
                        this.emit(messageType, message);
                        return true;
                    case 'commercial':
                        return true;
                }
                return false;
            },
            'community-points-user-v1': message => {
                const messageType = message['type'];
                switch (messageType) {
                    case 'claim-available':
                        this.emit(messageType, message);
                        return true;
                    case 'points-earned':
                    case 'reward-redeemed':
                        return true;
                }
                return false;
            },
            'presence': __classPrivateFieldGet(this, _WebSocketListener_ignoreTopicHandler, "f"),
            'leaderboard-events-v1': __classPrivateFieldGet(this, _WebSocketListener_ignoreTopicHandler, "f"),
            'predictions-channel-v1': __classPrivateFieldGet(this, _WebSocketListener_ignoreTopicHandler, "f"),
            'broadcast-settings-update': __classPrivateFieldGet(this, _WebSocketListener_ignoreTopicHandler, "f"),
            'ads': __classPrivateFieldGet(this, _WebSocketListener_ignoreTopicHandler, "f"),
            'stream-chat-room-v1': __classPrivateFieldGet(this, _WebSocketListener_ignoreTopicHandler, "f"),
            'raid': __classPrivateFieldGet(this, _WebSocketListener_ignoreTopicHandler, "f"),
            'community-boost-events-v1': __classPrivateFieldGet(this, _WebSocketListener_ignoreTopicHandler, "f"),
            'creator-goals-events-v1': __classPrivateFieldGet(this, _WebSocketListener_ignoreTopicHandler, "f"),
            'channel-sub-gifts-v1': __classPrivateFieldGet(this, _WebSocketListener_ignoreTopicHandler, "f"),
            'channel-ext-v1': __classPrivateFieldGet(this, _WebSocketListener_ignoreTopicHandler, "f"),
            'community-points-channel-v1': __classPrivateFieldGet(this, _WebSocketListener_ignoreTopicHandler, "f"),
            'hype-train-events-v1': __classPrivateFieldGet(this, _WebSocketListener_ignoreTopicHandler, "f"),
            'polls': __classPrivateFieldGet(this, _WebSocketListener_ignoreTopicHandler, "f"),
            'channel-ad-poll-update-events': __classPrivateFieldGet(this, _WebSocketListener_ignoreTopicHandler, "f"),
            'channel-bounty-board-events.cta': __classPrivateFieldGet(this, _WebSocketListener_ignoreTopicHandler, "f"),
            'crowd-chant-channel-v1': __classPrivateFieldGet(this, _WebSocketListener_ignoreTopicHandler, "f")
        });
    }
    attach(page) {
        return __awaiter(this, void 0, void 0, function* () {
            __classPrivateFieldSet(this, _WebSocketListener_cdp, yield page.target().createCDPSession(), "f");
            yield __classPrivateFieldGet(this, _WebSocketListener_cdp, "f").send('Network.enable');
            yield __classPrivateFieldGet(this, _WebSocketListener_cdp, "f").send('Page.enable');
            let pubSubWebSocketRequestId;
            __classPrivateFieldGet(this, _WebSocketListener_cdp, "f").on('Network.webSocketCreated', socket => {
                if (socket['url'] === 'wss://pubsub-edge.twitch.tv/v1') {
                    pubSubWebSocketRequestId = socket['requestId'];
                }
            });
            __classPrivateFieldGet(this, _WebSocketListener_cdp, "f").on('Network.webSocketFrameReceived', frame => {
                if (frame['requestId'] === pubSubWebSocketRequestId) {
                    const payload = JSON.parse(frame['response']['payloadData']);
                    const payloadType = payload['type'];
                    if (payloadType === 'PONG') {
                        logger_1.default.debug('PONG');
                    }
                    else if (payloadType === 'RESPONSE') {
                        if (payload['error']) {
                            logger_1.default.debug('Error in payload: ' + JSON.stringify(payload, null, 4));
                        }
                    }
                    else if (payloadType === 'MESSAGE') {
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
                        const topic = payload['data']['topic'].split('.')[0];
                        const message = JSON.parse(payload['data']['message']);
                        // Call topic handler
                        const topicHandler = __classPrivateFieldGet(this, _WebSocketListener_topicHandlers, "f")[topic];
                        if (topicHandler) {
                            if (!topicHandler(message)) {
                                logger_1.default.debug('Unhandled socket message: ' + JSON.stringify(payload, null, 4));
                            }
                        }
                        else {
                            logger_1.default.debug('No topic handler for socket message: ' + JSON.stringify(payload, null, 4));
                        }
                    }
                    else {
                        logger_1.default.debug('Unknown payload type: ' + JSON.stringify(payload, null, 4));
                    }
                }
            });
        });
    }
    detach() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            yield ((_a = __classPrivateFieldGet(this, _WebSocketListener_cdp, "f")) === null || _a === void 0 ? void 0 : _a.detach());
        });
    }
}
_WebSocketListener_cdp = new WeakMap(), _WebSocketListener_ignoreTopicHandler = new WeakMap(), _WebSocketListener_topicHandlers = new WeakMap();
exports.default = WebSocketListener;
