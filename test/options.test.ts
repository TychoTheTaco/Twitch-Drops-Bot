import {StringListOption} from "../src/options";

test("StringListOption", () => {

    const option = new StringListOption("test");

    const test = (input: string, expected: string[]) => {
        expect(option.parse(input)).toStrictEqual(expected);
    }

    test("", []);
    test("a", ["a"]);
    test("a,b,c", ["a", "b", "c"]);
    test("a  ,  b , c", ["a  ", "  b ", " c"]);
    test("a,b,c\\,d,e", ["a", "b", "c,d", "e"]);
    test("a\\,b,c\\,d,e", ["a,b", "c,d", "e"]);
    test("a\\,b,c\\,d\\,e", ["a,b", "c,d,e"]);
    test("a\\\\b", ["a\\b"]);
    test("a,,b", ["a", "b"]);
    test("a,b,", ["a", "b"]);

});
