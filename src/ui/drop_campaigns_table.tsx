import { DropCampaign } from "../twitch";
import React from "react";
import { Table } from "./table";

function formatTime(time: number): string {
    const days = time / 1000 / 60 / 60 / 24;
    return `${Math.round(days)} days`;
}

interface DropCampaignsTableProps {
    campaigns: DropCampaign[]
}

export class DropCampaignsTable extends React.Component<DropCampaignsTableProps, any> {

    render() {
        const data = this.props.campaigns.map((item: any, index: number) => {
            return {
                "Priority": index + 1,
                "Game": item.game.displayName,
                "Campaign": item.name,
                "Status": item.status,
                connected: item.self.isAccountConnected,
                "Time Left": formatTime(Date.parse(item.endAt) - Date.parse(item.startAt)),
                "Drop":  "some drop name",
                "Progress": "100%"
            };
        });
        return <Table data={data.slice(0, 10)}/>;
    }

}
