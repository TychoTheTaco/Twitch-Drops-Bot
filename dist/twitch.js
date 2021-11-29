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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _Client_clientId, _Client_oauthToken, _Client_channelLogin, _Client_defaultHeaders;
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.Client = void 0;
require('dnscache')({ enable: true });
const fs_1 = __importDefault(require("fs"));
const axios_1 = __importDefault(require("axios"));
const puppeteer_1 = require("puppeteer");
const { TimeoutError } = puppeteer_1.errors;
const prompt = require('prompt');
const logger_1 = __importDefault(require("./logger"));
const utils_1 = __importDefault(require("./utils"));
class Client {
    constructor(clientId, oauthToken, channelLogin) {
        _Client_clientId.set(this, void 0);
        _Client_oauthToken.set(this, void 0);
        _Client_channelLogin.set(this, void 0);
        _Client_defaultHeaders.set(this, void 0);
        __classPrivateFieldSet(this, _Client_clientId, clientId, "f");
        __classPrivateFieldSet(this, _Client_oauthToken, oauthToken, "f");
        __classPrivateFieldSet(this, _Client_channelLogin, channelLogin, "f");
        __classPrivateFieldSet(this, _Client_defaultHeaders, {
            'Content-Type': 'text/plain;charset=UTF-8',
            'Client-Id': __classPrivateFieldGet(this, _Client_clientId, "f"),
            'Authorization': `OAuth ${__classPrivateFieldGet(this, _Client_oauthToken, "f")}`
        }, "f");
    }
    /**
     * Get a list of drop campaigns. This can include expired, active, and future campaigns.
     * @returns {Promise<*>}
     */
    getDropCampaigns() {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield axios_1.default.post('https://gql.twitch.tv/gql', {
                'operationName': 'ViewerDropsDashboard',
                'extensions': {
                    'persistedQuery': {
                        "version": 1,
                        "sha256Hash": "e8b98b52bbd7ccd37d0b671ad0d47be5238caa5bea637d2a65776175b4a23a64"
                    }
                }
            }, {
                headers: __classPrivateFieldGet(this, _Client_defaultHeaders, "f")
            });
            try {
                return response['data']['data']['currentUser']['dropCampaigns'];
            }
            catch (error) {
                logger_1.default.error('Error in function getDropCampaigns! Response: ' + response.status + ' ' + JSON.stringify(response, null, 4));
                throw error;
            }
        });
    }
    getDropCampaignDetails(dropId) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield axios_1.default.post('https://gql.twitch.tv/gql', {
                'operationName': 'DropCampaignDetails',
                'extensions': {
                    'persistedQuery': {
                        "version": 1,
                        "sha256Hash": "14b5e8a50777165cfc3971e1d93b4758613fe1c817d5542c398dce70b7a45c05"
                    }
                },
                'variables': {
                    'dropID': dropId,
                    'channelLogin': __classPrivateFieldGet(this, _Client_channelLogin, "f")
                }
            }, {
                headers: __classPrivateFieldGet(this, _Client_defaultHeaders, "f")
            });
            try {
                return response['data']['data']['user']['dropCampaign'];
            }
            catch (error) {
                logger_1.default.error('Error in function getDropCampaignDetails! Response: ' + response.status + ' ' + JSON.stringify(response, null, 4));
                throw error;
            }
        });
    }
    getInventory() {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield axios_1.default.post('https://gql.twitch.tv/gql', {
                'operationName': 'Inventory',
                'extensions': {
                    "persistedQuery": {
                        "version": 1,
                        "sha256Hash": "9cdfc5ebf8ee497e49c5b922829d67e5bce039f3c713f0706d234944195d56ad"
                    }
                }
            }, {
                headers: __classPrivateFieldGet(this, _Client_defaultHeaders, "f")
            });
            try {
                return response['data']['data']['currentUser']['inventory'];
            }
            catch (error) {
                logger_1.default.error('Error in function getInventory! Response: ' + response.status + ' ' + JSON.stringify(response, null, 4));
                throw error;
            }
        });
    }
    getDropEnabledStreams(gameName) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield axios_1.default.post('https://gql.twitch.tv/gql', {
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
                        "requestID": "JIRA-VXP-2397",
                        "tags": [
                            "c2542d6d-cd10-4532-919b-3d19f30a768b" // "Drops enabled"
                        ]
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
            }, {
                headers: __classPrivateFieldGet(this, _Client_defaultHeaders, "f")
            });
            const streams = response['data']['data']['game']['streams'];
            if (streams === null) {
                return [];
            }
            const result = [];
            for (const stream of streams['edges']) {
                result.push({
                    'url': 'https://www.twitch.tv/' + stream['node']['broadcaster']['login'],
                    'broadcaster_id': stream['node']['broadcaster']['id']
                });
            }
            return result;
        });
    }
    claimDropReward(dropId) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield axios_1.default.post('https://gql.twitch.tv/gql', {
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
            }, {
                headers: __classPrivateFieldGet(this, _Client_defaultHeaders, "f")
            });
            if ('errors' in response.data) {
                throw new Error(JSON.stringify(response.data['errors']));
            }
        });
    }
    /*async claimCommunityPoints(channelId: string, claimId: string) {
        const response = await axios.post('https://gql.twitch.tv/gql',
            {
                "operationName": "ClaimCommunityPoints",
                "variables": {
                    "input": {
                        "channelID": channelId,
                        "claimID": claimId
                    }
                },
                "extensions": {
                    "persistedQuery": {
                        "version": 1,
                        "sha256Hash": "46aaeebe02c99afdf4fc97c7c0cba964124bf6b0af229395f1f6d1feed05b3d0"
                    }
                }
            },
            {
                headers: this.#defaultHeaders
            }
        );
        if ('errors' in response.data) {
            throw new Error(JSON.stringify(response.data['errors']));
        }
    }*/
    getDropCampaignsInProgress() {
        return __awaiter(this, void 0, void 0, function* () {
            const inventory = yield this.getInventory();
            const campaigns = inventory['dropCampaignsInProgress'];
            if (campaigns === null) {
                return [];
            }
            return campaigns;
        });
    }
    getInventoryDrop(dropId, campaignId) {
        return __awaiter(this, void 0, void 0, function* () {
            const campaigns = yield this.getDropCampaignsInProgress();
            for (const campaign of campaigns) {
                if (!campaignId || campaign['id'] === campaignId) {
                    const drops = campaign['timeBasedDrops'];
                    for (const drop of drops) {
                        if (drop['id'] === dropId) {
                            return drop;
                        }
                    }
                }
            }
            return null;
        });
    }
}
exports.Client = Client;
_Client_clientId = new WeakMap(), _Client_oauthToken = new WeakMap(), _Client_channelLogin = new WeakMap(), _Client_defaultHeaders = new WeakMap();
function login(browser, username, password, headless = false) {
    return __awaiter(this, void 0, void 0, function* () {
        const page = yield browser.newPage();
        // Throw an error if the page is closed for any reason
        const onPageClosed = () => {
            throw new Error('Page closed!');
        };
        page.on('close', onPageClosed);
        // Go to login page
        yield page.goto('https://www.twitch.tv/login');
        // Enter username
        if (username !== undefined) {
            yield page.focus('#login-username');
            yield page.keyboard.type(username);
        }
        // Enter password
        if (password !== undefined) {
            yield page.focus('#password-input');
            yield page.keyboard.type(password);
        }
        // Click login button
        if (username !== undefined && password !== undefined) {
            yield page.click('[data-a-target="passport-login-button"]');
        }
        if (headless) {
            while (true) {
                // TODO: This loop and try/catch statements could be replaced with Promise.any(), but it seems that Node.js 14 does not support it.
                // Check for email verification code
                try {
                    logger_1.default.info('Checking for email verification...');
                    yield page.waitForXPath('//*[contains(text(), "please enter the 6-digit code we sent")]');
                    logger_1.default.info('Email verification found.');
                    // Prompt user for code
                    prompt.start();
                    const result = yield utils_1.default.asyncPrompt(['code']);
                    const code = result['code'];
                    prompt.stop();
                    // Enter code
                    const first_input = yield page.waitForXPath('(//input)[1]');
                    if (first_input == null) {
                        logger_1.default.error('first_input was null!');
                        break;
                    }
                    yield first_input.click();
                    yield page.keyboard.type(code);
                    break;
                }
                catch (error) {
                    if (error instanceof TimeoutError) {
                        logger_1.default.info('Email verification not found.');
                    }
                    else {
                        logger_1.default.error(error);
                    }
                }
                // Check for 2FA code
                try {
                    logger_1.default.info('Checking for 2FA verification...');
                    yield page.waitForXPath('//*[contains(text(), "Enter the code found in your authenticator app")]');
                    logger_1.default.info('2FA verification found.');
                    // Prompt user for code
                    prompt.start();
                    const result = yield utils_1.default.asyncPrompt(['code']);
                    const code = result['code'];
                    prompt.stop();
                    // Enter code
                    const first_input = yield page.waitForXPath('(//input[@type="text"])');
                    if (first_input == null) {
                        logger_1.default.error('first_input was null!');
                        break;
                    }
                    yield first_input.click();
                    yield page.keyboard.type(code);
                    // Click submit
                    const button = yield page.waitForXPath('//button[@target="submit_button"]');
                    if (button == null) {
                        logger_1.default.error('button was null!');
                        break;
                    }
                    yield button.click();
                    break;
                }
                catch (error) {
                    if (error instanceof TimeoutError) {
                        logger_1.default.info('2FA verification not found.');
                    }
                    else {
                        logger_1.default.error(error);
                    }
                }
                logger_1.default.info('No extra verification found!');
                break;
            }
            // Wait for redirect to main Twitch page. If this times out then there is probably a different type of verification that we haven't checked for.
            try {
                yield page.waitForNavigation();
            }
            catch (error) {
                if (error instanceof TimeoutError) {
                    const time = new Date().getTime();
                    const screenshotPath = 'failed-login-screenshot-' + time + '.png';
                    const htmlPath = 'failed-login-html-' + time + '.html';
                    logger_1.default.error('Failed to login. There was probably an extra verification step that this app didn\'t check for. ' +
                        'A screenshot of the page will be saved to ' + screenshotPath + ' and the page content will be saved to ' + htmlPath +
                        '. Please create an issue on GitHub with both of these files.');
                    yield page.screenshot({
                        fullPage: true,
                        path: screenshotPath
                    });
                    fs_1.default.writeFileSync(htmlPath, yield page.content());
                }
                throw error;
            }
        }
        else {
            // Wait for redirect to main Twitch page. The timeout is unlimited here because we may be prompted for additional authentication.
            yield page.waitForNavigation({ timeout: 0 });
        }
        const cookies = yield page.cookies();
        page.off('close', onPageClosed);
        yield page.close();
        return cookies;
    });
}
exports.login = login;
exports.default = {
    Client,
    login
};
