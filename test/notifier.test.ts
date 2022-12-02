import {Event_CommunityPointsEarned_ClaimReason, EventMapType, Notifier} from "../src/notifiers/notifier.js";
import {
    CommunityPointsUserV1_PointsEarned,
    CommunityPointsUserV1_PointsEarned_ReasonCode
} from "../src/web_socket_listener.js";
import {DropCampaign, TimeBasedDrop} from "../src/twitch.js";
import _ from "lodash";
import {loadJsonData} from "./utils.js";

class TestNotifier extends Notifier {

    protected async notifyOnCommunityPointsEarned(data: CommunityPointsUserV1_PointsEarned, channelLogin: string): Promise<void> {
        return Promise.resolve(undefined);
    }

    protected async notifyOnDropClaimed(drop: TimeBasedDrop, campaign: DropCampaign): Promise<void> {
        return Promise.resolve(undefined);
    }

    protected async notifyOnDropProgress(drop: TimeBasedDrop, campaign: DropCampaign): Promise<void> {
        return Promise.resolve(undefined);
    }

    protected async notifyOnDropReadyToClaim(drop: TimeBasedDrop, campaign: DropCampaign): Promise<void> {
        return Promise.resolve(undefined);
    }

    protected async notifyOnNewDropCampaign(campaign: DropCampaign): Promise<void> {
        return Promise.resolve(undefined);
    }

}

function getCommunityPointsEarnedData(options?: {reasonCode: CommunityPointsUserV1_PointsEarned_ReasonCode}): CommunityPointsUserV1_PointsEarned {
    const getRandomReasonCode = (): CommunityPointsUserV1_PointsEarned_ReasonCode => {
        const reasonCodes: CommunityPointsUserV1_PointsEarned_ReasonCode[] = ["WATCH", "CLAIM", "WATCH_STREAK", "RAID"];
        return reasonCodes[_.random(reasonCodes.length - 1)];
    };
    return {
        timestamp: new Date().toString(),
        channel_id: "channel_id",
        point_gain: {
            user_id: "user_id",
            channel_id: "channel_id",
            total_points: 123,
            baseline_points: 456,
            reason_code: options?.reasonCode ?? getRandomReasonCode(),
            multipliers: []
        },
        balance: {
            user_id: "user_id",
            channel_id: "channel_id",
            balance: 789
        }
    };
}

describe("notifyOnCommunityPointsEarned", () => {

    // Check that reason codes get filtered correctly
    test("filterReasons", () => {
        const reasons: Event_CommunityPointsEarned_ClaimReason[] = ["watch", "claim", "watch_streak", "raid"];
        const reasonCodes: CommunityPointsUserV1_PointsEarned_ReasonCode[] = ["WATCH", "CLAIM", "WATCH_STREAK", "RAID"];
        for (let i = 0; i < reasons.length; ++i) {
            const events: EventMapType = {
                "community_points_earned": {
                    reasons: [reasons[i]]
                }
            };
            const notifier = new TestNotifier(events);
            const spy = jest.spyOn<TestNotifier, any>(notifier, "notifyOnCommunityPointsEarned");

            const data1 = getCommunityPointsEarnedData({reasonCode: reasonCodes[i]});
            notifier.onCommunityPointsEarned(data1, "channel_login_1");

            const data2 = getCommunityPointsEarnedData({reasonCode: reasonCodes[(i + 1) % reasonCodes.length]});
            notifier.onCommunityPointsEarned(data2, "channel_login_2");

            expect(spy).toBeCalledTimes(1);
            expect(spy).toBeCalledWith(data1, "channel_login_1");
        }
    });

});

