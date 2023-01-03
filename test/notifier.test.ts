import {
    Event_CommunityPointsEarned_ClaimReason,
    EventMapType,
    Notifier,
    RateLimitedNotifier
} from "../src/notifiers/notifier.js";
import {
    CommunityPointsUserV1_PointsEarned,
    CommunityPointsUserV1_PointsEarned_ReasonCode
} from "../src/web_socket_listener.js";
import {DropCampaign, TimeBasedDrop} from "../src/twitch.js";
import _ from "lodash";
import {loadJsonData} from "./utils.js";
import {AxiosError, AxiosResponse} from "axios";

class TestNotifier extends Notifier {

    protected async notifyOnCommunityPointsEarned(data: CommunityPointsUserV1_PointsEarned, channelLogin: string): Promise<void> {
        return;
    }

    protected async notifyOnDropClaimed(drop: TimeBasedDrop, campaign: DropCampaign): Promise<void> {
        return;
    }

    protected async notifyOnDropProgress(drop: TimeBasedDrop, campaign: DropCampaign): Promise<void> {
        return;
    }

    protected async notifyOnDropReadyToClaim(drop: TimeBasedDrop, campaign: DropCampaign): Promise<void> {
        return;
    }

    protected async notifyOnNewDropCampaign(campaign: DropCampaign): Promise<void> {
        return;
    }

}

