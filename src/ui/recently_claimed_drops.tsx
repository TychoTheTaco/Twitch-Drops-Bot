import {TimeBasedDrop} from "../twitch";
import React from "react";
import {Table} from "./table";
import {TwitchDropsBot} from "../twitch_drops_bot";


interface Props {
    bot: TwitchDropsBot
}

interface State {
    drops: TimeBasedDrop[],
    claim_times: { [key: string]: Date }
}

export class RecentlyClaimedDropsTable extends React.Component<Props, State> {

    constructor(props: any) {
        super(props);
        this.state = {
            drops: [],
            claim_times: {}
        }
        props.bot.on("drop_claimed", (drop: TimeBasedDrop) => {
            this.setState((previousState) => {
                const claim_times = previousState.claim_times;
                claim_times[drop.id] = new Date();
                return {
                    drops: previousState.drops.concat(drop),
                    claim_times: claim_times
                };
            });
        });
    }

    render() {
        let data: any[] = this.state.drops.map((item: TimeBasedDrop) => {
            return {
                "Time Claimed": this.state.claim_times[item.id].toLocaleString(undefined, {
                    timeStyle: "short",
                    dateStyle: "short"
                }),
                "Game": item.campaign.game?.displayName ?? "-",
                "Campaign": item.campaign.name,
                "Drop": item.name
            };
        });
        if (data.length === 0) {
            data = [{
                "Time Claimed": "-",
                "Game": "-",
                "Campaign": "-",
                "Drop": "-"
            }]
        }
        data.reverse();
        return <Table title={"Recently Claimed Drops (" + this.state.drops.length + ")"} data={data.slice(0, 3)} divider={' '}/>
    }

}
