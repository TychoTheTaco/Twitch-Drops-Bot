'use strict';

const axios = require('axios');

async function getDropCampaigns(credentials) {
    const response = await axios.post('https://gql.twitch.tv/gql',
        {
            'operationName': 'ViewerDropsDashboard',
            'extensions': {
                'persistedQuery': {
                    "version": 1,
                    "sha256Hash": "e8b98b52bbd7ccd37d0b671ad0d47be5238caa5bea637d2a65776175b4a23a64"
                }
            }
        },
        {
            headers: {
                'Content-Type': 'text/plain;charset=UTF-8',
                'Client-Id': credentials['client_id'],
                'Authorization': `OAuth ${credentials['oauth_token']}`
            }
        }
    );
    return response['data']['data']['currentUser']['dropCampaigns']
}

async function getDropCampaignDetails(credentials, dropId) {
    const response = await axios.post('https://gql.twitch.tv/gql',
        {
            'operationName': 'DropCampaignDetails',
            'extensions': {
                'persistedQuery': {
                    "version": 1,
                    "sha256Hash": "14b5e8a50777165cfc3971e1d93b4758613fe1c817d5542c398dce70b7a45c05"
                }
            },
            'variables': {
                'dropID': dropId,
                'channelLogin': credentials['channel_login']
            }
        },
        {
            headers: {
                'Content-Type': 'text/plain;charset=UTF-8',
                'Client-Id': credentials['client_id'],
                'Authorization': `OAuth ${credentials['oauth_token']}`
            }
        }
    );
    return response['data']['data']['user']['dropCampaign']
}

async function getDropCampaignsInProgress(credentials) {
    const inventory = await getInventory(credentials);
    const campaigns = inventory['dropCampaignsInProgress'];
    if (campaigns === null){
        return [];
    }
    return campaigns;
}

async function getInventory(credentials) {
    const response = await axios.post('https://gql.twitch.tv/gql',
        {
            'operationName': 'Inventory',
            'extensions': {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "9cdfc5ebf8ee497e49c5b922829d67e5bce039f3c713f0706d234944195d56ad"
                }
            }
        },
        {
            headers: {
                'Content-Type': 'text/plain;charset=UTF-8',
                'Client-Id': credentials['client_id'],
                'Authorization': `OAuth ${credentials['oauth_token']}`
            }
        }
    );
    return response['data']['data']['currentUser']['inventory'];
}

async function getDropEnabledStreams(credentials, game) {
    const response = await axios.post('https://gql.twitch.tv/gql',
        {
            "operationName": "DirectoryPage_Game",
            "variables": {
                "name": game.toLowerCase(),
                "options": {
                    "includeRestricted": [
                        "SUB_ONLY_LIVE"
                    ],
                    "sort": "VIEWER_COUNT",
                    "recommendationsContext": {
                        "platform": "web"
                    },
                    "requestID": "JIRA-VXP-2397", // TODO: what is this for???
                    "tags": [
                        "c2542d6d-cd10-4532-919b-3d19f30a768b"  // "Drops enabled"
                    ]
                },
                "sortTypeIsRecency": false,
                "limit": 30
            },
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "d5c5df7ab9ae65c3ea0f225738c08a36a4a76e4c6c31db7f8c4b8dc064227f9e"
                }
            }
        },
        {
            headers: {
                'Content-Type': 'text/plain;charset=UTF-8',
                'Client-Id': credentials['client_id'],
                'Authorization': `OAuth ${credentials['oauth_token']}`
            }
        }
    );
    const streams = response['data']['data']['game']['streams'];
    if (streams === null){
        return [];
    }
    const streamUrls = [];
    for (const stream of streams['edges']){
        streamUrls.push('https://www.twitch.tv/' + stream['node']['broadcaster']['login'])
    }
    return streamUrls;
}

async function claimDropReward(credentials, dropId) {
    const response = await axios.post('https://gql.twitch.tv/gql',
        {
            "operationName": "DropsPage_ClaimDropRewards",
            "variables": {
                "input": {
                    "dropInstanceID": dropId
                }
            },
            "extensions": {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "2f884fa187b8fadb2a49db0adc033e636f7b6aaee6e76de1e2bba9a7baf0daf6"
                }
            }
        },
        {
            headers: {
                'Content-Type': 'text/plain;charset=UTF-8',
                'Client-Id': credentials['client_id'],
                'Authorization': `OAuth ${credentials['oauth_token']}`
            }
        }
    );
    if ('errors' in response.data){
        throw new Error(JSON.stringify(response.data['errors']));
    }
}

module.exports = {
    getDropCampaigns, getDropCampaignDetails, getDropCampaignsInProgress, getDropEnabledStreams, getInventory, claimDropReward
}