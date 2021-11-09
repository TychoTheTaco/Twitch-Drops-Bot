'use strict';

const { EventEmitter } = require('events');

class TwitchDropsWatchdog extends EventEmitter {

    #client;

    constructor(client, interval = 15) {
        super();
        this.#client = client;
        this._interval = interval;
        this._timeoutId = null;
        this._isRunning = false;
    }

    start() {
        if (!this._isRunning) {
            this._isRunning = true;
            const run = () => {
                this.emit('before_update');
                this._getActiveDropCampaigns().then((campaigns) => {
                    this.emit('update', campaigns);
                    this._timeoutId = setTimeout(run, 1000 * 60 * this._interval);
                });
            };
            run();
        }
    }

    stop() {
        if (this._isRunning){
            clearTimeout(this._timeoutId);
            this._isRunning = false;
        }
    }

    async _getActiveDropCampaigns() {
        return (await this.#client.getDropCampaigns()).filter(campaign => {
            return campaign['status'] === 'ACTIVE';
        });
    }

}

module.exports = {
    TwitchDropsWatchdog
}
