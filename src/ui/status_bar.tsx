import React from "react";
import {TwitchDropsBot} from "../twitch_drops_bot.js";
import {Box, Text} from "ink";
import pidusage from "pidusage";
import pidtree from "pidtree";
import * as os from "os";
import {Config} from "../index.js";
import {compareVersionString, getLatestDevelopmentVersion, getLatestReleaseVersion} from "../utils.js";
import logger from "../logger.js";

interface Props {
    bot: TwitchDropsBot,
    username?: string,
    currentReleaseVersion: string,
    currentDevVersion?: string,
    config: Config
}

interface State {
    usageTimeoutId?: NodeJS.Timeout
    cpu: number,
    memory: number,
    updateCheckTimeoutId?: NodeJS.Timeout,
    latestReleaseVersion: string,
    latestDevVersion?: string
}

export class StatusBar extends React.Component<Props, State> {

    constructor(props: Props) {
        super(props);
        this.state = {
            cpu: 0,
            memory: 0,
            latestReleaseVersion: props.currentReleaseVersion,
            latestDevVersion: props.currentDevVersion
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
            <Text>Version: {this.#getFullVersionString()}</Text>
            {
                (this.props.currentReleaseVersion !== this.state.latestReleaseVersion || this.props.currentDevVersion !== this.state.latestDevVersion) &&
                <Text color={"greenBright"}> ▲ {this.#getFullVersionString()}</Text>
            }
        </Box>
    }

    componentDidMount() {
        this.#updateUsage();
        if (this.props.config.updates.enabled) {
            this.#doVersionCheck();
        }
    }

    componentWillUnmount() {
        if (this.state.usageTimeoutId) {
            clearTimeout(this.state.usageTimeoutId);
        }
        if (this.state.updateCheckTimeoutId) {
            clearTimeout(this.state.updateCheckTimeoutId);
        }
    }

    #getFullVersionString(): string {
        let result = this.props.currentReleaseVersion;
        const dev = this.props.currentDevVersion;
        if (this.props.config.updates.type === "dev" && dev) {
            result += `.${dev.slice(0, 5)}`;
        }
        return result;
    }

    #updateUsage() {
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
                usageTimeoutId: setTimeout(this.#updateUsage.bind(this), 10000)
            })
        });
    }

    #doVersionCheck() {
        logger.debug("Checking for updates...");
        (async () => {

            // Get the latest release version
            const latest = await getLatestReleaseVersion();
            logger.debug("latest release version: " + latest);
            if (compareVersionString(this.props.currentReleaseVersion, latest) === -1) {
                this.setState({
                    latestReleaseVersion: latest
                });
            }

            if (this.props.config.updates.type === "dev") {
                // The current commit SHA hash comes from the environment variable provided during the docker build
                const currentCommitSha = this.props.currentDevVersion;

                // If the current commit SHA hash is undefined, then we are likely not running from a docker container
                if (currentCommitSha === undefined) {
                    return;
                }

                const latestCommitSha = await getLatestDevelopmentVersion();
                logger.debug("latest dev version: " + latestCommitSha);

                // Warn the user if the current version is different from the latest version
                if (currentCommitSha !== latestCommitSha) {
                    this.setState({
                        latestDevVersion: latestCommitSha
                    });
                }
            }
        })().catch((error) => {
            logger.debug("Failed to check latest version");
            logger.debug(error);
        }).finally(() => {
            logger.debug("Done checking for updates");
            this.setState({
                updateCheckTimeoutId: setTimeout(this.#doVersionCheck.bind(this), 1000 * 60 * 60 * 24)
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
