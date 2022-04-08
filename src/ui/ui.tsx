import React from "react";
import {Box, Newline, render, Spacer, Text} from 'ink';
import {DropCampaign, TimeBasedDrop} from "../twitch";
import {Table} from "./table";
import {DropCampaignsTable} from "./drop_campaigns_table";
import {StreamStatusBar} from "./stream_status_table";
import {RecentlyClaimedDropsTable} from "./recently_claimed_drops";
import {DropProgressTable} from "./drop_progress_table";
import {TwitchDropsBot} from "../twitch_drops_bot";
import {FullScreen} from "./full_screen";
import {StatusBar} from "./status_bar";
import {ControlBar} from "./control_bar";

interface Props {
    bot: TwitchDropsBot
}

interface State {
    currentDrop?: TimeBasedDrop,
    isUpdatingDropCampaigns: boolean
}

export class Application extends React.Component<Props, State> {

    constructor(props: any) {
        super(props);
        this.state = {
            currentDrop: undefined,
            isUpdatingDropCampaigns: false
        };

        // Drop Progress Table
        props.bot.on("drop_progress_updated", (drop?: TimeBasedDrop) => {
            this.setState({
                currentDrop: drop
            });
        });

        props.bot.on("before_drop_campaigns_updated", () => {
            this.setState({
                isUpdatingDropCampaigns: true
            });
        })
        props.bot.on("pending_drop_campaigns_updated", (campaigns: DropCampaign[]) => {
            this.setState({
                isUpdatingDropCampaigns: false
            });
        })
    }

    render() {
        return <FullScreen>
            <Box flexDirection={"column"} borderStyle="round" width={"100%"} height={"100%"}>
                <StatusBar bot={this.props.bot}/>
                <StreamStatusBar bot={this.props.bot}/>
                <Box height={1}/>
                <DropProgressTable bot={this.props.bot} dropId={this.state.currentDrop?.id}/>
                <Box height={1}/>
                <DropCampaignsTable bot={this.props.bot} isUpdatingDropCampaigns={this.state.isUpdatingDropCampaigns}/>
                <Box height={1}/>
                <RecentlyClaimedDropsTable bot={this.props.bot}/>
                <Spacer/>
                <ControlBar bot={this.props.bot}/>
            </Box>
        </FullScreen>
    }

}
