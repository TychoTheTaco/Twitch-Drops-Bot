import React from "react";
import {TwitchDropsBot} from "../twitch_drops_bot.js";
import {Box, Text} from "ink";
import pidusage from "pidusage";
import pidtree from "pidtree";
import * as os from "os";

interface Props {
    bot: TwitchDropsBot,
    username?: string,
    version: string
}

interface State {
    timeoutId?: NodeJS.Timeout
    cpu: number,
    memory: number
}

export class StatusBar extends React.Component<Props, State> {

    constructor(props: Props) {
        super(props);
        this.state = {
            cpu: 0,
            memory: 0
        };
    }

    render() {
        return <Box>
            {
                this.props.username &&
                <Text>Logged in as {this.props.username}</Text>
            }
            <Text> | </Text>
            <Text>CPU: {Math.round(this.state.cpu)}%</Text>
            <Text> | </Text>
            <Text>MEM: {byteCountToString(this.state.memory)}</Text>
            <Text> | </Text>
            <Text>Version: {this.props.version}</Text>
        </Box>
    }

    componentDidMount() {
        this.#update();
    }

    componentWillUnmount() {
        if (this.state.timeoutId) {
            clearTimeout(this.state.timeoutId);
        }
    }

    #update() {
        (async () => {
            const processes = await pidtree(process.pid, {root: true});
            let cpu = 0;
            let memory = 0;
            for (const pid of processes) {
                try {
                    const usage = await pidusage(pid);
                    cpu += usage.cpu;
                    memory += usage.memory;
                } catch (e) {
                    // ignore
                }
            }
            this.setState({
                cpu: cpu  / os.cpus().length,
                memory: memory
            });
        })().finally(() => {
            this.setState({
                timeoutId: setTimeout(this.#update.bind(this), 10000)
            })
        });
    }

}

function byteCountToString(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    const KiB = bytes / 1024;
    if (KiB < 1024) {
        return `${Math.round(KiB)} KiB`;
    }
    const MiB = KiB / 1024;
    if (MiB < 1024) {
        return `${Math.round(MiB)} MiB`;
    }
    const GiB = MiB / 1024;
    return `${GiB.toFixed(2)} GiB`;
}