describe("notifyOnDropClaimed", () => {

    let campaigns: DropCampaign[] = [];
    let drops: TimeBasedDrop[] = [];

    beforeAll(() => {
        // Load some sample drops and campaigns
        campaigns = loadJsonData("campaigns-1");
        drops = campaigns.map((campaign: DropCampaign) => {
            return campaign.timeBasedDrops[0];
        });
    });

    // Check that game IDs are filtered correctly
    test("filterSomeGameIds", () => {
        const events: EventMapType = {
            "drop_claimed": {
                gameIds: ["123403711", "27546", "1922780513"]
            }
        };
        const notifier = new TestNotifier(events);
        const spy = jest.spyOn<TestNotifier, any>(notifier, "notifyOnDropClaimed");
        for (let i = 0; i < 5; ++i) {
            notifier.onDropClaimed(drops[i], campaigns[i]);
        }
        expect(spy).toBeCalledTimes(4);
    });

    // Check that game IDs are filtered correctly
    test("filterAllGameIds", () => {
        const events: EventMapType = {
            "drop_claimed": {
                gameIds: []
            }
        };
        const notifier = new TestNotifier(events);
        const spy = jest.spyOn<TestNotifier, any>(notifier, "notifyOnDropClaimed");
        for (let i = 0; i < 5; ++i) {
            notifier.onDropClaimed(drops[i], campaigns[i]);
        }
        expect(spy).toBeCalledTimes(5);
    });

});

describe("notifyOnDropProgress", () => {

    let campaigns: DropCampaign[] = [];
    let drops: TimeBasedDrop[] = [];

    beforeAll(() => {
        // Load some sample drops and campaigns
        campaigns = loadJsonData("campaigns-1");
        drops = campaigns.map((campaign: DropCampaign) => {
            return campaign.timeBasedDrops[0];
        });
    });

    // Check interval
    test("filterInterval", () => {
        const events: EventMapType = {
            "drop_progress": {
                interval: "0m 30m 60m"
            }
        };
        const notifier = new TestNotifier(events);
        const spy = jest.spyOn<TestNotifier, any>(notifier, "notifyOnDropProgress");
        for (let i = 0; i < 5; ++i) {
            drops[i].self = {
                dropInstanceID: "123",
                currentMinutesWatched: 0,
                isClaimed: false
            };
            drops[i].requiredMinutesWatched = 120;
            notifier.onDropProgress(drops[i], campaigns[i]);
            drops[i].self.currentMinutesWatched = 15;
            notifier.onDropProgress(drops[i], campaigns[i]);
            drops[i].self.currentMinutesWatched = 45;
            notifier.onDropProgress(drops[i], campaigns[i]);
        }
        expect(spy).toBeCalledTimes(5);
    });

});

describe("notifyOnDropReadyToClaim", () => {

    let campaigns: DropCampaign[] = [];
    let drops: TimeBasedDrop[] = [];

    beforeAll(() => {
        // Load some sample drops and campaigns
        campaigns = loadJsonData("campaigns-1");
        drops = campaigns.map((campaign: DropCampaign) => {
            return campaign.timeBasedDrops[0];
        });
    });

    test("", () => {
        const events: EventMapType = {
            "drop_ready_to_claim": {}
        };
        const notifier = new TestNotifier(events);
        const spy = jest.spyOn<TestNotifier, any>(notifier, "notifyOnDropReadyToClaim");
        for (let i = 0; i < 5; ++i) {
            notifier.onDropReadyToClaim(drops[i], campaigns[i]);
        }
        expect(spy).toBeCalledTimes(5);
    });

});

describe("notifyOnNewDropCampaign", () => {

    let campaigns: DropCampaign[] = [];

    beforeAll(() => {
        // Load some sample campaigns
        campaigns = loadJsonData("campaigns-1");
    });

    // Check that game IDs are filtered correctly
    test("filterSomeGameIds", () => {
        const events: EventMapType = {
            "new_drops_campaign": {
                gameIds: ["123403711", "27546", "1922780513"]
            }
        };
        const notifier = new TestNotifier(events);
        const spy = jest.spyOn<TestNotifier, any>(notifier, "notifyOnNewDropCampaign");
        for (let i = 0; i < 5; ++i) {
            notifier.onNewDropCampaign(campaigns[i]);
        }
        expect(spy).toBeCalledTimes(4);
    });

    // Check that game IDs are filtered correctly
    test("filterAllGameIds", () => {
        const events: EventMapType = {
            "new_drops_campaign": {
                gameIds: []
            }
        };
        const notifier = new TestNotifier(events);
        const spy = jest.spyOn<TestNotifier, any>(notifier, "notifyOnNewDropCampaign");
        for (let i = 0; i < 5; ++i) {
            notifier.onNewDropCampaign(campaigns[i]);
        }
        expect(spy).toBeCalledTimes(5);
    });

});
