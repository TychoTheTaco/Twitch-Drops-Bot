import React from "react";
import {Table} from "./table.js";
import {TwitchDropsBot} from "../twitch_drops_bot.js";
import {getDropBenefitNames} from "../twitch.js";


interface Props {
    bot: TwitchDropsBot
}

interface State {
    dropIds: string[],
    claim_times: { [key: string]: Date }
}

export class RecentlyClaimedDropsTable extends React.Component<Props, State> {

    constructor(props: any) {
        super(props);
        this.state = {
            dropIds: [],
            claim_times: {}
        }
        props.bot.on("drop_claimed", (id: string) => {
            this.setState((previousState) => {
                const claim_times = previousState.claim_times;
                claim_times[id] = new Date();
                return {
                    dropIds: previousState.dropIds.concat(id),
                    claim_times: claim_times
                };
            });
        });
    }

    render() {
        let data: any[] = this.state.dropIds.map((id: string) => {
            const campaign = this.props.bot.getDatabase().getDropCampaignByDropId(id);
            const drop = this.props.bot.getDatabase().getDropById(id);
            return {
                "Time Claimed": this.state.claim_times[id].toLocaleString(undefined, {
                    timeStyle: "short",
                    dateStyle: "short"
                }),
                "Game": campaign?.game?.displayName ?? "-",
                "Campaign": campaign?.name,
                "Drop": drop ? getDropBenefitNames(drop) : "-"
            };
        });
        data.reverse();
        return <Table title={"Recently Claimed Drops (" + this.state.dropIds.length + ")"} header={["Time Claimed", "Game", "Campaign", "Drop"]} data={data.slice(0, 3)} divider={' '}/>
    }

}
