import React from "react";
import {Table} from "./table.js";
import {TwitchDropsBot} from "../twitch_drops_bot.js";
import {getDropBenefitNames, TimeBasedDrop} from "../twitch.js";
import {Box, Text} from "ink";

interface Props {
    bot: TwitchDropsBot,
    dropId?: string
}

interface State {

}

export class DropProgressTable extends React.Component<Props, State> {

    render() {

        const drop = this.props.dropId ? this.props.bot.getDatabase().getDropById(this.props.dropId) : null;
        const campaign = this.props.dropId ? this.props.bot.getDatabase().getDropCampaignByDropId(this.props.dropId) : null;

        let isTwitchAccountLinked = true;
        if (this.props.dropId) {
            if (campaign) {
                isTwitchAccountLinked = campaign?.self.isAccountConnected;
            }
        }
        return <Box flexDirection={"column"}>
            <Box flexDirection={"row"}>
                <Text color={"cyan"} bold>Drop Status</Text>
                { !isTwitchAccountLinked &&
                    <Text>
                        <Text> - </Text>
                        <Text color={"yellow"} bold>Twitch account not linked!</Text>
                    </Text>
                }
            </Box>
            <Table divider={' '} data={[
                {
                    "Game": campaign?.game.displayName ?? "-",
                    "Campaign": campaign?.name ?? "-",
                    "Drop": drop ? getDropBenefitNames(drop) : "-",
                    "Progress": drop ? formatProgress(drop) : "-",
                    "ETA": drop ? getEta(drop) : "-",
                }
            ]}/>
        </Box>
    }

}

function getEta(drop: TimeBasedDrop) {
    const minutesRemaining = drop.requiredMinutesWatched - (drop.self?.currentMinutesWatched ?? 0);
    return new Date(new Date().getTime() + minutesRemaining * 60 * 1000).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function formatProgress(drop: TimeBasedDrop) {
    return `${drop?.self?.currentMinutesWatched ?? 0} / ${drop.requiredMinutesWatched} minutes`;
}
