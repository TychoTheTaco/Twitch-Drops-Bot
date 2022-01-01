"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _TwitchDropsBot_instances, _TwitchDropsBot_gameIds, _TwitchDropsBot_dropCampaignPollingInterval, _TwitchDropsBot_failedStreamRetryCount, _TwitchDropsBot_failedStreamBlacklistTimeout, _TwitchDropsBot_loadTimeoutSeconds, _TwitchDropsBot_hideVideo, _TwitchDropsBot_watchUnlistedGames, _TwitchDropsBot_showAccountNotLinkedWarning, _TwitchDropsBot_twitchClient, _TwitchDropsBot_page, _TwitchDropsBot_twitchDropsWatchdog, _TwitchDropsBot_pendingDropCampaignIds, _TwitchDropsBot_pendingDropCampaignIdsNotifier, _TwitchDropsBot_progressBar, _TwitchDropsBot_payload, _TwitchDropsBot_total, _TwitchDropsBot_currentProgress, _TwitchDropsBot_isFirstOutput, _TwitchDropsBot_hasWrittenNewLine, _TwitchDropsBot_webSocketListener, _TwitchDropsBot_currentDropCampaignId, _TwitchDropsBot_dropCampaignMap, _TwitchDropsBot_pendingHighPriority, _TwitchDropsBot_currentDrop, _TwitchDropsBot_targetDrop, _TwitchDropsBot_viewerCount, _TwitchDropsBot_currentMinutesWatched, _TwitchDropsBot_lastMinutesWatched, _TwitchDropsBot_lastProgressTime, _TwitchDropsBot_isDropReadyToClaim, _TwitchDropsBot_isStreamDown, _TwitchDropsBot_processDropCampaign, _TwitchDropsBot_claimDropReward, _TwitchDropsBot_waitUntilElementRendered, _TwitchDropsBot_ansiEscape, _TwitchDropsBot_startProgressBar, _TwitchDropsBot_updateProgressBar, _TwitchDropsBot_stopProgressBar, _TwitchDropsBot_createProgressBar, _TwitchDropsBot_watchStreamUntilCampaignCompleted, _TwitchDropsBot_getFirstUnclaimedDrop, _TwitchDropsBot_isDropClaimed, _TwitchDropsBot_getActiveStreams, _TwitchDropsBot_getDropCampaignFullName, _TwitchDropsBot_getDropCampaignById, _TwitchDropsBot_getDropName;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitchDropsBot = void 0;
const SortedArray = require("sorted-array-type");
const WaitNotify = require("wait-notify");
const cliProgress = require("cli-progress");
const { BarFormat } = cliProgress.Format;
const TimeoutError = require("puppeteer").errors.TimeoutError;
const web_socket_listener_1 = __importDefault(require("./web_socket_listener"));
const watchdog_1 = require("./watchdog");
const stream_1 = require("./pages/stream");
const utils_1 = __importDefault(require("./utils"));
const logger_1 = __importDefault(require("./logger"));
class NoStreamsError extends Error {
}
class NoProgressError extends Error {
}
class HighPriorityError extends Error {
}
class StreamLoadFailedError extends Error {
}
class StreamDownError extends Error {
}
class TwitchDropsBot {
    constructor(page, client, optional) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        _TwitchDropsBot_instances.add(this);
        // A list of game IDs to watch and claim drops for.
        _TwitchDropsBot_gameIds.set(this, []);
        // The number of minutes to wait in between refreshing the drop campaign list
        _TwitchDropsBot_dropCampaignPollingInterval.set(this, 15);
        // When a Stream fails #failedStreamRetryCount times (it went offline, or other reasons), it gets added to a
        // blacklist so we don't waste our time trying it. It is removed from the blacklist if we switch drop campaigns
        // or after #failedStreamBlacklistTimeout minutes.
        _TwitchDropsBot_failedStreamRetryCount.set(this, 3);
        _TwitchDropsBot_failedStreamBlacklistTimeout.set(this, 30);
        // When we use page.load(), the default timeout is 30 seconds, increasing this value can help when using low-end
        // devices (such as a Raspberry Pi) or when using a slower network connection.
        _TwitchDropsBot_loadTimeoutSeconds.set(this, 30);
        // Setting the visibility of a video to "hidden" will lower the CPU usage.
        _TwitchDropsBot_hideVideo.set(this, false);
        // When true, the bot will attempt to watch and claim drops for all games, even if they are not in 'gameIds'.
        // The games in 'gameIds' still have priority.
        _TwitchDropsBot_watchUnlistedGames.set(this, false);
        // Show a warning if the Twitch account is not linked to the drop campaign
        _TwitchDropsBot_showAccountNotLinkedWarning.set(this, true);
        // Twitch API client to use.
        _TwitchDropsBot_twitchClient.set(this, void 0);
        _TwitchDropsBot_page.set(this, void 0);
        _TwitchDropsBot_twitchDropsWatchdog.set(this, void 0);
        _TwitchDropsBot_pendingDropCampaignIds.set(this, new SortedArray((a, b) => {
            if (a === b) {
                return 0;
            }
            const campaignA = __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_getDropCampaignById).call(this, a);
            const campaignB = __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_getDropCampaignById).call(this, b);
            // Sort campaigns based on order of game IDs specified in config
            const indexA = __classPrivateFieldGet(this, _TwitchDropsBot_gameIds, "f").indexOf(campaignA['game']['id']);
            const indexB = __classPrivateFieldGet(this, _TwitchDropsBot_gameIds, "f").indexOf(campaignB['game']['id']);
            if (indexA === -1 && indexB !== -1) {
                return 1;
            }
            else if (indexA !== -1 && indexB === -1) {
                return -1;
            }
            else if (indexA === indexB) { // Both games have the same priority. Give priority to the one that ends first.
                const endTimeA = Date.parse(campaignA['endAt']);
                const endTimeB = Date.parse(campaignB['endAt']);
                if (endTimeA === endTimeB) {
                    return a < b ? -1 : 1;
                }
                return endTimeA < endTimeB ? -1 : 1;
            }
            return Math.sign(indexA - indexB);
        }));
        _TwitchDropsBot_pendingDropCampaignIdsNotifier.set(this, new WaitNotify());
        _TwitchDropsBot_progressBar.set(this, null);
        _TwitchDropsBot_payload.set(this, null);
        _TwitchDropsBot_total.set(this, null);
        _TwitchDropsBot_currentProgress.set(this, null);
        _TwitchDropsBot_isFirstOutput.set(this, true);
        _TwitchDropsBot_hasWrittenNewLine.set(this, false);
        _TwitchDropsBot_webSocketListener.set(this, new web_socket_listener_1.default());
        _TwitchDropsBot_currentDropCampaignId.set(this, null);
        _TwitchDropsBot_dropCampaignMap.set(this, {});
        _TwitchDropsBot_pendingHighPriority.set(this, false);
        /**
         * The drop that we are currently making progress towards.
         */
        _TwitchDropsBot_currentDrop.set(this, null);
        /**
         * The drop that we are trying to make progress towards. Sometimes when watching a stream, we make progress towards
         * a different drop than we had intended. This can happen when a game has multiple drop campaigns and we try to
         * process one, but a different one is currently active.
         */
        _TwitchDropsBot_targetDrop.set(this, null);
        _TwitchDropsBot_viewerCount.set(this, 0);
        _TwitchDropsBot_currentMinutesWatched.set(this, {});
        _TwitchDropsBot_lastMinutesWatched.set(this, {});
        _TwitchDropsBot_lastProgressTime.set(this, {});
        _TwitchDropsBot_isDropReadyToClaim.set(this, false);
        _TwitchDropsBot_isStreamDown.set(this, false);
        __classPrivateFieldSet(this, _TwitchDropsBot_page, page, "f");
        __classPrivateFieldSet(this, _TwitchDropsBot_twitchClient, client, "f");
        (_a = optional === null || optional === void 0 ? void 0 : optional.gameIds) === null || _a === void 0 ? void 0 : _a.forEach((id => {
            __classPrivateFieldGet(this, _TwitchDropsBot_gameIds, "f").push(id);
        }));
        __classPrivateFieldSet(this, _TwitchDropsBot_dropCampaignPollingInterval, (_b = optional === null || optional === void 0 ? void 0 : optional.dropCampaignPollingInterval) !== null && _b !== void 0 ? _b : __classPrivateFieldGet(this, _TwitchDropsBot_dropCampaignPollingInterval, "f"), "f");
        __classPrivateFieldSet(this, _TwitchDropsBot_failedStreamBlacklistTimeout, (_c = optional === null || optional === void 0 ? void 0 : optional.failedStreamBlacklistTimeout) !== null && _c !== void 0 ? _c : __classPrivateFieldGet(this, _TwitchDropsBot_failedStreamBlacklistTimeout, "f"), "f");
        __classPrivateFieldSet(this, _TwitchDropsBot_failedStreamRetryCount, (_d = optional === null || optional === void 0 ? void 0 : optional.failedStreamRetryCount) !== null && _d !== void 0 ? _d : __classPrivateFieldGet(this, _TwitchDropsBot_failedStreamRetryCount, "f"), "f");
        __classPrivateFieldSet(this, _TwitchDropsBot_hideVideo, (_e = optional === null || optional === void 0 ? void 0 : optional.hideVideo) !== null && _e !== void 0 ? _e : __classPrivateFieldGet(this, _TwitchDropsBot_hideVideo, "f"), "f");
        __classPrivateFieldSet(this, _TwitchDropsBot_loadTimeoutSeconds, (_f = optional === null || optional === void 0 ? void 0 : optional.loadTimeoutSeconds) !== null && _f !== void 0 ? _f : __classPrivateFieldGet(this, _TwitchDropsBot_loadTimeoutSeconds, "f"), "f");
        __classPrivateFieldGet(this, _TwitchDropsBot_page, "f").setDefaultTimeout(__classPrivateFieldGet(this, _TwitchDropsBot_loadTimeoutSeconds, "f") * 1000);
        __classPrivateFieldSet(this, _TwitchDropsBot_watchUnlistedGames, (_g = optional === null || optional === void 0 ? void 0 : optional.watchUnlistedGames) !== null && _g !== void 0 ? _g : __classPrivateFieldGet(this, _TwitchDropsBot_watchUnlistedGames, "f"), "f");
        __classPrivateFieldSet(this, _TwitchDropsBot_showAccountNotLinkedWarning, (_h = optional === null || optional === void 0 ? void 0 : optional.showAccountNotLinkedWarning) !== null && _h !== void 0 ? _h : __classPrivateFieldGet(this, _TwitchDropsBot_showAccountNotLinkedWarning, "f"), "f");
        // Set up Twitch Drops Watchdog
        __classPrivateFieldSet(this, _TwitchDropsBot_twitchDropsWatchdog, new watchdog_1.TwitchDropsWatchdog(__classPrivateFieldGet(this, _TwitchDropsBot_twitchClient, "f"), __classPrivateFieldGet(this, _TwitchDropsBot_dropCampaignPollingInterval, "f")), "f");
        __classPrivateFieldGet(this, _TwitchDropsBot_twitchDropsWatchdog, "f").on('before_update', () => {
            logger_1.default.log(__classPrivateFieldGet(this, _TwitchDropsBot_progressBar, "f") === null ? 'info' : 'debug', 'Updating drop campaigns...');
        });
        __classPrivateFieldGet(this, _TwitchDropsBot_twitchDropsWatchdog, "f").on('update', (campaigns) => __awaiter(this, void 0, void 0, function* () {
            logger_1.default.log(__classPrivateFieldGet(this, _TwitchDropsBot_progressBar, "f") === null ? 'info' : 'debug', 'Found ' + campaigns.length + ' campaigns.');
            while (__classPrivateFieldGet(this, _TwitchDropsBot_pendingDropCampaignIds, "f").length > 0) {
                __classPrivateFieldGet(this, _TwitchDropsBot_pendingDropCampaignIds, "f").pop();
            }
            // Add to pending
            campaigns.forEach(campaign => {
                // Ignore drop campaigns that are not either active or upcoming
                const campaignStatus = campaign.status;
                if (campaignStatus !== 'ACTIVE' && campaignStatus !== 'UPCOMING') {
                    return;
                }
                const dropCampaignId = campaign.id;
                __classPrivateFieldGet(this, _TwitchDropsBot_dropCampaignMap, "f")[dropCampaignId] = campaign;
                if (__classPrivateFieldGet(this, _TwitchDropsBot_gameIds, "f").length === 0 || __classPrivateFieldGet(this, _TwitchDropsBot_gameIds, "f").includes(campaign.game.id) || __classPrivateFieldGet(this, _TwitchDropsBot_watchUnlistedGames, "f")) {
                    // Check if this campaign is finished already TODO: Find a reliable way of checking if we finished a campaign
                    /*if (this.#completedCampaignIds.has(dropCampaignId)) {
                        return;
                    }*/
                    // Make sure Twitch account is linked
                    if (!campaign['self']['isAccountConnected']) {
                        if (__classPrivateFieldGet(this, _TwitchDropsBot_showAccountNotLinkedWarning, "f")) {
                            __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_stopProgressBar).call(this);
                            logger_1.default.warn('Twitch account not linked for drop campaign: ' + __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_getDropCampaignFullName).call(this, dropCampaignId));
                        }
                        return;
                    }
                    __classPrivateFieldGet(this, _TwitchDropsBot_pendingDropCampaignIds, "f").insert(dropCampaignId);
                }
            });
            logger_1.default.log(__classPrivateFieldGet(this, _TwitchDropsBot_progressBar, "f") === null ? 'info' : 'debug', 'Found ' + __classPrivateFieldGet(this, _TwitchDropsBot_pendingDropCampaignIds, "f").length + ' pending campaigns.');
            // Check if we are currently working on a drop campaign
            if (__classPrivateFieldGet(this, _TwitchDropsBot_currentDropCampaignId, "f") !== null) {
                // Check if there is a higher priority stream we should be watching
                __classPrivateFieldSet(this, _TwitchDropsBot_pendingHighPriority, false, "f");
                for (let i = 0; i < __classPrivateFieldGet(this, _TwitchDropsBot_pendingDropCampaignIds, "f").length; ++i) {
                    const firstCampaignId = __classPrivateFieldGet(this, _TwitchDropsBot_pendingDropCampaignIds, "f")[i];
                    if (firstCampaignId === __classPrivateFieldGet(this, _TwitchDropsBot_currentDropCampaignId, "f")) {
                        break;
                    }
                    const firstDrop = yield __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_getFirstUnclaimedDrop).call(this, firstCampaignId);
                    if (firstDrop !== null) {
                        // Check if this drop is ready to be claimed
                        let claimed = false;
                        const inventoryDrop = yield __classPrivateFieldGet(this, _TwitchDropsBot_twitchClient, "f").getInventoryDrop(firstDrop['id'], firstCampaignId);
                        if (inventoryDrop != null) {
                            if (inventoryDrop['self']['currentMinutesWatched'] >= inventoryDrop['requiredMinutesWatched']) {
                                yield __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_claimDropReward).call(this, inventoryDrop);
                                claimed = true;
                            }
                        }
                        if (!claimed) {
                            // Make sure there are active streams before switching
                            const details = yield __classPrivateFieldGet(this, _TwitchDropsBot_twitchClient, "f").getDropCampaignDetails(firstCampaignId);
                            if ((yield __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_getActiveStreams).call(this, firstCampaignId, details)).length > 0) {
                                __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_stopProgressBar).call(this);
                                logger_1.default.info('Higher priority campaign found: ' + __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_getDropCampaignFullName).call(this, firstCampaignId) + ' id: ' + firstCampaignId + ' time: ' + new Date().getTime());
                                __classPrivateFieldSet(this, _TwitchDropsBot_pendingHighPriority, true, "f");
                                break;
                            }
                        }
                    }
                }
            }
            __classPrivateFieldGet(this, _TwitchDropsBot_pendingDropCampaignIdsNotifier, "f").notifyAll();
            __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_startProgressBar).call(this);
        }));
        __classPrivateFieldGet(this, _TwitchDropsBot_twitchDropsWatchdog, "f").start();
        // Set up web socket listener
        __classPrivateFieldGet(this, _TwitchDropsBot_webSocketListener, "f").on('viewcount', count => {
            __classPrivateFieldSet(this, _TwitchDropsBot_viewerCount, count, "f");
        });
        __classPrivateFieldGet(this, _TwitchDropsBot_webSocketListener, "f").on('drop-progress', (data) => __awaiter(this, void 0, void 0, function* () {
            var _j, _k, _l, _m, _o, _p, _q, _r;
            // Check if we are making progress towards the expected drop. This is not always the case since a game may
            // have multiple drop campaigns, but only one is active at a time. If this happens, then we will just set
            // the current drop to the one we are making progress on.
            const dropId = data['drop_id'];
            if (dropId !== ((_j = __classPrivateFieldGet(this, _TwitchDropsBot_currentDrop, "f")) === null || _j === void 0 ? void 0 : _j.id)) {
                logger_1.default.debug('Drop progress message does not match expected drop: ' + ((_k = __classPrivateFieldGet(this, _TwitchDropsBot_currentDrop, "f")) === null || _k === void 0 ? void 0 : _k.id) + ' vs ' + dropId);
                if (!(dropId in __classPrivateFieldGet(this, _TwitchDropsBot_currentMinutesWatched, "f"))) {
                    __classPrivateFieldGet(this, _TwitchDropsBot_currentMinutesWatched, "f")[dropId] = data['current_progress_min'];
                    __classPrivateFieldGet(this, _TwitchDropsBot_lastMinutesWatched, "f")[dropId] = data['current_progress_min'];
                }
            }
            // Check if we are making progress
            __classPrivateFieldGet(this, _TwitchDropsBot_currentMinutesWatched, "f")[dropId] = data['current_progress_min'];
            if (__classPrivateFieldGet(this, _TwitchDropsBot_currentMinutesWatched, "f")[dropId] > __classPrivateFieldGet(this, _TwitchDropsBot_lastMinutesWatched, "f")[dropId]) {
                __classPrivateFieldGet(this, _TwitchDropsBot_lastProgressTime, "f")[dropId] = new Date().getTime();
                __classPrivateFieldGet(this, _TwitchDropsBot_lastMinutesWatched, "f")[dropId] = __classPrivateFieldGet(this, _TwitchDropsBot_currentMinutesWatched, "f")[dropId];
                if (dropId !== ((_l = __classPrivateFieldGet(this, _TwitchDropsBot_currentDrop, "f")) === null || _l === void 0 ? void 0 : _l.id)) {
                    __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_stopProgressBar).call(this, true);
                    logger_1.default.info('Drop progress does not match expected drop: ' + ((_m = __classPrivateFieldGet(this, _TwitchDropsBot_currentDrop, "f")) === null || _m === void 0 ? void 0 : _m.id) + ' vs ' + dropId);
                    // If we made progress for a different drop, switch to it
                    __classPrivateFieldSet(this, _TwitchDropsBot_currentDrop, yield __classPrivateFieldGet(this, _TwitchDropsBot_twitchClient, "f").getInventoryDrop(dropId), "f");
                    if (!__classPrivateFieldGet(this, _TwitchDropsBot_currentDrop, "f")) {
                        throw new Error('Made progress towards a drop but did not find it in inventory!');
                    }
                    if (!(__classPrivateFieldGet(this, _TwitchDropsBot_currentDrop, "f").id in __classPrivateFieldGet(this, _TwitchDropsBot_currentMinutesWatched, "f"))) {
                        __classPrivateFieldGet(this, _TwitchDropsBot_currentMinutesWatched, "f")[(_o = __classPrivateFieldGet(this, _TwitchDropsBot_currentDrop, "f")) === null || _o === void 0 ? void 0 : _o.id] = (_p = __classPrivateFieldGet(this, _TwitchDropsBot_currentDrop, "f")) === null || _p === void 0 ? void 0 : _p.self.currentMinutesWatched;
                        __classPrivateFieldGet(this, _TwitchDropsBot_lastMinutesWatched, "f")[(_q = __classPrivateFieldGet(this, _TwitchDropsBot_currentDrop, "f")) === null || _q === void 0 ? void 0 : _q.id] = (_r = __classPrivateFieldGet(this, _TwitchDropsBot_currentDrop, "f")) === null || _r === void 0 ? void 0 : _r.self.currentMinutesWatched;
                        __classPrivateFieldGet(this, _TwitchDropsBot_lastProgressTime, "f")[__classPrivateFieldGet(this, _TwitchDropsBot_currentDrop, "f").id] = new Date().getTime();
                    }
                    // Restart the progress bar
                    __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_createProgressBar).call(this);
                    __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_startProgressBar).call(this, data['required_progress_min'], { 'viewers': __classPrivateFieldGet(this, _TwitchDropsBot_viewerCount, "f"), 'uptime': 0, drop_name: __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_getDropName).call(this, __classPrivateFieldGet(this, _TwitchDropsBot_currentDrop, "f")) });
                }
            }
        }));
        __classPrivateFieldGet(this, _TwitchDropsBot_webSocketListener, "f").on('drop-claim', message => {
            __classPrivateFieldSet(this, _TwitchDropsBot_isDropReadyToClaim, true, "f");
        });
        __classPrivateFieldGet(this, _TwitchDropsBot_webSocketListener, "f").on('stream-down', message => {
            __classPrivateFieldSet(this, _TwitchDropsBot_isStreamDown, true, "f");
        });
    }
    /**
     * Starts the bot. This method returns a promise that is never resolved!
     */
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            // The last time we attempted to make progress towards each drop campaign
            const lastDropCampaignAttemptTimes = {};
            // Amount of time to wait after failing to make progress towards a drop campaign before trying it again
            const SLEEP_TIME_MS = 1000 * 60 * 5;
            // noinspection InfiniteLoopJS
            while (true) {
                // Get the first pending drop campaign ID
                inner: while (true) {
                    logger_1.default.debug('Finding next drop campaign...');
                    if (__classPrivateFieldGet(this, _TwitchDropsBot_pendingDropCampaignIds, "f").length > 0) {
                        // Find the first pending drop campaign that we haven't checked in the past 5 minutes
                        let minLastDropCampaignCheckTime = new Date().getTime();
                        for (const pendingDropCampaignId of __classPrivateFieldGet(this, _TwitchDropsBot_pendingDropCampaignIds, "f")) {
                            const lastCheckTime = lastDropCampaignAttemptTimes[pendingDropCampaignId];
                            if (lastCheckTime) {
                                minLastDropCampaignCheckTime = Math.min(minLastDropCampaignCheckTime !== null && minLastDropCampaignCheckTime !== void 0 ? minLastDropCampaignCheckTime : lastCheckTime, lastCheckTime);
                                if (new Date().getTime() - lastCheckTime < SLEEP_TIME_MS) {
                                    continue;
                                }
                            }
                            __classPrivateFieldSet(this, _TwitchDropsBot_currentDropCampaignId, pendingDropCampaignId, "f");
                            logger_1.default.debug('currentDropCampaignId=' + __classPrivateFieldGet(this, _TwitchDropsBot_currentDropCampaignId, "f"));
                            break inner;
                        }
                        // If no campaigns active/streams online, then set the page to "about:blank"
                        yield __classPrivateFieldGet(this, _TwitchDropsBot_page, "f").goto("about:blank");
                        // We already checked all pending drop campaigns in the past 5 minutes, lets wait for the oldest one
                        logger_1.default.debug('final minlastdropcampaignchecktime: ' + minLastDropCampaignCheckTime + ' time: ' + new Date().getTime());
                        const sleepTime = Math.max(0, SLEEP_TIME_MS - (new Date().getTime() - minLastDropCampaignCheckTime));
                        logger_1.default.info('No campaigns active/streams online. Checking again in ' + (sleepTime / 1000 / 60).toFixed(1) + ' min.');
                        setTimeout(() => {
                            logger_1.default.debug('notify all!');
                            __classPrivateFieldGet(this, _TwitchDropsBot_pendingDropCampaignIdsNotifier, "f").notifyAll();
                        }, sleepTime);
                    }
                    logger_1.default.debug('waiting for waitNotify');
                    yield __classPrivateFieldGet(this, _TwitchDropsBot_pendingDropCampaignIdsNotifier, "f").wait();
                    logger_1.default.debug('done');
                }
                if (!__classPrivateFieldGet(this, _TwitchDropsBot_currentDropCampaignId, "f")) {
                    continue; // This should never happen. Its here to make Typescript happy.
                }
                // Attempt to make progress towards the current drop campaign
                logger_1.default.info('Processing campaign: ' + __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_getDropCampaignFullName).call(this, __classPrivateFieldGet(this, _TwitchDropsBot_currentDropCampaignId, "f")));
                lastDropCampaignAttemptTimes[__classPrivateFieldGet(this, _TwitchDropsBot_currentDropCampaignId, "f")] = new Date().getTime();
                // Check if this drop campaign is active
                if (__classPrivateFieldGet(this, _TwitchDropsBot_dropCampaignMap, "f")[__classPrivateFieldGet(this, _TwitchDropsBot_currentDropCampaignId, "f")]['status'] !== 'ACTIVE') {
                    logger_1.default.info('campaign not active');
                    __classPrivateFieldSet(this, _TwitchDropsBot_currentDropCampaignId, null, "f");
                    continue;
                }
                try {
                    yield __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_processDropCampaign).call(this, __classPrivateFieldGet(this, _TwitchDropsBot_currentDropCampaignId, "f"));
                    //completedCampaignIds.add(currentDropCampaignId);
                    logger_1.default.info('campaign completed');
                }
                catch (error) {
                    if (error instanceof NoStreamsError) {
                        logger_1.default.info('No streams!');
                    }
                    else if (error instanceof HighPriorityError) {
                        // Ignore
                    }
                    else {
                        logger_1.default.error(error);
                    }
                }
                finally {
                    __classPrivateFieldSet(this, _TwitchDropsBot_currentDropCampaignId, null, "f");
                }
            }
        });
    }
}
exports.TwitchDropsBot = TwitchDropsBot;
_TwitchDropsBot_gameIds = new WeakMap(), _TwitchDropsBot_dropCampaignPollingInterval = new WeakMap(), _TwitchDropsBot_failedStreamRetryCount = new WeakMap(), _TwitchDropsBot_failedStreamBlacklistTimeout = new WeakMap(), _TwitchDropsBot_loadTimeoutSeconds = new WeakMap(), _TwitchDropsBot_hideVideo = new WeakMap(), _TwitchDropsBot_watchUnlistedGames = new WeakMap(), _TwitchDropsBot_showAccountNotLinkedWarning = new WeakMap(), _TwitchDropsBot_twitchClient = new WeakMap(), _TwitchDropsBot_page = new WeakMap(), _TwitchDropsBot_twitchDropsWatchdog = new WeakMap(), _TwitchDropsBot_pendingDropCampaignIds = new WeakMap(), _TwitchDropsBot_pendingDropCampaignIdsNotifier = new WeakMap(), _TwitchDropsBot_progressBar = new WeakMap(), _TwitchDropsBot_payload = new WeakMap(), _TwitchDropsBot_total = new WeakMap(), _TwitchDropsBot_currentProgress = new WeakMap(), _TwitchDropsBot_isFirstOutput = new WeakMap(), _TwitchDropsBot_hasWrittenNewLine = new WeakMap(), _TwitchDropsBot_webSocketListener = new WeakMap(), _TwitchDropsBot_currentDropCampaignId = new WeakMap(), _TwitchDropsBot_dropCampaignMap = new WeakMap(), _TwitchDropsBot_pendingHighPriority = new WeakMap(), _TwitchDropsBot_currentDrop = new WeakMap(), _TwitchDropsBot_targetDrop = new WeakMap(), _TwitchDropsBot_viewerCount = new WeakMap(), _TwitchDropsBot_currentMinutesWatched = new WeakMap(), _TwitchDropsBot_lastMinutesWatched = new WeakMap(), _TwitchDropsBot_lastProgressTime = new WeakMap(), _TwitchDropsBot_isDropReadyToClaim = new WeakMap(), _TwitchDropsBot_isStreamDown = new WeakMap(), _TwitchDropsBot_instances = new WeakSet(), _TwitchDropsBot_processDropCampaign = function _TwitchDropsBot_processDropCampaign(dropCampaignId) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const details = yield __classPrivateFieldGet(this, _TwitchDropsBot_twitchClient, "f").getDropCampaignDetails(dropCampaignId);
        while (true) {
            const drop = yield __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_getFirstUnclaimedDrop).call(this, dropCampaignId);
            if (drop === null) {
                logger_1.default.debug('no more drops');
                break;
            }
            logger_1.default.debug('working on drop ' + drop['id']);
            // Check if this drop is ready to be claimed
            const inventoryDrop = yield __classPrivateFieldGet(this, _TwitchDropsBot_twitchClient, "f").getInventoryDrop(drop['id'], dropCampaignId);
            if (inventoryDrop != null) {
                if (inventoryDrop['self']['currentMinutesWatched'] >= inventoryDrop['requiredMinutesWatched']) {
                    yield __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_claimDropReward).call(this, inventoryDrop);
                    continue;
                }
            }
            // A mapping of stream URLs to an integer representing the number of times the stream failed while we were trying to watch it
            const failedStreamUrlCounts = {};
            const failedStreamUrlExpireTime = {};
            const failedStreamUrls = new Set();
            while (true) {
                // Get a list of active streams that have drops enabled
                let streams = yield __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_getActiveStreams).call(this, dropCampaignId, details);
                logger_1.default.info('Found ' + streams.length + ' active streams');
                // Remove streams from the blacklist if they have been there long enough
                for (const x of streams) {
                    const streamUrl = x.url;
                    if (failedStreamUrls.has(streamUrl)) {
                        if (new Date().getTime() >= failedStreamUrlExpireTime[streamUrl]) {
                            failedStreamUrls.delete(streamUrl);
                            failedStreamUrlCounts[streamUrl] = 0;
                        }
                    }
                }
                // Filter out streams that failed too many times
                streams = streams.filter(stream => {
                    return !failedStreamUrls.has(stream.url);
                });
                logger_1.default.info('Found ' + streams.length + ' potential streams');
                for (const x of Object.keys(failedStreamUrlCounts)) {
                    logger_1.default.debug('failed: ' + failedStreamUrlCounts[x] + ' ' + x);
                }
                if (streams.length === 0) {
                    throw new NoStreamsError();
                }
                // Watch first stream
                const streamUrl = streams[0]['url'];
                logger_1.default.info('Watching stream: ' + streamUrl);
                try {
                    yield __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_watchStreamUntilCampaignCompleted).call(this, streamUrl, dropCampaignId, drop);
                }
                catch (error) {
                    if (error instanceof NoProgressError) {
                        logger_1.default.warn(error.message);
                    }
                    else if (error instanceof HighPriorityError) {
                        throw error;
                    }
                    else if (error instanceof StreamLoadFailedError) {
                        logger_1.default.warn('Stream failed to load!');
                    }
                    else if (error instanceof StreamDownError) {
                        logger_1.default.info('Stream went down');
                        /*
                        If the stream goes down, add it to the failed stream urls immediately so we don't try it again.
                        This is needed because getActiveStreams() can return streams that are down if they went down
                        very recently.
                         */
                        failedStreamUrls.add(streamUrl);
                        // Schedule removal from block list!
                        failedStreamUrlExpireTime[streamUrl] = new Date().getTime() + 1000 * 60 * __classPrivateFieldGet(this, _TwitchDropsBot_failedStreamBlacklistTimeout, "f");
                    }
                    else {
                        logger_1.default.error(error);
                        if (((_a = process.env.SAVE_ERROR_SCREENSHOTS) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === 'true') {
                            yield utils_1.default.saveScreenshotAndHtml(__classPrivateFieldGet(this, _TwitchDropsBot_page, "f"), 'error');
                        }
                    }
                    // Increment failure counter
                    if (!(streamUrl in failedStreamUrlCounts)) {
                        failedStreamUrlCounts[streamUrl] = 0;
                    }
                    failedStreamUrlCounts[streamUrl]++;
                    // Move on if this stream failed too many times
                    if (failedStreamUrlCounts[streamUrl] >= __classPrivateFieldGet(this, _TwitchDropsBot_failedStreamRetryCount, "f")) {
                        logger_1.default.error('Stream failed too many times. Giving up for ' + __classPrivateFieldGet(this, _TwitchDropsBot_failedStreamBlacklistTimeout, "f") + ' minutes...');
                        failedStreamUrls.add(streamUrl);
                        // Schedule removal from block list!
                        failedStreamUrlExpireTime[streamUrl] = new Date().getTime() + 1000 * 60 * __classPrivateFieldGet(this, _TwitchDropsBot_failedStreamBlacklistTimeout, "f");
                    }
                    continue;
                }
                finally {
                    yield __classPrivateFieldGet(this, _TwitchDropsBot_webSocketListener, "f").detach();
                }
                break;
            }
        }
    });
}, _TwitchDropsBot_claimDropReward = function _TwitchDropsBot_claimDropReward(drop) {
    return __awaiter(this, void 0, void 0, function* () {
        logger_1.default.info('Claiming drop!');
        yield __classPrivateFieldGet(this, _TwitchDropsBot_twitchClient, "f").claimDropReward(drop.self.dropInstanceID);
    });
}, _TwitchDropsBot_waitUntilElementRendered = function _TwitchDropsBot_waitUntilElementRendered(page, element, timeout = 1000 * __classPrivateFieldGet(this, _TwitchDropsBot_loadTimeoutSeconds, "f")) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const checkDurationMsecs = 1000;
        const maxChecks = timeout / checkDurationMsecs;
        let lastHTMLSize = 0;
        let checkCounts = 1;
        let countStableSizeIterations = 0;
        const minStableSizeIterations = 3;
        while (checkCounts++ <= maxChecks) {
            let html = yield ((_a = (yield element.getProperty('outerHTML'))) === null || _a === void 0 ? void 0 : _a.jsonValue());
            if (!html) {
                throw new Error('HTML was undefined!');
            }
            let currentHTMLSize = html.length;
            if (lastHTMLSize !== 0 && currentHTMLSize === lastHTMLSize) {
                countStableSizeIterations++;
            }
            else {
                countStableSizeIterations = 0;
            }
            if (countStableSizeIterations >= minStableSizeIterations) {
                break;
            }
            lastHTMLSize = currentHTMLSize;
            yield page.waitForTimeout(checkDurationMsecs);
        }
    });
}, _TwitchDropsBot_ansiEscape = function _TwitchDropsBot_ansiEscape(code) {
    return '\x1B[' + code;
}, _TwitchDropsBot_startProgressBar = function _TwitchDropsBot_startProgressBar(t = __classPrivateFieldGet(this, _TwitchDropsBot_total, "f"), p = __classPrivateFieldGet(this, _TwitchDropsBot_payload, "f")) {
    __classPrivateFieldSet(this, _TwitchDropsBot_isFirstOutput, true, "f");
    __classPrivateFieldSet(this, _TwitchDropsBot_total, t, "f");
    __classPrivateFieldSet(this, _TwitchDropsBot_payload, p, "f");
    if (__classPrivateFieldGet(this, _TwitchDropsBot_progressBar, "f") !== null) {
        __classPrivateFieldGet(this, _TwitchDropsBot_progressBar, "f").start(t, 0, p);
        __classPrivateFieldSet(this, _TwitchDropsBot_hasWrittenNewLine, false, "f");
    }
}, _TwitchDropsBot_updateProgressBar = function _TwitchDropsBot_updateProgressBar(c = __classPrivateFieldGet(this, _TwitchDropsBot_currentProgress, "f"), p = __classPrivateFieldGet(this, _TwitchDropsBot_payload, "f")) {
    __classPrivateFieldSet(this, _TwitchDropsBot_currentProgress, c, "f");
    __classPrivateFieldSet(this, _TwitchDropsBot_payload, p, "f");
    if (__classPrivateFieldGet(this, _TwitchDropsBot_progressBar, "f") !== null) {
        __classPrivateFieldGet(this, _TwitchDropsBot_progressBar, "f").update(c, p);
    }
}, _TwitchDropsBot_stopProgressBar = function _TwitchDropsBot_stopProgressBar(clear = false) {
    if (__classPrivateFieldGet(this, _TwitchDropsBot_progressBar, "f") !== null) {
        __classPrivateFieldGet(this, _TwitchDropsBot_progressBar, "f").stop();
        // The progress bar is a bit buggy since im using it for 2 lines but its only
        // intended to be used for 1 line. Also the logger does not play nice with it.
        // This is a workaround to try and avoid overwriting some lines in the terminal.
        // For more reliable logs, just look at the log file instead of the console.
        if (!__classPrivateFieldGet(this, _TwitchDropsBot_hasWrittenNewLine, "f")) {
            process.stdout.write('\n');
            __classPrivateFieldSet(this, _TwitchDropsBot_hasWrittenNewLine, true, "f");
        }
    }
    if (clear) {
        __classPrivateFieldSet(this, _TwitchDropsBot_progressBar, null, "f");
        __classPrivateFieldSet(this, _TwitchDropsBot_payload, null, "f");
        __classPrivateFieldSet(this, _TwitchDropsBot_total, null, "f");
        __classPrivateFieldSet(this, _TwitchDropsBot_currentProgress, null, "f");
    }
}, _TwitchDropsBot_createProgressBar = function _TwitchDropsBot_createProgressBar() {
    // Create progress bar
    __classPrivateFieldSet(this, _TwitchDropsBot_progressBar, new cliProgress.SingleBar({
        barsize: 20,
        stream: process.stdout,
        format: (options, params, payload) => {
            let result = 'Watching ' + payload['stream_url'] + ` | Viewers: ${payload['viewers']} | Uptime: ${payload['uptime']}` + __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_ansiEscape).call(this, '0K') + '\n'
                + `${payload['drop_name']} ${BarFormat(params.progress, options)} ${params.value} / ${params.total} minutes` + __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_ansiEscape).call(this, '0K') + '\n';
            if (__classPrivateFieldGet(this, _TwitchDropsBot_isFirstOutput, "f")) {
                return result;
            }
            return __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_ansiEscape).call(this, '2A') + result;
        }
    }, cliProgress.Presets.shades_classic), "f");
    __classPrivateFieldGet(this, _TwitchDropsBot_progressBar, "f").on('redraw-post', () => {
        __classPrivateFieldSet(this, _TwitchDropsBot_isFirstOutput, false, "f");
    });
}, _TwitchDropsBot_watchStreamUntilCampaignCompleted = function _TwitchDropsBot_watchStreamUntilCampaignCompleted(streamUrl, campaignId, targetDrop) {
    return __awaiter(this, void 0, void 0, function* () {
        __classPrivateFieldSet(this, _TwitchDropsBot_targetDrop, targetDrop, "f");
        __classPrivateFieldSet(this, _TwitchDropsBot_currentDrop, targetDrop, "f");
        logger_1.default.debug('target: ' + targetDrop['id']);
        // Reset variables
        __classPrivateFieldSet(this, _TwitchDropsBot_viewerCount, 0, "f");
        __classPrivateFieldSet(this, _TwitchDropsBot_currentMinutesWatched, {}, "f");
        __classPrivateFieldGet(this, _TwitchDropsBot_currentMinutesWatched, "f")[targetDrop['id']] = 0;
        __classPrivateFieldSet(this, _TwitchDropsBot_lastMinutesWatched, {}, "f");
        __classPrivateFieldGet(this, _TwitchDropsBot_lastMinutesWatched, "f")[targetDrop['id']] = -1;
        __classPrivateFieldSet(this, _TwitchDropsBot_lastProgressTime, {}, "f");
        __classPrivateFieldGet(this, _TwitchDropsBot_lastProgressTime, "f")[targetDrop['id']] = new Date().getTime();
        __classPrivateFieldSet(this, _TwitchDropsBot_isDropReadyToClaim, false, "f");
        __classPrivateFieldSet(this, _TwitchDropsBot_isStreamDown, false, "f");
        // Get initial drop progress
        const inventoryDrop = yield __classPrivateFieldGet(this, _TwitchDropsBot_twitchClient, "f").getInventoryDrop(targetDrop.id);
        if (inventoryDrop) {
            __classPrivateFieldGet(this, _TwitchDropsBot_currentMinutesWatched, "f")[targetDrop['id']] = inventoryDrop['self']['currentMinutesWatched'];
            __classPrivateFieldGet(this, _TwitchDropsBot_lastMinutesWatched, "f")[targetDrop['id']] = __classPrivateFieldGet(this, _TwitchDropsBot_currentMinutesWatched, "f")[targetDrop['id']];
            logger_1.default.debug('Initial drop progress: ' + __classPrivateFieldGet(this, _TwitchDropsBot_currentMinutesWatched, "f")[targetDrop['id']] + ' minutes');
        }
        else {
            logger_1.default.debug('Initial drop progress: none');
        }
        // Create a "Chrome Devtools Protocol" session to listen to websocket events
        yield __classPrivateFieldGet(this, _TwitchDropsBot_webSocketListener, "f").attach(__classPrivateFieldGet(this, _TwitchDropsBot_page, "f"));
        yield __classPrivateFieldGet(this, _TwitchDropsBot_page, "f").goto(streamUrl);
        // Wait for the page to load completely (hopefully). This checks the video player container for any DOM changes and waits until there haven't been any changes for a few seconds.
        logger_1.default.info('Waiting for page to load...');
        const element = (yield __classPrivateFieldGet(this, _TwitchDropsBot_page, "f").$x('//div[@data-a-player-state]'))[0];
        yield __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_waitUntilElementRendered).call(this, __classPrivateFieldGet(this, _TwitchDropsBot_page, "f"), element);
        const streamPage = new stream_1.StreamPage(__classPrivateFieldGet(this, _TwitchDropsBot_page, "f"));
        try {
            yield streamPage.waitForLoad();
        }
        catch (error) {
            if (error instanceof TimeoutError) {
                throw new StreamLoadFailedError();
            }
        }
        try {
            // Click "Accept mature content" button
            yield streamPage.acceptMatureContent();
            logger_1.default.info('Accepted mature content');
        }
        catch (error) {
            // Ignore errors, the button is probably not there
        }
        try {
            yield streamPage.setLowestStreamQuality();
            logger_1.default.info('Set stream to lowest quality');
        }
        catch (error) {
            logger_1.default.error('Failed to set stream to lowest quality!');
            throw error;
        }
        // This does not affect the drops, so if the user requests lets hide the videos
        if (__classPrivateFieldGet(this, _TwitchDropsBot_hideVideo, "f")) {
            try {
                yield streamPage.hideVideo();
                logger_1.default.info('Set stream visibility to hidden');
            }
            catch (error) {
                logger_1.default.error('Failed to set stream visibility to hidden!');
                throw error;
            }
        }
        const requiredMinutesWatched = targetDrop['requiredMinutesWatched'];
        __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_createProgressBar).call(this);
        __classPrivateFieldSet(this, _TwitchDropsBot_viewerCount, yield streamPage.getViewersCount(), "f");
        __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_startProgressBar).call(this, requiredMinutesWatched, { 'viewers': __classPrivateFieldGet(this, _TwitchDropsBot_viewerCount, "f"), 'uptime': yield streamPage.getUptime(), drop_name: __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_getDropName).call(this, targetDrop), stream_url: streamUrl });
        // The maximum amount of time to allow no progress
        const maxNoProgressTime = 1000 * 60 * 5;
        while (true) {
            if (__classPrivateFieldGet(this, _TwitchDropsBot_isStreamDown, "f")) {
                __classPrivateFieldSet(this, _TwitchDropsBot_isStreamDown, false, "f");
                __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_stopProgressBar).call(this, true);
                yield __classPrivateFieldGet(this, _TwitchDropsBot_page, "f").goto("about:blank");
                throw new StreamDownError('Stream went down!');
            }
            __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_updateProgressBar).call(this, __classPrivateFieldGet(this, _TwitchDropsBot_currentMinutesWatched, "f")[__classPrivateFieldGet(this, _TwitchDropsBot_currentDrop, "f")['id']], { 'viewers': __classPrivateFieldGet(this, _TwitchDropsBot_viewerCount, "f"), 'uptime': yield streamPage.getUptime(), drop_name: __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_getDropName).call(this, __classPrivateFieldGet(this, _TwitchDropsBot_currentDrop, "f")), stream_url: streamUrl });
            // Check if there are community points that we can claim
            const claimCommunityPointsSelector = 'div[data-test-selector="community-points-summary"] div.GTGMR button';
            const claimCommunityPointsButton = yield __classPrivateFieldGet(this, _TwitchDropsBot_page, "f").$(claimCommunityPointsSelector);
            if (claimCommunityPointsButton) {
                try {
                    yield claimCommunityPointsButton.click();
                    logger_1.default.debug('Claimed community points!');
                }
                catch (error) {
                    logger_1.default.error('Failed to claim community points!');
                    logger_1.default.error(error);
                }
            }
            // Check if we have made progress towards the current drop
            logger_1.default.debug(`${__classPrivateFieldGet(this, _TwitchDropsBot_currentDrop, "f").id} | ${new Date().getTime()} - ${__classPrivateFieldGet(this, _TwitchDropsBot_lastProgressTime, "f")[__classPrivateFieldGet(this, _TwitchDropsBot_currentDrop, "f")['id']]} = ${new Date().getTime() - __classPrivateFieldGet(this, _TwitchDropsBot_lastProgressTime, "f")[__classPrivateFieldGet(this, _TwitchDropsBot_currentDrop, "f")['id']]}`);
            if (new Date().getTime() - __classPrivateFieldGet(this, _TwitchDropsBot_lastProgressTime, "f")[__classPrivateFieldGet(this, _TwitchDropsBot_currentDrop, "f")['id']] >= maxNoProgressTime) {
                // Maybe we haven't got any updates from the web socket, lets check our inventory
                const currentDropId = __classPrivateFieldGet(this, _TwitchDropsBot_currentDrop, "f")['id'];
                const inventoryDrop = yield __classPrivateFieldGet(this, _TwitchDropsBot_twitchClient, "f").getInventoryDrop(currentDropId);
                if (inventoryDrop) {
                    __classPrivateFieldGet(this, _TwitchDropsBot_currentMinutesWatched, "f")[currentDropId] = inventoryDrop['self']['currentMinutesWatched'];
                    if (__classPrivateFieldGet(this, _TwitchDropsBot_currentMinutesWatched, "f")[currentDropId] > __classPrivateFieldGet(this, _TwitchDropsBot_lastMinutesWatched, "f")[currentDropId]) {
                        __classPrivateFieldGet(this, _TwitchDropsBot_lastProgressTime, "f")[currentDropId] = new Date().getTime();
                        __classPrivateFieldGet(this, _TwitchDropsBot_lastMinutesWatched, "f")[currentDropId] = __classPrivateFieldGet(this, _TwitchDropsBot_currentMinutesWatched, "f")[currentDropId];
                        logger_1.default.debug('No progress from web socket! using inventory progress: ' + __classPrivateFieldGet(this, _TwitchDropsBot_currentMinutesWatched, "f")[currentDropId] + ' minutes');
                    }
                    else {
                        __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_stopProgressBar).call(this, true);
                        yield __classPrivateFieldGet(this, _TwitchDropsBot_page, "f").goto("about:blank");
                        throw new NoProgressError("No progress was detected in the last " + (maxNoProgressTime / 1000 / 60) + " minutes!");
                    }
                }
                else {
                    __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_stopProgressBar).call(this, true);
                    yield __classPrivateFieldGet(this, _TwitchDropsBot_page, "f").goto("about:blank");
                    throw new NoProgressError("No progress was detected in the last " + (maxNoProgressTime / 1000 / 60) + " minutes!");
                }
            }
            // Check if there is a higher priority stream we should be watching
            if (__classPrivateFieldGet(this, _TwitchDropsBot_pendingHighPriority, "f")) {
                __classPrivateFieldSet(this, _TwitchDropsBot_pendingHighPriority, false, "f");
                __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_stopProgressBar).call(this, true);
                logger_1.default.info('Switching to higher priority stream');
                throw new HighPriorityError();
            }
            if (__classPrivateFieldGet(this, _TwitchDropsBot_isDropReadyToClaim, "f")) {
                __classPrivateFieldSet(this, _TwitchDropsBot_isDropReadyToClaim, false, "f");
                __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_stopProgressBar).call(this, true);
                const inventoryDrop = yield __classPrivateFieldGet(this, _TwitchDropsBot_twitchClient, "f").getInventoryDrop(__classPrivateFieldGet(this, _TwitchDropsBot_currentDrop, "f")['id']);
                // Claim the drop
                yield __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_claimDropReward).call(this, inventoryDrop);
                // After the reward was claimed set streamUrl to "about:blank".
                yield __classPrivateFieldGet(this, _TwitchDropsBot_page, "f").goto("about:blank");
                // TODO: dont return, check for more drops
                return;
            }
            yield __classPrivateFieldGet(this, _TwitchDropsBot_page, "f").waitForTimeout(1000);
        }
    });
}, _TwitchDropsBot_getFirstUnclaimedDrop = function _TwitchDropsBot_getFirstUnclaimedDrop(campaignId) {
    return __awaiter(this, void 0, void 0, function* () {
        // Get all drops for this campaign
        const details = yield __classPrivateFieldGet(this, _TwitchDropsBot_twitchClient, "f").getDropCampaignDetails(campaignId);
        for (const drop of details['timeBasedDrops']) { // TODO: Not all campaigns have time based drops
            // Check if we already claimed this drop
            if (yield __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_isDropClaimed).call(this, drop)) {
                continue;
            }
            // Check if this drop has expired
            if (new Date() > new Date(Date.parse(drop['endAt']))) {
                continue;
            }
            // Check if this has started
            if (new Date() < new Date(Date.parse(drop['startAt']))) {
                continue;
            }
            return drop;
        }
        return null;
    });
}, _TwitchDropsBot_isDropClaimed = function _TwitchDropsBot_isDropClaimed(drop) {
    return __awaiter(this, void 0, void 0, function* () {
        const inventory = yield __classPrivateFieldGet(this, _TwitchDropsBot_twitchClient, "f").getInventory();
        // Check campaigns in progress
        const dropCampaignsInProgress = inventory['dropCampaignsInProgress'];
        if (dropCampaignsInProgress != null) {
            for (const campaign of dropCampaignsInProgress) {
                for (const d of campaign['timeBasedDrops']) {
                    if (d['id'] === drop['id']) {
                        return d['self']['isClaimed'];
                    }
                }
            }
        }
        // Check claimed drops
        const gameEventDrops = inventory['gameEventDrops'];
        if (gameEventDrops != null) {
            for (const d of gameEventDrops) {
                if (d['id'] === drop['benefitEdges'][0]['benefit']['id']) {
                    // I haven't found a way to confirm that this specific drop was claimed, but if we get to this point it
                    // means one of two things: (1) We haven't made any progress towards the campaign so it does not show up
                    // in the "dropCampaignsInProgress" section. (2) We have already claimed everything from this campaign.
                    // In the first case, the drop won't show up here either so we can just return false. In the second case
                    // I assume that if we received a drop reward of the same type after this campaign started, that it has
                    // been claimed.
                    return Date.parse(d['lastAwardedAt']) > Date.parse(drop['startAt']);
                }
            }
        }
        return false;
    });
}, _TwitchDropsBot_getActiveStreams = function _TwitchDropsBot_getActiveStreams(campaignId, details) {
    return __awaiter(this, void 0, void 0, function* () {
        // Get a list of active streams that have drops enabled
        let streams = yield __classPrivateFieldGet(this, _TwitchDropsBot_twitchClient, "f").getDropEnabledStreams(__classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_getDropCampaignById).call(this, campaignId)['game']['displayName']);
        // Filter out streams that are not in the allowed channels list, if any
        const channels = details['allow']['channels'];
        if (channels != null) {
            const channelIds = new Set();
            for (const channel of channels) {
                channelIds.add(channel['id']);
            }
            streams = streams.filter(stream => {
                return channelIds.has(stream['broadcaster_id']);
            });
        }
        return streams;
    });
}, _TwitchDropsBot_getDropCampaignFullName = function _TwitchDropsBot_getDropCampaignFullName(campaignId) {
    const campaign = __classPrivateFieldGet(this, _TwitchDropsBot_instances, "m", _TwitchDropsBot_getDropCampaignById).call(this, campaignId);
    return campaign['game']['displayName'] + ' ' + campaign['name'];
}, _TwitchDropsBot_getDropCampaignById = function _TwitchDropsBot_getDropCampaignById(campaignId) {
    return __classPrivateFieldGet(this, _TwitchDropsBot_dropCampaignMap, "f")[campaignId];
}, _TwitchDropsBot_getDropName = function _TwitchDropsBot_getDropName(drop) {
    return drop['benefitEdges'][0]['benefit']['name'];
};
