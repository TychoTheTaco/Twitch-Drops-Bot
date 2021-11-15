'use strict';
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
var _TwitchDropsWatchdog_client, _TwitchDropsWatchdog_interval, _TwitchDropsWatchdog_isRunning, _TwitchDropsWatchdog_timeoutId;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitchDropsWatchdog = void 0;
const events_1 = require("events");
class TwitchDropsWatchdog extends events_1.EventEmitter {
    constructor(client, interval = 15) {
        super();
        _TwitchDropsWatchdog_client.set(this, void 0);
        _TwitchDropsWatchdog_interval.set(this, void 0);
        _TwitchDropsWatchdog_isRunning.set(this, false);
        _TwitchDropsWatchdog_timeoutId.set(this, setTimeout(() => {
        }));
        __classPrivateFieldSet(this, _TwitchDropsWatchdog_client, client, "f");
        __classPrivateFieldSet(this, _TwitchDropsWatchdog_interval, interval, "f");
    }
    start() {
        if (!__classPrivateFieldGet(this, _TwitchDropsWatchdog_isRunning, "f")) {
            __classPrivateFieldSet(this, _TwitchDropsWatchdog_isRunning, true, "f");
            const run = () => {
                this.emit('before_update');
                __classPrivateFieldGet(this, _TwitchDropsWatchdog_client, "f").getDropCampaigns().then((campaigns) => {
                    this.emit('update', campaigns);
                    __classPrivateFieldSet(this, _TwitchDropsWatchdog_timeoutId, setTimeout(run, 1000 * 60 * __classPrivateFieldGet(this, _TwitchDropsWatchdog_interval, "f")), "f");
                });
            };
            run();
        }
    }
    stop() {
        if (__classPrivateFieldGet(this, _TwitchDropsWatchdog_isRunning, "f")) {
            clearTimeout(__classPrivateFieldGet(this, _TwitchDropsWatchdog_timeoutId, "f"));
            __classPrivateFieldSet(this, _TwitchDropsWatchdog_isRunning, false, "f");
        }
    }
}
exports.TwitchDropsWatchdog = TwitchDropsWatchdog;
_TwitchDropsWatchdog_client = new WeakMap(), _TwitchDropsWatchdog_interval = new WeakMap(), _TwitchDropsWatchdog_isRunning = new WeakMap(), _TwitchDropsWatchdog_timeoutId = new WeakMap();
exports.default = TwitchDropsWatchdog;
