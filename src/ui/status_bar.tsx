import React from "react";
import {TwitchDropsBot} from "../twitch_drops_bot";
import {Box, Text} from "ink";
import {Background} from "./background";

interface Props {
    bot: TwitchDropsBot
}

interface State {

}

export class StatusBar extends React.Component<Props, State> {

    render() {
        return <Background color={"red"}>
            <Text backgroundColor={"blackBright"}>Logged in as someone</Text>
        </Background>
    }

}
