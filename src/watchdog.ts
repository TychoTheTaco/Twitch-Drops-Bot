'use strict';

import {EventEmitter} from 'events';
import {Client} from "./twitch";

export class TwitchDropsWatchdog extends EventEmitter {

    #client: Client;
    readonly #interval: number;

    #isRunning: boolean = false;
    #timeoutId: NodeJS.Timeout = setTimeout(() => {
    });

    constructor(client: Client, interval: number = 15) {
        super();
        this.#client = client;
        this.#interval = interval;
    }

    start() {
        if (!this.#isRunning) {
            this.#isRunning = true;
            const run = () => {
                this.emit('before_update');
                this.#client.getDropCampaigns().then((campaigns) => {
                    this.emit('update', campaigns);
                }).catch((error) => {
                    this.emit('error', error);
                }).finally(() => {
                    this.#timeoutId = setTimeout(run, 1000 * 60 * this.#interval);
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
