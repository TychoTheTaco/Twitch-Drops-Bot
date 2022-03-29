import React from "react";
import {Box, Newline, render, Spacer, Text} from 'ink';
import {DropCampaign, TimeBasedDrop} from "../twitch";
import {Table} from "./table";
import {DropCampaignsTable} from "./drop_campaigns_table";
import {StreamStatusBar} from "./status_bar";
import {RecentlyClaimedDropsTable} from "./recently_claimed_drops";
import {DropProgressTable} from "./drop_progress_table";
import {TwitchDropsBot} from "../twitch_drops_bot";

class FullScreenBox extends React.Component<any, any> {

    constructor(props: any) {
        super(props);
        const getState = () => {
            return {
                rows: process.stdout.rows
            };
        }
        this.state = getState();
        process.stdout.on('resize', () => {
            this.setState(getState());
        })
    }

    render() {
        return <Box flexDirection={"column"} borderStyle="round" height={this.state.rows}>
            {this.props.children}
        </Box>
    }

}

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
        return <Box flexDirection={"column"} borderStyle={"double"} /*width={80} height={24}*/>
            <StreamStatusBar bot={this.props.bot}/>
            <Box height={1}/>
            <DropProgressTable drop={this.state.currentDrop}/>
            <Box height={1}/>
            <DropCampaignsTable bot={this.props.bot} isUpdatingDropCampaigns={this.state.isUpdatingDropCampaigns}/>
            <Box height={1}/>
            <RecentlyClaimedDropsTable bot={this.props.bot}/>
        </Box>
    }

}
