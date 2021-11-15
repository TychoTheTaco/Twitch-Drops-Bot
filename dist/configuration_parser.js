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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _ConfigurationParser_options, _ConfigurationParser_saveIfNotExist;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigurationParser = void 0;
const fs_1 = __importDefault(require("fs"));
const { ArgumentParser } = require('argparse');
const logger_1 = __importDefault(require("./logger"));
class ConfigurationParser {
    constructor(options, saveIfNotExist = true) {
        _ConfigurationParser_options.set(this, void 0);
        _ConfigurationParser_saveIfNotExist.set(this, void 0);
        __classPrivateFieldSet(this, _ConfigurationParser_options, options, "f");
        __classPrivateFieldSet(this, _ConfigurationParser_saveIfNotExist, saveIfNotExist, "f");
    }
    parse() {
        // Parse arguments
        const parser = new ArgumentParser();
        parser.add_argument('--config', '-c', { default: 'config.json' });
        for (const option of __classPrivateFieldGet(this, _ConfigurationParser_options, "f")) {
            if (option.alias) {
                parser.add_argument(option.name, option.alias, option.argparseOptions);
            }
            else {
                parser.add_argument(option.name, option.argparseOptions);
            }
        }
        const args = parser.parse_args();
        // Load config from file if it exists
        let config = {};
        logger_1.default.info('Loading config file: ' + args['config']);
        const configFileExists = fs_1.default.existsSync(args['config']);
        if (configFileExists) {
            try {
                config = JSON.parse(fs_1.default.readFileSync(args['config'], { encoding: 'utf-8' }));
            }
            catch (error) {
                logger_1.default.error('Failed to read config file!');
                logger_1.default.error(error);
                process.exit(1);
            }
        }
        else {
            logger_1.default.warn('Config file not found! Creating a default one...');
        }
        // Override options from config with options from arguments and set defaults
        for (const option of __classPrivateFieldGet(this, _ConfigurationParser_options, "f")) {
            const key = option['name'].replace(/^-+/g, '').replace(/-/g, '_');
            if (args[key] === undefined) {
                if (config[key] === undefined) {
                    const defaultValue = option.defaultValue;
                    if (typeof defaultValue === 'function') {
                        config[key] = defaultValue();
                    }
                    else {
                        config[key] = defaultValue;
                    }
                }
            }
            else {
                if (typeof args[key] === 'string') {
                    config[key] = option.parse(args[key]);
                }
                else {
                    config[key] = args[key];
                }
            }
        }
        // Save config file if it didn't exist
        if (__classPrivateFieldGet(this, _ConfigurationParser_saveIfNotExist, "f")) {
            if (!configFileExists) {
                fs_1.default.writeFileSync(args['config'], JSON.stringify(config));
                logger_1.default.info('Config saved to ' + args['config']);
            }
        }
        return config;
    }
}
exports.ConfigurationParser = ConfigurationParser;
_ConfigurationParser_options = new WeakMap(), _ConfigurationParser_saveIfNotExist = new WeakMap();
