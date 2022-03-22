import React from "react";
import {Box, Newline, render, Spacer, Text} from 'ink';
import {DropCampaign} from "../twitch";
import {Table} from "./table";
import {DropCampaignsTable} from "./drop_campaigns_table";
import {StreamStatusBar} from "./status_bar";
import {RecentlyClaimedDropsTable} from "./recently_claimed_drops";
import {DropProgressTable} from "./drop_progress_table";

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
        return <Box borderStyle="round" height={this.state.rows}>
            <Text backgroundColor="red">Rows: {this.state.rows}</Text>
        </Box>
    }

}

export class Application extends React.Component<any, any> {

    render() {
        return <Box flexDirection={"column"} borderStyle={"double"} /*width={80} height={24}*/>
            <StreamStatusBar bot={this.props.bot}/>
            <Box height={1}/>
            <DropProgressTable bot={this.props.bot}/>
            <Box height={1}/>
            <DropCampaignsTable bot={this.props.bot}/>
            <Box height={1}/>
            <RecentlyClaimedDropsTable bot={this.props.bot}/>
        </Box>
    }

}
