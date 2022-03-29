import {DropCampaign, Inventory, TimeBasedDrop} from "../twitch";
import React from "react";
import { Table } from "./table";
import {Box, Spacer, Text} from "ink";
import {TwitchDropsBot} from "../twitch_drops_bot";

function formatTime(time: number): string {
    const days = Math.floor(time / 1000 / 60 / 60 / 24);
    if (days > 0) {
        return `${days} day` + (days === 1 ? '' : 's');
    }
    const hours = Math.floor(time / 1000 / 60 / 60);
    if (hours > 0) {
        return `${hours} hour` + (hours === 1 ? '' : 's');
    }
    const minutes = Math.floor(time / 1000 / 60);
    if (minutes > 0) {
        return `${minutes} minute` + (minutes === 1 ? '' : 's');
    }
    const seconds = Math.floor(time / 1000);
    return `${seconds} second` + (seconds === 1 ? '' : 's');
}

interface Props {
    bot: TwitchDropsBot,
    isUpdatingDropCampaigns: boolean
}

interface DropCampaignsTableState {
    campaigns: DropCampaign[],
    progress: {[key: string]: number},
    lastUpdateTime: Date
}

export class DropCampaignsTable extends React.Component<Props, DropCampaignsTableState> {

    static defaultProps = {
        isUpdatingDropCampaigns: false
    };

    constructor(props: any) {
        super(props);
        this.state = {
            campaigns: [],
            progress: {},
            lastUpdateTime: new Date()
        }
        props.bot.on("pending_drop_campaigns_updated", (campaigns: any[]) => {
            this.setState({
                campaigns: campaigns,
                lastUpdateTime: new Date()
            });
        });
    }

    render() {
        const data = this.state.campaigns.map((item: any, index: number) => {
            let timeLeft = new Date().getTime() - Date.parse(item.startAt);
            let timeLeftFormatted = formatTime(Math.abs(timeLeft));
            if (timeLeft < 0) {
                timeLeftFormatted = "-" + timeLeftFormatted;
            }
            return {
                "Priority": index + 1,
                "Game": item.game.displayName,
                "Campaign": item.name,
                "Status": item.status,
                "Time Left": timeLeftFormatted,
                //todo: show progress of next drop
                //"Drop":  "some drop name",
                //"Progress": this.#getProgressString()
            };
        });
        return <Box flexDirection={"column"} width={120}>
            <Box flexDirection={"row"}>
                <Text color={"blue"} bold>Pending Drop Campaigns ({data.length})</Text>
                <Spacer/>
                <Text>{this.props.isUpdatingDropCampaigns ? "Updating..." : "Next update in " + formatTime((this.state.lastUpdateTime.getTime() + (1000 * 60 * 15)) - new Date().getTime())}</Text>
            </Box>
            <Table header={["Priority", "Game", "Campaign", "Status", "Time Left"]} data={data.slice(0, 5)} divider={' '}/>
        </Box>;
    }

    #getProgressString(id: string) {
        if (this.state.progress.hasOwnProperty(id)){
            for (const campaign of this.state.campaigns) {
                for (const drop of campaign.timeBasedDrops) {
                    if (drop.id == id) {
                        return `${this.state.progress[id]} / ${drop.requiredMinutesWatched} minutes`;
                    }
                }

            }
        }
        return "-";
    }

}
