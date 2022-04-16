import {Page} from "puppeteer";

import Component from "./component.js";
import {Client} from "../twitch.js";
import WebSocketListener from "../web_socket_listener.js";
import logger from "../logger.js";
import {StreamPage} from "../pages/stream.js";

export default class CommunityPointsComponent extends Component {

    onStart(twitchClient: Client, webSocketListener: WebSocketListener): Promise<void> {
        return Promise.resolve(undefined);
    }

    async onUpdate(page: Page, twitchClient: Client): Promise<boolean> {

        // Expand the chat column. This is required for the claim community points button to show up.
        await new StreamPage(page).expandChatColumn();

        // Claim community points
        const claimCommunityPointsButton = await page.$x("//div[@data-test-selector='community-points-summary']//div[contains(concat(' ', normalize-space(@class), ' '), ' claimable-bonus__icon ')]/ancestor::button");
        if (claimCommunityPointsButton.length === 1) {
            try {
                await claimCommunityPointsButton[0].evaluate((element: any) => {
                    element.click();
                });
                logger.info('Claimed community points!');
            } catch (error) {
                logger.error('Failed to claim community points!');
                logger.debug(error);
            }
        } else if (claimCommunityPointsButton.length > 1) {
            logger.debug("more than 1 claim community points buttons: " + claimCommunityPointsButton.length);
        }
        return false;
    }

}
