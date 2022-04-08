import React from "react";
import {TwitchDropsBot} from "../twitch_drops_bot";
import {Box, measureElement, Text} from "ink";
import logger from "../logger";
import {Background} from "./background";

interface Props {
    bot: TwitchDropsBot
}

interface State {

}

export class ControlBar extends React.Component<Props, State> {

    render() {
        return <Background color={"yellow"}>
            <Text backgroundColor={"green"}>some other text</Text>
        </Background>
    }

}
