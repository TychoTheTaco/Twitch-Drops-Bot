import React from "react";
import {TwitchDropsBot} from "../twitch_drops_bot.js";
import {Text} from "ink";
import {Background} from "./background.js";

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
