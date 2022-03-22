import {DropCampaign, Inventory, TimeBasedDrop} from "../twitch";
import React from "react";
import { Table } from "./table";
import {Box} from "ink";
import {TwitchDropsBot} from "../twitch_drops_bot";

function formatTime(time: number): string {
    const days = time / 1000 / 60 / 60 / 24;
    return `${Math.round(days)} days`;
}

interface DropCampaignsTableProps {
    bot: TwitchDropsBot
}

interface DropCampaignsTableState {
    campaigns: DropCampaign[],
    progress: {[key: string]: number}
}

export class DropCampaignsTable extends React.Component<DropCampaignsTableProps, DropCampaignsTableState> {

    constructor(props: any) {
        super(props);
        this.state = {
            campaigns: [],
            progress: {}
        }
        props.bot.on("pending_drop_campaigns_updated", (campaigns: any[]) => {
            this.setState({
                campaigns: campaigns
            });
        });
    }

    render() {
        const data = this.state.campaigns.map((item: any, index: number) => {
            return {
                "Priority": index + 1,
                "Game": item.game.displayName,
                "Campaign": item.name,
                "Status": item.status,
                "Time Left": formatTime(Date.parse(item.endAt) - Date.parse(item.startAt)),
                //todo: show progress of next drop
                //"Drop":  "some drop name",
                //"Progress": this.#getProgressString()
            };
        });
        return <Table title={"Pending Drops Campaigns (" + data.length + ")"} data={data.slice(0, 5)} divider={' '}/>;
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
