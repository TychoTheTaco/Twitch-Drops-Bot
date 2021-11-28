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
var _StreamPage_instances, _StreamPage_page, _StreamPage_clickSettingsButton;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamPage = void 0;
const utils_1 = require("../utils");
class StreamPage {
    constructor(page) {
        _StreamPage_instances.add(this);
        _StreamPage_page.set(this, void 0);
        __classPrivateFieldSet(this, _StreamPage_page, page, "f");
    }
    waitForLoad() {
        return __awaiter(this, void 0, void 0, function* () {
            // Wait for the viewer count and uptime to be visible
            yield __classPrivateFieldGet(this, _StreamPage_page, "f").waitForSelector('p[data-a-target="animated-channel-viewers-count"]');
            yield __classPrivateFieldGet(this, _StreamPage_page, "f").waitForSelector('span.live-time');
        });
    }
    acceptMatureContent() {
        return __awaiter(this, void 0, void 0, function* () {
            yield (0, utils_1.click)(__classPrivateFieldGet(this, _StreamPage_page, "f"), '[data-a-target="player-overlay-mature-accept"]');
        });
    }
    setLowestStreamQuality() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            yield __classPrivateFieldGet(this, _StreamPage_instances, "m", _StreamPage_clickSettingsButton).call(this);
            const qualityButtonSelector = '[data-a-target="player-settings-menu-item-quality"]';
            yield __classPrivateFieldGet(this, _StreamPage_page, "f").waitForSelector(qualityButtonSelector);
            yield (0, utils_1.click)(__classPrivateFieldGet(this, _StreamPage_page, "f"), qualityButtonSelector);
            const lowestQualityButtonSelector = 'div[data-a-target="player-settings-menu"]>div:last-child input';
            const lowestQualityButton = yield __classPrivateFieldGet(this, _StreamPage_page, "f").waitForSelector(lowestQualityButtonSelector);
            if (!(yield ((_a = (yield (lowestQualityButton === null || lowestQualityButton === void 0 ? void 0 : lowestQualityButton.getProperty('checked')))) === null || _a === void 0 ? void 0 : _a.jsonValue()))) {
                yield (0, utils_1.click)(__classPrivateFieldGet(this, _StreamPage_page, "f"), lowestQualityButtonSelector);
            }
            else {
                yield __classPrivateFieldGet(this, _StreamPage_instances, "m", _StreamPage_clickSettingsButton).call(this);
            }
        });
    }
    getViewersCount() {
        return __awaiter(this, void 0, void 0, function* () {
            const element = yield __classPrivateFieldGet(this, _StreamPage_page, "f").$('p[data-a-target="animated-channel-viewers-count"]');
            const property = yield (element === null || element === void 0 ? void 0 : element.getProperty('innerText'));
            const value = yield (property === null || property === void 0 ? void 0 : property.jsonValue());
            const cleanValue = value.replace(/[.,]/g, '');
            return parseInt(cleanValue);
        });
    }
    getUptime() {
        return __awaiter(this, void 0, void 0, function* () {
            const element = yield __classPrivateFieldGet(this, _StreamPage_page, "f").$('span.live-time');
            const property = yield (element === null || element === void 0 ? void 0 : element.getProperty('innerText'));
            return yield (property === null || property === void 0 ? void 0 : property.jsonValue());
        });
    }
    openVideoStats() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            yield __classPrivateFieldGet(this, _StreamPage_instances, "m", _StreamPage_clickSettingsButton).call(this);
            const advancedButtonSelector = '[data-a-target="player-settings-menu-item-advanced"]';
            yield __classPrivateFieldGet(this, _StreamPage_page, "f").waitForSelector(advancedButtonSelector);
            yield (0, utils_1.click)(__classPrivateFieldGet(this, _StreamPage_page, "f"), advancedButtonSelector);
            const videoStatsButtonSelector = '[data-a-target="player-settings-submenu-advanced-video-stats"] input';
            const videoStatsButton = yield __classPrivateFieldGet(this, _StreamPage_page, "f").waitForSelector(videoStatsButtonSelector);
            if (!(yield ((_a = (yield (videoStatsButton === null || videoStatsButton === void 0 ? void 0 : videoStatsButton.getProperty('checked')))) === null || _a === void 0 ? void 0 : _a.jsonValue()))) {
                yield (0, utils_1.click)(__classPrivateFieldGet(this, _StreamPage_page, "f"), videoStatsButtonSelector);
            }
            yield __classPrivateFieldGet(this, _StreamPage_instances, "m", _StreamPage_clickSettingsButton).call(this);
        });
    }
    getPlaybackBitrate() {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const playbackBitrateXpath = '//*[contains(text(), "Playback Bitrate")]/ancestor::tr/td[last()]';
            return yield ((_b = (yield ((_a = (yield __classPrivateFieldGet(this, _StreamPage_page, "f").waitForXPath(playbackBitrateXpath))) === null || _a === void 0 ? void 0 : _a.getProperty('innerText')))) === null || _b === void 0 ? void 0 : _b.jsonValue());
        });
    }
    getDropProgress() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const dropProgressBarXpath = '//a[@data-a-target="inventory-dropdown-link"]//div[@data-a-target="tw-progress-bar-animation"]';
            // Check if the progress bar exists. If it doesn't, we probably need to open the user menu.
            if ((yield __classPrivateFieldGet(this, _StreamPage_page, "f").$x(dropProgressBarXpath)).length === 0) {
                // Open the user menu. We can leave it open to avoid having to reopen it every time.
                const menuToggleButtonSelector = 'button[data-a-target="user-menu-toggle"]';
                yield (0, utils_1.click)(__classPrivateFieldGet(this, _StreamPage_page, "f"), menuToggleButtonSelector);
            }
            // Return drop progress as a percentage between 0 and 1
            return yield ((_a = (yield __classPrivateFieldGet(this, _StreamPage_page, "f").waitForXPath(dropProgressBarXpath))) === null || _a === void 0 ? void 0 : _a.evaluate((element) => {
                return parseInt(element.getAttribute('value')) / 100;
            }));
        });
    }
}
exports.StreamPage = StreamPage;
_StreamPage_page = new WeakMap(), _StreamPage_instances = new WeakSet(), _StreamPage_clickSettingsButton = function _StreamPage_clickSettingsButton() {
    return __awaiter(this, void 0, void 0, function* () {
        const settingsButtonSelector = '[data-a-target="player-settings-button"]';
        yield __classPrivateFieldGet(this, _StreamPage_page, "f").waitForSelector(settingsButtonSelector);
        yield (0, utils_1.click)(__classPrivateFieldGet(this, _StreamPage_page, "f"), settingsButtonSelector);
    });
};