function getCommunityPointsEarnedData(options?: { reasonCode: CommunityPointsUserV1_PointsEarned_ReasonCode }): CommunityPointsUserV1_PointsEarned {
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
    test("filterReasons", async () => {
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
            await notifier.onCommunityPointsEarned(data1, "channel_login_1");

            const data2 = getCommunityPointsEarnedData({reasonCode: reasonCodes[(i + 1) % reasonCodes.length]});
            await notifier.onCommunityPointsEarned(data2, "channel_login_2");

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
    test("filterSomeGameIds", async () => {
        const events: EventMapType = {
            "drop_claimed": {
                gameIds: ["123403711", "27546", "1922780513"]
            }
        };
        const notifier = new TestNotifier(events);
        const spy = jest.spyOn<TestNotifier, any>(notifier, "notifyOnDropClaimed");
        for (let i = 0; i < 5; ++i) {
            await notifier.onDropClaimed(drops[i], campaigns[i]);
        }
        expect(spy).toBeCalledTimes(4);
    });

    // Check that game IDs are filtered correctly
    test("filterAllGameIds", async () => {
        const events: EventMapType = {
            "drop_claimed": {
                gameIds: []
            }
        };
        const notifier = new TestNotifier(events);
        const spy = jest.spyOn<TestNotifier, any>(notifier, "notifyOnDropClaimed");
        for (let i = 0; i < 5; ++i) {
            await notifier.onDropClaimed(drops[i], campaigns[i]);
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
    test("filterInterval", async () => {
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
            await notifier.onDropProgress(drops[i], campaigns[i]);
            drops[i].self.currentMinutesWatched = 15;
            await notifier.onDropProgress(drops[i], campaigns[i]);
            drops[i].self.currentMinutesWatched = 45;
            await notifier.onDropProgress(drops[i], campaigns[i]);
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

    test("", async () => {
        const events: EventMapType = {
            "drop_ready_to_claim": {}
        };
        const notifier = new TestNotifier(events);
        const spy = jest.spyOn<TestNotifier, any>(notifier, "notifyOnDropReadyToClaim");
        for (let i = 0; i < 5; ++i) {
            await notifier.onDropReadyToClaim(drops[i], campaigns[i]);
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
    test("filterSomeGameIds", async () => {
        const events: EventMapType = {
            "new_drops_campaign": {
                gameIds: ["123403711", "27546", "1922780513"]
            }
        };
        const notifier = new TestNotifier(events);
        const spy = jest.spyOn<TestNotifier, any>(notifier, "notifyOnNewDropCampaign");
        for (let i = 0; i < 5; ++i) {
            await notifier.onNewDropCampaign(campaigns[i]);
        }
        expect(spy).toBeCalledTimes(4);
    });

    // Check that game IDs are filtered correctly
    test("filterAllGameIds", async () => {
        const events: EventMapType = {
            "new_drops_campaign": {
                gameIds: []
            }
        };
        const notifier = new TestNotifier(events);
        const spy = jest.spyOn<TestNotifier, any>(notifier, "notifyOnNewDropCampaign");
        for (let i = 0; i < 5; ++i) {
            await notifier.onNewDropCampaign(campaigns[i]);
        }
        expect(spy).toBeCalledTimes(5);
    });

});

class TestRateLimitedNotifier extends RateLimitedNotifier<string> {

    protected getRetryAfterSeconds(response: AxiosResponse): number {
        return parseInt(response.data);
    }

    protected async notifyOnCommunityPointsEarned(data: CommunityPointsUserV1_PointsEarned, channelLogin: string): Promise<void> {
        await this.post("notifyOnCommunityPointsEarned");
        return;
    }

    protected async notifyOnDropClaimed(drop: TimeBasedDrop, campaign: DropCampaign): Promise<void> {
        await this.post("notifyOnDropClaimed");
        return;
    }

    protected async notifyOnDropProgress(drop: TimeBasedDrop, campaign: DropCampaign): Promise<void> {
        await this.post("notifyOnDropProgress");
        return;
    }

    protected async notifyOnDropReadyToClaim(drop: TimeBasedDrop, campaign: DropCampaign): Promise<void> {
        await this.post("notifyOnDropReadyToClaim");
        return;
    }

    protected async notifyOnNewDropCampaign(campaign: DropCampaign): Promise<void> {
        await this.post("notifyOnNewDropCampaign");
        return;
    }

    protected async sendNotification(data: string): Promise<AxiosResponse> {
        // @ts-ignore
        return {
            data: "data",
            status: 200,
            statusText: "OK",
            headers: {},
        };
    }

}

describe("RateLimitedNotifier", () => {

    test("rateLimit", async () => {
        const events: EventMapType = {
            "community_points_earned": {
                reasons: []
            }
        };
        const notifier = new TestRateLimitedNotifier(events);

        let sentRequests: Date[] = [];
        // 5 requests per 10 seconds
        const MAX_REQUESTS_PER_INTERVAL = 5;
        const REQUEST_INTERVAL_SECONDS = 10;
        const mockNotifierSendNotification = jest.spyOn<TestRateLimitedNotifier, any>(notifier, "sendNotification").mockImplementation(() => {
            // Remove old requests
            sentRequests = sentRequests.filter((value: Date)  => {
                return new Date().getTime() - value.getTime() < REQUEST_INTERVAL_SECONDS * 1000;
            });
            if (sentRequests.length >= MAX_REQUESTS_PER_INTERVAL) {
                throw new AxiosError("mocked rate limit error", undefined, undefined, undefined, {
                    data: (REQUEST_INTERVAL_SECONDS - (new Date().getTime() - sentRequests[0].getTime()) / 1000 + 1).toString(),
                    status: 429,
                    statusText: "RATE LIMIT",
                    headers: {},
                    // @ts-ignore
                    config: {}
                });
            }
            sentRequests.push(new Date());
        });

        // "Send" 10 notifications. First 5 will be OK, then 6-10 will get rate limited for 3 seconds
        for (let i = 0; i < 10; ++i) {
            await notifier.onCommunityPointsEarned(getCommunityPointsEarnedData(), "channel_login");
        }

        // 5 are successful, 6th will hit rate limit
        expect(mockNotifierSendNotification).toBeCalledTimes(6);

        await new Promise(res => setTimeout(res, 11000));

        // 5 more successful calls after rate limit expires
        expect(mockNotifierSendNotification).toBeCalledTimes(11);

    }, 15 * 1000);

});
