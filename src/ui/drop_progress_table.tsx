import React from "react";
import {Table} from "./table";
import {TwitchDropsBot} from "../twitch_drops_bot";
import {TimeBasedDrop} from "../twitch";

interface Props {
    bot: TwitchDropsBot
}

interface State {
    drop: TimeBasedDrop
}

export class DropProgressTable extends React.Component<Props, State> {

    constructor(props: any) {
        super(props);
        props.bot.on("drop_progress_updated", (drop: TimeBasedDrop) => {
            this.setState({
                drop: drop
            });
        })
    }

    render() {
        return <Table divider={' '} data={[
            {
                "Game": "-" ?? "-",  // todo
                "Campaign": "-" ?? "-",  // todo
                "Drop": this.state?.drop.name ?? "-",
                "Progress": this.state?.drop ? formatProgress(this.state.drop) : "-",
                "ETA": this.state?.drop ? getEta(this.state.drop) : "-",
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
