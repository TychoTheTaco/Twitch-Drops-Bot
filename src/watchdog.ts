"use strict";

import {EventEmitter} from "events";
import {Client, DropCampaign} from "./twitch.js";

export class TwitchDropsWatchdog extends EventEmitter {

    readonly #client: Client;
    readonly #pollingIntervalMinutes: number;

    #isRunning: boolean = false;
    #timeoutId: NodeJS.Timeout = setTimeout(() => {
    });

    constructor(client: Client, interval: number = 15) {
        super();
        this.#client = client;
        this.#pollingIntervalMinutes = interval;
    }

    start() {
        if (!this.#isRunning) {
            this.#isRunning = true;
            const run = () => {
                this.emit('before_update');
                this.#client.getDropCampaigns().then((campaigns: DropCampaign[]) => {
                    this.emit('update', campaigns);
                }).catch((error) => {
                    this.emit('error', error);
                }).finally(() => {
                    this.#timeoutId = setTimeout(run, 1000 * 60 * this.#pollingIntervalMinutes);
                });
            };
            run();
        }
    }

    stop() {
        if (this.#isRunning) {
            clearTimeout(this.#timeoutId);
            this.#isRunning = false;
        }
    }

}

export default TwitchDropsWatchdog;
