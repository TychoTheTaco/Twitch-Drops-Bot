import React from "react";
import {Table} from "./table.js";
import {TwitchDropsBot} from "../twitch_drops_bot.js";
import {getDropBenefitNames, TimeBasedDrop} from "../twitch.js";
import {Box, Text} from "ink";

interface Props {
    bot: TwitchDropsBot
}

interface State {
    drop?: TimeBasedDrop
}

export class DropProgressTable extends React.Component<Props, State> {

    constructor(props: Props) {
        super(props);
        this.state = {
            drop: undefined
        }
        props.bot.on("drop_progress_updated", (drop: TimeBasedDrop | null) => {
            this.setState({
                drop: drop ?? undefined
            });
        });
    }

    render() {

        const campaign = this.state.drop ? this.props.bot.getDatabase().getDropCampaignByDropId(this.state.drop.id) : null;

        let isTwitchAccountLinked = true;
        if (this.state.drop) {
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
                    "Drop": this.state.drop ? getDropBenefitNames(this.state.drop) : "-",
                    "Progress": this.state.drop ? formatProgress(this.state.drop) : "-",
                    "ETA": this.state.drop ? getEta(this.state.drop) : "-",
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
