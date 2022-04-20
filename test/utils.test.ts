import {compareVersionString} from "../src/utils.js";

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
