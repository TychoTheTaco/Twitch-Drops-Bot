'use strict';

export abstract class Option<T> {

    readonly #name: string;
    readonly #defaultValue?: T | (() => T);
    readonly #alias?: string;
    readonly #argparseOptions?: { [key: string]: any };

    protected constructor(name: string, optional?: { defaultValue?: T | (() => T), alias?: string, argparseOptions?: { [key: string]: any } }) {
        this.#name = name;
        this.#defaultValue = optional?.defaultValue;
        this.#alias = optional?.alias;
        this.#argparseOptions = optional?.argparseOptions ?? {};
    }

    get name() {
        return this.#name;
    }

    get alias() {
        return this.#alias;
    }

    get defaultValue() {
        return this.#defaultValue;
    }

    get argparseOptions() {
        return this.#argparseOptions;
    }

    abstract parse(string: string): T;

}

export class StringOption extends Option<string> {

    constructor(name: string, optional?: { defaultValue?: (() => string) | string; alias?: string; argparseOptions?: { [key: string]: any } }) {
        super(name, optional);
    }

    parse(string: string): string {
        return string;
    }

}

export class BooleanOption extends Option<boolean> {

    /**
     *
     * @param name
     * @param isFlag When 'true' (default), this option acts as a flag; meaning it's presence as a command-line argument sets the value to true.
     * If the argument is not present, then the value is set to false. When 'isFlag' is 'false', then the you must specify a boolean value after
     * the argument when using the command-line.
     * @param optional
     * Example:
     * isFlag = true
     *      Args: --something
     *      Result: something = true
     *      Args: <empty>
     *      Result: something = false
     *      Args: --something true
     *      Result: syntax error
     * isFlag = false
     *      Args: --something
     *      Result: syntax error
     *      Args: <empty>
     *      Result: something = defaultValue
     *      Args: --something true
     *      Result: something = true
     *      Args: --something false
     *      Result: something = false
     */
    constructor(name: string, isFlag: boolean = true, optional?: { defaultValue?: (() => boolean) | boolean; alias?: string; argparseOptions?: { [key: string]: any } }) {
        // Both 'store_true' and 'store_false' actions automatically create a default of false/true when no argument is
        // passed. This interferes with our custom default argument handling because we expect to get 'undefined' when no
        // argument is passed. Changing the actions to 'store_const' avoids this problem.
        const argparseOptions = {action: 'store_const', const: true};

        optional ??= {};

        optional.defaultValue ??= false;
        optional.argparseOptions = isFlag ? argparseOptions : undefined;

        super(name, optional);
    }

    parse(string: string): boolean {
        switch (string) {
            case 'true':
                return true;
            case 'false':
                return false;
        }
        throw new Error('Invalid boolean string: ' + string);
    }

}

export class IntegerOption extends Option<number> {

    constructor(name: string, optional?: { defaultValue?: (() => number) | number; alias?: string; argparseOptions?: { [key: string]: any } }) {
        optional ??= {};
        optional.defaultValue ??= 0;
        if (optional.argparseOptions) {
            optional.argparseOptions['type'] = 'int';
        }
        super(name, optional);
    }

    parse(string: string): number {
        return parseInt(string);
    }

}

export class StringListOption extends Option<string[]> {

    constructor(name: string, optional?: { defaultValue?: (() => string[]) | string[]; alias?: string; argparseOptions?: { [key: string]: any } }) {
        optional ??= {};
        optional.defaultValue ??= [];
        super(name, optional);
    }

    parse(string: string): string[] {
        const items = [];
        let item = "";
        let isEscaped = false;
        for (const c of string) {
            if (!isEscaped) {
                if (c === '\\') {
                    isEscaped = true;
                    continue;
                }
                if (c === ',') {
                    items.push(item);
                    item = "";
                    continue;
                }
            }
            item += c;
            isEscaped = false;
        }
        if (item.length > 0) {
            items.push(item);
        }
        return items.filter((item) => {return item.length > 0});
    }

}

export class JsonOption<T> extends Option<T> {

    constructor(name: string, optional?: { defaultValue?: (() => T) | T; }) {
        super(name, optional);
    }

    parse(string: string): T {
        return JSON.parse(string) as T;
    }

}
