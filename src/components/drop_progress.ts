import {Page} from "puppeteer";

import Component from "./component.js";
import {Client, TimeBasedDrop, getInventoryDrop} from "../twitch.js";
import logger from "../logger.js";
import WebSocketListener, {UserDropEvents_DropProgress} from "../web_socket_listener.js";
import {NoProgressError} from "../errors.js";

export default class DropProgressComponent extends Component {

    /**
     * The Drop that we are trying to make progress towards. Sometimes when watching a stream, we make progress towards
     * a different Drop than we had intended. This can happen when a game has multiple Drop campaigns, and we try to
     * process one, but a different one is currently active.
     * @private
     */
    readonly #targetDrop: TimeBasedDrop | null = null;

    /**
     * When true, an exception will be thrown if we haven't made any progress for {@link #maxNoProgressMinutes} minutes.
     * @private
     */
    readonly #requireProgress: boolean = true;

    /**
     * When true, exit after claiming a drop.
     * @private
     */
    readonly #exitOnClaim: boolean = true;

    /**
     * If we haven't made any progress in this many minutes, then an exception will be thrown. This only has an effect
     * when {@link #requireProgress} is true.
     * @private
     */
    readonly #maxNoProgressMinutes: number = 5;

    /**
     * The drop that we are currently making progress towards.
     * @private
     */
    #currentDrop: TimeBasedDrop | null = null;  // TODO: It is possible to make progress towards 2 or more drops at the same time!

    readonly #currentMinutesWatched: { [key: string]: number } = {};
    readonly #lastMinutesWatched: { [key: string]: number } = {};
    readonly #lastProgressTime: { [key: string]: number } = {};
    #isDropReadyToClaim: boolean = false;

    #shouldStop: boolean = false;

    #pendingWebSocketMessages: UserDropEvents_DropProgress[] = [];

