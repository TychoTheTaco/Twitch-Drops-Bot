import {compareVersionString, parseIntervalString} from "../src/utils.js";

test("compareVersionString", () => {

    const a = "1.0.0";
    const b = "1.0.0";

    expect(compareVersionString("", "")).toStrictEqual(0);
    expect(compareVersionString(a, "")).toStrictEqual(1);
    expect(compareVersionString("", b)).toStrictEqual(-1);
    expect(compareVersionString(a, b)).toStrictEqual(0);

    const c = "v1.0.0";

    expect(compareVersionString(a, c)).toStrictEqual(0);
    expect(compareVersionString(c, b)).toStrictEqual(0);

    const d = "v1.0.1";
    const e = "v1.1.0";
    const f = "v2.0.0";

    expect(compareVersionString(a, d)).toStrictEqual(-1);
    expect(compareVersionString(a, e)).toStrictEqual(-1);
    expect(compareVersionString(a, f)).toStrictEqual(-1);

    expect(compareVersionString(d, a)).toStrictEqual(1);
    expect(compareVersionString(e, a)).toStrictEqual(1);
    expect(compareVersionString(f, a)).toStrictEqual(1);

    expect(compareVersionString(d, e)).toStrictEqual(-1);
    expect(compareVersionString(e, f)).toStrictEqual(-1);
    expect(compareVersionString(f, d)).toStrictEqual(1);

    const g = "2.0.0.1";

    expect(compareVersionString(f, g)).toStrictEqual(-1);
});

test("parseIntervalString", () => {
    // Interval minutes
    expect(parseIntervalString("every 1m", 15)).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(parseIntervalString("every 7m", 15)).toStrictEqual([7, 14]);
    expect(parseIntervalString("every 15m", 15)).toStrictEqual([15]);
    expect(parseIntervalString("every 30m", 15)).toStrictEqual([]);

    // Interval percentage
    expect(parseIntervalString("every 5%", 30)).toStrictEqual([2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18, 20, 21, 23, 24, 26, 27, 29, 30]);
    expect(parseIntervalString("every 10%", 30)).toStrictEqual([3, 6, 9, 12, 15, 18, 21, 24, 27, 30]);
    expect(parseIntervalString("every 200%", 30)).toStrictEqual([]);

    expect(() => {
        parseIntervalString("every 30", 15);
    }).toThrowError();

    // Individual minutes
    expect(parseIntervalString("1m 10m 25m", 30)).toStrictEqual([1, 10, 25]);
    expect(parseIntervalString("1m 10m 25m", 15)).toStrictEqual([1, 10]);

    // Individual percentages
    expect(parseIntervalString("1% 10% 25%", 240)).toStrictEqual([3, 24, 60]);
    expect(parseIntervalString("1% 10% 25%", 15)).toStrictEqual([1, 2, 4]);
    expect(parseIntervalString("100% 200% 345%", 15)).toStrictEqual([15]);

    // Items should be auto sorted
    expect(parseIntervalString("25m 1m 10m", 30)).toStrictEqual([1, 10, 25]);
    expect(parseIntervalString("25% 1% 10%", 240)).toStrictEqual([3, 24, 60]);

    // Mixed
    expect(parseIntervalString("25% 100m 90%", 240)).toStrictEqual([60, 100, 216]);
    expect(parseIntervalString("80% 100m 20% 10m", 240)).toStrictEqual([10, 48, 100, 192]);
});
