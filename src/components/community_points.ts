import {Page} from "puppeteer";

import Component from "./component";
import {Client} from "../twitch";
import WebSocketListener from "../web_socket_listener";
import utils from "../utils";
import logger from "../logger";

export default class CommunityPointsComponent extends Component {

    onStart(twitchClient: Client, webSocketListener: WebSocketListener): Promise<void> {
        return Promise.resolve(undefined);
    }

    async onUpdate(page: Page, twitchClient: Client): Promise<boolean> {
        const claimCommunityPointsSelector = 'div[data-test-selector="community-points-summary"] div.GTGMR button';
        const claimCommunityPointsButton = await page.$(claimCommunityPointsSelector);
        if (claimCommunityPointsButton) {
            try {
                await utils.click(page, 'div[data-test-selector="community-points-summary"] div.GTGMR button');
                logger.debug('Claimed community points!');
            } catch (error) {
                logger.error('Failed to claim community points!');
                logger.error(error);
            }
        }
        return false;
    }

}
