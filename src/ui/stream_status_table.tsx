import React from "react";
import {Table} from "./table.js";
import {TwitchDropsBot} from "../twitch_drops_bot.js";

interface StreamStatusBarProps {
    bot: TwitchDropsBot
}

interface StreamStatusBarState {
    stream_url?: string,
    viewer_count?: number,
    uptime?: string,
    watch_time?: number,
    community_points?: number
}

export class StreamStatusBar extends React.Component<StreamStatusBarProps, StreamStatusBarState> {

    constructor(props: any) {
        super(props);
        this.state = {
            stream_url: undefined,
            viewer_count: undefined,
            uptime: undefined,
            watch_time: undefined,
            community_points: undefined
        };
        props.bot.on("watch_status_updated", (stats: any) => {
            if (!stats) {
                this.setState({
                    stream_url: undefined,
                    viewer_count: undefined,
                    uptime: undefined,
                    watch_time: undefined,
                    community_points: undefined
                });
                return;  // todo: clear state
            }
            this.setState({
                stream_url: stats["stream_url"],
                viewer_count: stats["viewers"],
                uptime: stats["uptime"],
                watch_time: stats["watch_time"]
            });
        });
        props.bot.on("community_points_earned", (data: any) => {
            this.setState({
                community_points: data["balance"]["balance"]
            })
        })
    }

    render() {
        return <Table title={"Stream Status"} divider={' '} data={[
            {
                "Stream URL": this.state.stream_url ?? "-",
                "Viewers": this.state.viewer_count?.toLocaleString() ?? "-",
                "Uptime": this.state.uptime ?? "-",
                "Watch Time": this.state.watch_time ? formatTime(this.state.watch_time) : "-",
                "Channel Points": this.state.community_points?.toLocaleString() ?? "-"
            }
        ]}/>
    }

}

function formatTime(time: number) {
    const seconds = Math.floor((time / 1000) % 60);
    const minutes = Math.floor((time / 1000 / 60) % 60);
    const hours = Math.floor((time / 1000 / 60 / 60) % 24);
    return `${hours}:${minutes.toLocaleString(undefined, {minimumIntegerDigits: 2})}:${seconds.toLocaleString(undefined, {minimumIntegerDigits: 2})}`;
}
