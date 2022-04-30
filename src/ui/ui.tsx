import React from "react";
import {Box} from 'ink';
import {DropCampaign, TimeBasedDrop} from "../twitch.js";
import {DropCampaignsTable} from "./drop_campaigns_table.js";
import {StreamStatusBar} from "./stream_status_table.js";
import {RecentlyClaimedDropsTable} from "./recently_claimed_drops.js";
import {DropProgressTable} from "./drop_progress_table.js";
import {TwitchDropsBot} from "../twitch_drops_bot.js";
import {FullScreen} from "./full_screen.js";
import {StatusBar} from "./status_bar.js";
import {Config} from "../index.js";

interface Props {
    bot: TwitchDropsBot,
    username: string,
    version: string,
    config: Config
}

interface State {
    currentDrop?: TimeBasedDrop,
    isUpdatingDropCampaigns: boolean
}

export class Application extends React.Component<Props, State> {

    constructor(props: Props) {
        super(props);
        this.state = {
            currentDrop: undefined,
            isUpdatingDropCampaigns: false
        };

        // Drop Progress Table
        props.bot.on("drop_progress_updated", (drop: TimeBasedDrop | null) => {
            this.setState({
                currentDrop: drop ?? undefined
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
            <Box flexDirection={"column"} width={"100%"} height={"100%"}>
                <StatusBar bot={this.props.bot} username={this.props.username} currentReleaseVersion={this.props.version} config={this.props.config} currentDevVersion={process.env.GIT_COMMIT_HASH}/>
                <Box height={1}/>
                <StreamStatusBar bot={this.props.bot}/>
                <Box height={1}/>
                <DropProgressTable bot={this.props.bot} dropId={this.state.currentDrop?.id}/>
                <Box height={1}/>
                <DropCampaignsTable bot={this.props.bot} isUpdatingDropCampaigns={this.state.isUpdatingDropCampaigns}/>
                <Box height={1}/>
                <RecentlyClaimedDropsTable bot={this.props.bot}/>
            </Box>
        </FullScreen>
    }

}
