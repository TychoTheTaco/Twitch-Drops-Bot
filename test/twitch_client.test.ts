import {Client} from "../src/twitch.js";

test("getGameIdFromName", async () => {
    const client = new Client();
    expect(await client.getGameIdFromName("rocket league")).toStrictEqual("30921");
    expect(await client.getGameIdFromName("Rocket LeAgUe")).toStrictEqual("30921");
    expect(await client.getGameIdFromName("rocket")).toStrictEqual(undefined);
    expect(await client.getGameIdFromName("league")).toStrictEqual("21779");
    expect(await client.getGameIdFromName("PUBG: BATTLEGROUNDS")).toStrictEqual("493057");
    expect(await client.getGameIdFromName("pubg")).toStrictEqual("493057");
    expect(await client.getGameIdFromName("battlegrounds")).toStrictEqual("493057");
    expect(await client.getGameIdFromName("this cannot be a real game")).toStrictEqual(undefined);
});

test("getActiveStreams", async () => {
    const client = new Client();
    const streams = await client.getActiveStreams("rocket league");
    expect(streams.length).toBeGreaterThan(0);
    expect(streams[0].game.id).toStrictEqual("30921");
});

test("getStream", async () => {
    const client = new Client();
    const stream = await client.getStream("tychothetaco");
    expect(stream).toBeNull();

    // Find an online stream
    const streams = await client.getActiveStreams("rocket league");
    expect(streams.length).toBeGreaterThan(0);
    const stream2 = await client.getStream(streams[0].broadcaster.login);
    expect(stream2).not.toBeNull();
    // @ts-ignore
    expect(stream2.id).toStrictEqual(streams[0].id);
});

test("getStreamMetadata", async () => {
    const client = new Client();
    const user = await client.getStreamMetadata("tychothetaco");
    expect(user.id).toStrictEqual("135787187");
});

test("getStreamTags", async () => {
    const client = new Client();
    const user = await client.getStreamTags("tychothetaco");
    expect(user).not.toBeNull();
    // @ts-ignore
    expect(user.id).toStrictEqual("135787187");
});