    constructor(options?: { targetDrop?: TimeBasedDrop, requireProgress?: boolean, exitOnClaim?: boolean }) {
        super();
        this.#targetDrop = options?.targetDrop ?? this.#targetDrop;
        this.#requireProgress = options?.requireProgress ?? this.#requireProgress;
        this.#exitOnClaim = options?.exitOnClaim ?? this.#exitOnClaim;

        this.#currentDrop = this.#targetDrop ?? this.#currentDrop;
        logger.debug('target: ' + JSON.stringify(this.#targetDrop, null, 4));

        if (this.#targetDrop !== null) {
            this.#currentMinutesWatched[this.#targetDrop.id] = 0;
            this.#lastMinutesWatched[this.#targetDrop.id] = -1;
            this.#lastProgressTime[this.#targetDrop.id] = new Date().getTime();
        }
    }

    async onStart(twitchClient: Client, webSocketListener: WebSocketListener): Promise<void> {

        // Get initial drop progress
        if (this.#targetDrop !== null) {
            const inventory = await twitchClient.getInventory();
            const inventoryDrop = getInventoryDrop(this.#targetDrop.id, inventory);
            if (inventoryDrop) {
                this.#currentMinutesWatched[this.#targetDrop.id] = inventoryDrop.self.currentMinutesWatched;
                this.#lastMinutesWatched[this.#targetDrop.id] = this.#currentMinutesWatched[this.#targetDrop.id];
                logger.debug('Initial drop progress: ' + this.#currentMinutesWatched[this.#targetDrop.id] + ' minutes');

                // Check if this drop is ready to be claimed
                if (this.#currentMinutesWatched[this.#targetDrop.id] >= this.#targetDrop.requiredMinutesWatched) {
                    this.#isDropReadyToClaim = true;
                    logger.debug("ready to claim! ip");
                }
            } else {
                logger.debug('Initial drop progress: none');
            }
        }

        webSocketListener.on('drop-progress', (data: UserDropEvents_DropProgress) => {
            this.#pendingWebSocketMessages.push(data);
        });
    }

    async onUpdate(page: Page, twitchClient: Client): Promise<boolean> {

        // Process web socket messages
        for (const data of this.#pendingWebSocketMessages) {
            const dropId = data.drop_id;

            // Check if the drop is ready to be claimed. This might not be the same drop that we intended to make progress towards
            // since we can make progress towards multiple drops at once.
            if (data.current_progress_min >= data.required_progress_min) {
                logger.debug("ready to claim! dp"); //todo: make sure drop has not been claimed already, sometimes ws messages are delayed
                await this.#claimDrop(data.drop_id, twitchClient);
                this.#shouldStop = true;
            }

            // Check if we are making progress towards the expected drop. This is not always the case since a game may
            // have multiple drop campaigns, but only one is active at a time. If this happens, then we will just set
            // the current drop to the one we are making progress on.
            if (dropId !== this.#currentDrop?.id) {
                logger.debug('Drop progress message does not match expected drop: ' + this.#currentDrop?.id + ' vs ' + dropId);

                if (!(dropId in this.#currentMinutesWatched)) {
                    this.#currentMinutesWatched[dropId] = data.current_progress_min;
                    this.#lastMinutesWatched[dropId] = data.current_progress_min;
                }
            }

            // Check if we are making progress
            this.#currentMinutesWatched[dropId] = data.current_progress_min;
            if (this.#currentMinutesWatched[dropId] > this.#lastMinutesWatched[dropId]) {
                this.#lastProgressTime[dropId] = new Date().getTime();
                this.#lastMinutesWatched[dropId] = this.#currentMinutesWatched[dropId];

                if (dropId !== this.#currentDrop?.id) {
                    logger.debug('made progress towards a different drop! expected: ' + this.#currentDrop?.id + ' vs actual: ' + dropId);

                    // If we made progress for a different drop, switch to it
                    const inventory = await twitchClient.getInventory();
                    const inventoryDrop = getInventoryDrop(dropId, inventory);

                    if (inventoryDrop === null) {
                        throw new Error('Made progress towards a drop but did not find it in inventory!');
                    }

                    this.#currentDrop = inventoryDrop; //todo: no game displayname ?
                    logger.debug("new drop: " + JSON.stringify(inventoryDrop, null, 4));

                    if (!(this.#currentDrop.id in this.#currentMinutesWatched)) {
                        this.#currentMinutesWatched[this.#currentDrop?.id] = this.#currentDrop?.self.currentMinutesWatched;
                        this.#lastMinutesWatched[this.#currentDrop?.id] = this.#currentDrop?.self.currentMinutesWatched;
                        this.#lastProgressTime[this.#currentDrop.id] = new Date().getTime();
                    }

                    this.emit('drop-data-changed');

                }
            }
        }
        this.#pendingWebSocketMessages = [];

        if (this.#currentDrop !== null) {

            // Check if we have made progress towards the current drop
            if (this.#requireProgress) {
                if (new Date().getTime() - this.#lastProgressTime[this.#currentDrop.id] >= this.#maxNoProgressMinutes * 60 * 1000) {

                    // Maybe we haven't got any updates from the web socket, lets check our inventory
                    const currentDropId = this.#currentDrop.id;
                    const inventory = await twitchClient.getInventory();
                    const inventoryDrop = getInventoryDrop(currentDropId, inventory);
                    if (inventoryDrop) {
                        this.#currentMinutesWatched[currentDropId] = inventoryDrop.self.currentMinutesWatched;
                        if (this.#currentMinutesWatched[currentDropId] > this.#lastMinutesWatched[currentDropId]) {
                            this.#lastProgressTime[currentDropId] = new Date().getTime();
                            this.#lastMinutesWatched[currentDropId] = this.#currentMinutesWatched[currentDropId];
                            logger.debug('No progress from web socket! using inventory progress: ' + this.#currentMinutesWatched[currentDropId] + ' minutes');

                            // Check if this drop is ready to be claimed
                            if (this.#currentMinutesWatched[currentDropId] >= this.#currentDrop.requiredMinutesWatched) {
                                this.#isDropReadyToClaim = true;
                                logger.debug("ready to claim! invp");
                            }

                        } else {
                            throw new NoProgressError("No progress was detected in the last " + this.#maxNoProgressMinutes + " minutes!");
                        }
                    } else {
                        throw new NoProgressError("No progress was detected in the last " + this.#maxNoProgressMinutes + " minutes!");
                    }
                }
            }

            if (this.#isDropReadyToClaim) {
                this.#isDropReadyToClaim = false;
                await this.#claimDrop(this.#currentDrop.id, twitchClient);

                // TODO: dont return, check for more drops
                if (this.#exitOnClaim) {
                    return true;
                }
            }

            if (this.#exitOnClaim && this.#shouldStop) {
                this.#shouldStop = false;
                return true;
            }

        }

        return false;
    }

    async #claimDrop(dropId: string, twitchClient: Client) {
        logger.debug("claiming...");

        const inventory = await twitchClient.getInventory();
        const inventoryDrop = getInventoryDrop(dropId, inventory);
        logger.debug("inventory drop: " + JSON.stringify(inventoryDrop, null, 4));

        if (inventoryDrop === null) {
            throw new Error("inventory drop was null when trying to claim it!")
        }

        // Claim the drop
        await twitchClient.claimDropReward(inventoryDrop.self.dropInstanceID);
        this.emit('drop-claimed', inventoryDrop);
    }

    get currentDrop(): TimeBasedDrop | null {
        return this.#currentDrop;
    }

    get currentMinutesWatched(): number | null {
        if (this.#currentDrop === null) {
            return null;
        }
        return this.#currentMinutesWatched[this.#currentDrop.id];
    }

}
