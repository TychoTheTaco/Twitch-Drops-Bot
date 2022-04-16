import EventEmitter from "events";

import {Page} from "puppeteer";

import {Client} from "../twitch.js";
import WebSocketListener from "../web_socket_listener.js";

export default abstract class Component extends EventEmitter {

    abstract onStart(twitchClient: Client, webSocketListener: WebSocketListener): Promise<void>;

    abstract onUpdate(page: Page, twitchClient: Client): Promise<boolean>;

}
