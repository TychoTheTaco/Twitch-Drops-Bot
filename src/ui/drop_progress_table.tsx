import React from "react";
import {Table} from "./table";
import {TwitchDropsBot} from "../twitch_drops_bot";
import {TimeBasedDrop} from "../twitch";

interface Props {
    drop?: TimeBasedDrop
}

interface State {

}

export class DropProgressTable extends React.Component<Props, State> {

    constructor(props: any) {
        super(props);
    }

    render() {
        return <Table title={"Drop Status"} divider={' '} data={[
            {
                "Game": this.props.drop?.campaign.game.displayName ?? "-",
                "Campaign": this.props.drop?.campaign.name ?? "-",
                "Drop": this.props.drop?.name ?? "-",
                "Progress": this.props.drop ? formatProgress(this.props.drop) : "-",
                "ETA": this.props.drop ? getEta(this.props.drop) : "-",
            }
        ]}/>
    }

}

function getEta(drop: TimeBasedDrop) {
    const minutesRemaining = drop.requiredMinutesWatched - drop.self.currentMinutesWatched;
    return new Date(new Date().getTime() + minutesRemaining * 60 * 1000).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function formatProgress(drop: TimeBasedDrop) {
    return `${drop?.self?.currentMinutesWatched ?? "?"} / ${drop.requiredMinutesWatched} minutes`;
}
