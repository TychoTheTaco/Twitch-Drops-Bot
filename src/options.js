'use strict';

class Option {

    constructor(name, alias, defaultValue, parseFunction, argparseOptions) {
        this._name = name;
        this._alias = alias;
        this._defaultValue = defaultValue;
        this._parseFunction = parseFunction;
        this._argparseOptions = argparseOptions || {};
    }

    get name() {
        return this._name;
    }

    get alias() {
        return this._alias;
    }

    get defaultValue() {
        return this._defaultValue;
    }

    get argparseOptions() {
        return this._argparseOptions;
    }

    parse(string) {
        if (this._parseFunction) {
            return this._parseFunction(string);
        }
        return string;
    }

}

class StringOption extends Option {

    constructor(name, alias, defaultValue) {
        super(
            name,
            alias,
            defaultValue
        );
    }

}

class BooleanOption extends Option {

    /**
     *
     * @param name
     * @param alias
     * @param defaultValue
     * @param isFlag When 'true' (default), this option acts as a flag; meaning it's presence as a command-line argument sets the value to true.
     * If the argument is not present, then the value is set to false. When 'isFlag' is 'false', then the you must specify a boolean value after
     * the argument when using the command-line.
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
    constructor(name, alias, defaultValue, isFlag = true) {

        // Both 'store_true' and 'store_false' actions automatically create a default of false/true when no argument is
        // passed. This interferes with our custom default argument handling because we expect to get 'undefined' when no
        // argument is passed. Changing the actions to 'store_const' avoids this problem.
        const argparseOptions = {action: 'store_const', const: true};

        super(
            name,
            alias,
            defaultValue,
            (string) => {
                return string === 'true';
            },
            isFlag ? argparseOptions : null
        );
    }

}

class IntegerOption extends Option {

    constructor(name, alias, defaultValue) {
        super(
            name,
            alias,
            defaultValue,
            parseInt,
            {
                type: 'int'
            }
        );
    }

}

class ListOption extends Option {

    constructor(name, alias, defaultValue) {
        super(
            name,
            alias,
            defaultValue,
            (string) => {
                return string.split(',').filter(x => x.length > 0);
            }
        );
    }

}

module.exports = {
    Option, StringOption, BooleanOption, IntegerOption, ListOption
}
