import {DropCampaign} from "../twitch.js";
import React from "react";
import {Table} from "./table.js";
import {Box, Spacer, Text} from "ink";
import {TwitchDropsBot} from "../twitch_drops_bot.js";

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

enum SortMode {
    PRIORITY = 0,
    START_TIME = 1,
    END_TIME = 2
}

interface Props {
    bot: TwitchDropsBot,
    isUpdatingDropCampaigns: boolean,
    sortMode: SortMode
}

interface State {
    campaigns: DropCampaign[],
    progress: { [key: string]: number },
    lastUpdateTime: Date
}

export class DropCampaignsTable extends React.Component<Props, State> {

    static defaultProps = {
        isUpdatingDropCampaigns: false,
        sortMode: SortMode.PRIORITY
    };

    readonly #priorityComparator: (a: DropCampaign, b: DropCampaign) => number;
    readonly #startTimeComparator: (a: DropCampaign, b: DropCampaign) => number;
    readonly #endTimeComparator: (a: DropCampaign, b: DropCampaign) => number;

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
        this.#priorityComparator = (a: DropCampaign, b: DropCampaign) => {
            const indexA = this.state.campaigns.indexOf(a);
            const indexB = this.state.campaigns.indexOf(b);
            return indexA - indexB;
        }
        this.#startTimeComparator = (a: DropCampaign, b: DropCampaign) => {
            const statusA = a.status;
            const statusB = b.status;
            if (statusA === "UPCOMING" && statusB !== "UPCOMING") {
                return -1;
            } else if (statusA !== "UPCOMING" && statusB === "UPCOMING") {
                return 1;
            }
            const startTimeA = Date.parse(a.startAt);
            const startTimeB = Date.parse(b.startAt);
            return startTimeA - startTimeB;
        }
        this.#endTimeComparator = (a: DropCampaign, b: DropCampaign) => {
            const statusA = a.status;
            const statusB = b.status;
            if (statusA === "ACTIVE" && statusB !== "ACTIVE") {
                return -1;
            } else if (statusA !== "ACTIVE" && statusB === "ACTIVE") {
                return 1;
            }
            const startTimeA = Date.parse(a.endAt);
            const startTimeB = Date.parse(b.endAt);
            return startTimeA - startTimeB;
        }
    }

    render() {
        const campaigns = [...this.state.campaigns];
        campaigns.sort(this.#priorityComparator)
        const data = campaigns.map((item: any) => {
            let status = "";
            if (item.status === "UPCOMING") {
                // We only update campaigns every 15 min, so we have to check if status is upcoming but should be active already
                const startsIn = Date.parse(item.startAt) - new Date().getTime();
                if (startsIn < 0) {
                    status = "Starts soon";
                } else {
                    status = `Starts in ${formatTime(startsIn)}`;
                }
            } else if (item.status === "ACTIVE") {
                const endsIn = Date.parse(item.endAt) - new Date().getTime();
                if (endsIn < 0) {
                    status = "Ends soon";
                } else {
                    status = `Ends in ${formatTime(endsIn)}`
                }
            } else {
                status = item.status;
            }

            return {
                "Priority": this.state.campaigns.indexOf(item) + 1,
                "Game": item.game.displayName,
                "Campaign": item.name,
                "Status": status,
                //todo: show progress of next drop
                //"Drop":  "some drop name",
                //"Progress": this.#getProgressString()
            };
        });
        return <Box flexDirection={"column"}>
            <Box flexDirection={"row"}>
                <Text color={"cyan"} bold>Pending Drop Campaigns ({data.length})</Text>
                <Spacer/>
                <Text>{this.props.isUpdatingDropCampaigns ? "Updating..." : "Next update in " + formatTime((this.state.lastUpdateTime.getTime() + (1000 * 60 * 15)) - new Date().getTime())}</Text>
            </Box>
            <Table header={["Priority", "Game", "Campaign", "Status"]} data={data.slice(0, 5)} divider={' '}/>
        </Box>;
    }

    #getProgressString(id: string) {
        if (this.state.progress.hasOwnProperty(id)) {
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
