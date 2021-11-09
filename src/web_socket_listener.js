'use strict';

const EventEmitter = require('events');

const logger = require('./logger');

class WebSocketListener extends EventEmitter {

    #ignoreTopicHandler = message => {
        return true;
    }

    #topicHandlers = {
        'user-drop-events': message => {
            const messageType = message['type'];
            switch (messageType) {
                case 'drop-progress':
                    logger.debug('Drop progress: ' + message['data']['drop_id'] + ' ' + message['data']['current_progress_min'] + ' / ' + message['data']['required_progress_min']);
                    this.emit(messageType, message['data']);
                    return true;

                case 'drop-claim':
                    logger.debug('DROP READY TO CLAIM: ' + JSON.stringify(message['data'], null, 4));
                    this.emit(messageType, message['data']);
                    return true;
            }
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
        },
        'presence': this.#ignoreTopicHandler,
        'leaderboard-events-v1': this.#ignoreTopicHandler,
        'predictions-channel-v1': this.#ignoreTopicHandler,
        'broadcast-settings-update': this.#ignoreTopicHandler,
        'ads': this.#ignoreTopicHandler,
        'stream-chat-room-v1': this.#ignoreTopicHandler,
        'raid': this.#ignoreTopicHandler,
        'community-boost-events-v1': this.#ignoreTopicHandler,
        'creator-goals-events-v1': this.#ignoreTopicHandler,
        'channel-sub-gifts-v1': this.#ignoreTopicHandler,
        'channel-ext-v1': this.#ignoreTopicHandler,
        'community-points-channel-v1': this.#ignoreTopicHandler,
        'hype-train-events-v1': this.#ignoreTopicHandler,
        'polls': this.#ignoreTopicHandler,
        'channel-ad-poll-update-events': this.#ignoreTopicHandler,
        'channel-bounty-board-events.cta': this.#ignoreTopicHandler,
        'crowd-chant-channel-v1': this.#ignoreTopicHandler
    };

    async attach(page) {
        this.cdp = await page.target().createCDPSession();
        await this.cdp.send('Network.enable');
        await this.cdp.send('Page.enable');
        let pubSubWebSocketRequestId = null;
        this.cdp.on('Network.webSocketCreated', socket => {
            if (socket['url'] === 'wss://pubsub-edge.twitch.tv/v1') {
                pubSubWebSocketRequestId = socket['requestId'];
            }
        });
        this.cdp.on('Network.webSocketFrameReceived', frame => {
            if (frame['requestId'] === pubSubWebSocketRequestId) {
                const payload = JSON.parse(frame['response']['payloadData']);
                const payloadType = payload['type'];
                if (payloadType === 'PONG') {
                    logger.debug('PONG');
                } else if (payloadType === 'RESPONSE') {
                    if (payload['error']) {
                        logger.debug('Error in payload: ' + JSON.stringify(payload, null, 4));
                    }
                } else if (payloadType === 'MESSAGE') {
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
                    const topicHandler = this.#topicHandlers[topic];
                    if (topicHandler) {
                        if (!topicHandler(message)) {
                            logger.debug('Unhandled socket message: ' + JSON.stringify(payload, null, 4));
                        }
                    } else {
                        logger.debug('No topic handler for socket message: ' + JSON.stringify(payload, null, 4));
                    }
                } else {
                    logger.debug('Unknown payload type: ' + JSON.stringify(payload, null, 4));
                }
            }
        });
    }

    async detach() {
        await this.cdp.detach();
    }

}

module.exports = WebSocketListener;
