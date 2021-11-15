'use strict';
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Option_name, _Option_defaultValue, _Option_alias, _Option_argparseOptions;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StringListOption = exports.IntegerOption = exports.BooleanOption = exports.StringOption = exports.Option = void 0;
class Option {
    constructor(name, optional) {
        var _a;
        _Option_name.set(this, void 0);
        _Option_defaultValue.set(this, void 0);
        _Option_alias.set(this, void 0);
        _Option_argparseOptions.set(this, void 0);
        __classPrivateFieldSet(this, _Option_name, name, "f");
        __classPrivateFieldSet(this, _Option_defaultValue, optional === null || optional === void 0 ? void 0 : optional.defaultValue, "f");
        __classPrivateFieldSet(this, _Option_alias, optional === null || optional === void 0 ? void 0 : optional.alias, "f");
        __classPrivateFieldSet(this, _Option_argparseOptions, (_a = optional === null || optional === void 0 ? void 0 : optional.argparseOptions) !== null && _a !== void 0 ? _a : {}, "f");
    }
    get name() {
        return __classPrivateFieldGet(this, _Option_name, "f");
    }
    get alias() {
        return __classPrivateFieldGet(this, _Option_alias, "f");
    }
    get defaultValue() {
        return __classPrivateFieldGet(this, _Option_defaultValue, "f");
    }
    get argparseOptions() {
        return __classPrivateFieldGet(this, _Option_argparseOptions, "f");
    }
}
exports.Option = Option;
_Option_name = new WeakMap(), _Option_defaultValue = new WeakMap(), _Option_alias = new WeakMap(), _Option_argparseOptions = new WeakMap();
class StringOption extends Option {
    constructor(name, optional) {
        super(name, optional);
    }
    parse(string) {
        return string;
    }
}
exports.StringOption = StringOption;
class BooleanOption extends Option {
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
    constructor(name, isFlag = true, optional) {
        var _a;
        // Both 'store_true' and 'store_false' actions automatically create a default of false/true when no argument is
        // passed. This interferes with our custom default argument handling because we expect to get 'undefined' when no
        // argument is passed. Changing the actions to 'store_const' avoids this problem.
        const argparseOptions = { action: 'store_const', const: true };
        optional !== null && optional !== void 0 ? optional : (optional = {});
        (_a = optional.defaultValue) !== null && _a !== void 0 ? _a : (optional.defaultValue = false);
        optional.argparseOptions = isFlag ? argparseOptions : undefined;
        super(name, optional);
    }
    parse(string) {
        switch (string) {
            case 'true':
                return true;
            case 'false':
                return false;
        }
        throw new Error('Invalid boolean string: ' + string);
    }
}
exports.BooleanOption = BooleanOption;
class IntegerOption extends Option {
    constructor(name, optional) {
        var _a;
        if (optional) {
            (_a = optional.defaultValue) !== null && _a !== void 0 ? _a : (optional.defaultValue = 0);
            if (optional.argparseOptions) {
                optional.argparseOptions['type'] = 'int';
            }
        }
        super(name, optional);
    }
    parse(string) {
        return parseInt(string);
    }
}
exports.IntegerOption = IntegerOption;
class StringListOption extends Option {
    constructor(name, optional) {
        var _a;
        if (optional) {
            (_a = optional.defaultValue) !== null && _a !== void 0 ? _a : (optional.defaultValue = []);
        }
        super(name, optional);
    }
    parse(string) {
        return string.split(',').filter(x => x.length > 0);
    }
}
exports.StringListOption = StringListOption;
