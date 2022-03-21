import React from "react";
import {Box, render, Text} from 'ink';
import {DropCampaign} from "../twitch";
import {Table} from "./table";
import {DropCampaignsTable} from "./drop_campaigns_table";
import {StatusBar} from "./status_bar";

class FullScreenBox extends React.Component<any, any> {

    constructor(props: any) {
        super(props);
        const getState = () => {
            return {
                rows: process.stdout.rows
            };
        }
        this.state = getState();
        process.stdout.on('resize', () => {
            this.setState(getState());
        })
    }

    render() {
        return <Box borderStyle="round" height={this.state.rows}>
            <Text backgroundColor="red">Rows: {this.state.rows}</Text>
        </Box>
    }

}

export class Application extends React.Component<any, any> {

    constructor(props: any) {
        super(props);
        this.state = {
            bot: props.bot,
            camps: [
                {
                    "id": "d1abb76c-50d8-44a9-8cea-7d0a276f335f",
                    "name": "Test 2/28-3/20",
                    "owner": {
                        "id": "a1a51d5a-233d-41c3-9acd-a03bdab35159",
                        "name": "Out of the Park Developments",
                        "__typename": "Organization"
                    },
                    "game": {
                        "id": "1886157643",
                        "displayName": "Out of the Park Baseball 22",
                        "boxArtURL": "https://static-cdn.jtvnw.net/ttv-boxart/1886157643_IGDB-120x160.jpg",
                        "__typename": "Game"
                    },
                    "status": "EXPIRED",
                    "startAt": "2022-02-28T08:00:00Z",
                    "endAt": "2022-03-20T08:00:00Z",
                    "detailsURL": "https://forums.ootpdevelopments.com/showthread.php?t=323654",
                    "accountLinkURL": "https://challenge.ootpdevelopments.com/twitch",
                    "self": {
                        "isAccountConnected": false,
                        "__typename": "DropCampaignSelfEdge"
                    },
                    "__typename": "DropCampaign"
                },
                {
                    "id": "9ebd4b9e-26e3-418b-896f-04c698c34dcc",
                    "name": "St Patrick's Day Drops NA",
                    "owner": {
                        "id": "6948a129-2c6d-4d88-9444-6b96918a19f8",
                        "name": "Wargaming",
                        "__typename": "Organization"
                    },
                    "game": {
                        "id": "27546",
                        "displayName": "World of Tanks",
                        "boxArtURL": "https://static-cdn.jtvnw.net/ttv-boxart/27546-120x160.jpg",
                        "__typename": "Game"
                    },
                    "status": "ACTIVE",
                    "startAt": "2022-03-17T10:20:00Z",
                    "endAt": "2022-03-21T10:20:00Z",
                    "detailsURL": "https://worldoftanks.com/en/content/guide/general/guide-to-twitch-drops/",
                    "accountLinkURL": "https://na.wargaming.net/personal/",
                    "self": {
                        "isAccountConnected": true,
                        "__typename": "DropCampaignSelfEdge"
                    },
                    "__typename": "DropCampaign"
                },
                {
                    "id": "ec2c88e8-4c06-46ce-ad5a-f73cf7cd1105",
                    "name": "Update 0.11.2: Part 1",
                    "owner": {
                        "id": "6948a129-2c6d-4d88-9444-6b96918a19f8",
                        "name": "Wargaming",
                        "__typename": "Organization"
                    },
                    "game": {
                        "id": "32502",
                        "displayName": "World of Warships",
                        "boxArtURL": "https://static-cdn.jtvnw.net/ttv-boxart/32502_IGDB-120x160.jpg",
                        "__typename": "Game"
                    },
                    "status": "ACTIVE",
                    "startAt": "2022-03-17T15:00:00Z",
                    "endAt": "2022-03-31T16:00:00Z",
                    "detailsURL": "https://worldofwarships.eu/news/general-news/stream-rewards-0112/",
                    "accountLinkURL": "https://worldofwarships.eu/content/twitch-connect/",
                    "self": {
                        "isAccountConnected": true,
                        "__typename": "DropCampaignSelfEdge"
                    },
                    "__typename": "DropCampaign"
                },
                {
                    "id": "32481796-bfba-4835-af9b-6119e16b86e2",
                    "name": "Official KO City S5W6",
                    "owner": {
                        "id": "fa395b5e-cadd-47d9-989d-fe511aa3dbb1",
                        "name": "Electronic Arts",
                        "__typename": "Organization"
                    },
                    "game": {
                        "id": "1924769596",
                        "displayName": "Knockout City",
                        "boxArtURL": "https://static-cdn.jtvnw.net/ttv-boxart/1924769596-120x160.jpg",
                        "__typename": "Game"
                    },
                    "status": "UPCOMING",
                    "startAt": "2022-04-05T12:00:00Z",
                    "endAt": "2022-04-12T12:00:00Z",
                    "detailsURL": "https://www.ea.com/games/knockout-city",
                    "accountLinkURL": "https://ea.com/twitchlinking",
                    "self": {
                        "isAccountConnected": true,
                        "__typename": "DropCampaignSelfEdge"
                    },
                    "__typename": "DropCampaign"
                },
                {
                    "id": "eaa72ba0-7ff7-4d47-8b4b-9623d069aa64",
                    "name": "KO City Season 5, Week 12",
                    "owner": {
                        "id": "fa395b5e-cadd-47d9-989d-fe511aa3dbb1",
                        "name": "Electronic Arts",
                        "__typename": "Organization"
                    },
                    "game": {
                        "id": "1924769596",
                        "displayName": "Knockout City",
                        "boxArtURL": "https://static-cdn.jtvnw.net/ttv-boxart/1924769596-120x160.jpg",
                        "__typename": "Game"
                    },
                    "status": "UPCOMING",
                    "startAt": "2022-05-17T12:00:00Z",
                    "endAt": "2022-05-24T12:00:00Z",
                    "detailsURL": "https://www.ea.com/games/knockout-city",
                    "accountLinkURL": "https://ea.com/twitchlinking",
                    "self": {
                        "isAccountConnected": true,
                        "__typename": "DropCampaignSelfEdge"
                    },
                    "__typename": "DropCampaign"
                },
                {
                    "id": "76f6ca77-0826-4151-bb54-fffb3ca3fc74",
                    "name": "Paladins Drops 22.1 Wk 9",
                    "owner": {
                        "id": "51a157a0-674a-4863-b120-7bb6ee2466a8",
                        "name": "Hi-Rez Studios",
                        "__typename": "Organization"
                    },
                    "game": {
                        "id": "491115",
                        "displayName": "Paladins",
                        "boxArtURL": "https://static-cdn.jtvnw.net/ttv-boxart/491115-120x160.jpg",
                        "__typename": "Game"
                    },
                    "status": "ACTIVE",
                    "startAt": "2022-03-15T12:00:00Z",
                    "endAt": "2022-03-22T12:00:00Z",
                    "detailsURL": "https://www.paladins.com/news/twitch-drops-guide-and-faq",
                    "accountLinkURL": "https://my.hirezstudios.com",
                    "self": {
                        "isAccountConnected": false,
                        "__typename": "DropCampaignSelfEdge"
                    },
                    "__typename": "DropCampaign"
                }
            ]
        }
        props.bot.on("pending_drop_campaigns_updated", (campaigns: any[]) => {
            this.setState({
                camps: campaigns
            })
        })
    }

    render() {
        return <Box flexDirection={"column"}>
            <StatusBar status={"Doing something..."}/>
            <DropCampaignsTable campaigns={this.state.camps}/>
        </Box>
    }

}

