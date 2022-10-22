import fs from "node:fs";

import {ArgumentParser} from "argparse";
import _ from "lodash";

import logger from "./logger.js";
import {JsonOption, Option, StringListOption} from "./options.js";

export class ConfigurationParser {

    readonly #options;
    readonly #saveIfNotExist;

    constructor(options: Option<any>[], saveIfNotExist: boolean = true) {
        this.#options = options;
        this.#saveIfNotExist = saveIfNotExist;
    }

    parse(): object {

        // todo: add a validation/transform step
        // todo: parse json like: setting.sub_setting=x

        // Parse arguments
        const parser = new ArgumentParser();
        parser.add_argument("--config", "-c", {default: "config.json"});
        for (const option of this.#options) {
            if (option.alias) {
                parser.add_argument(option.name, option.alias, option.argparseOptions);
            } else {
                parser.add_argument(option.name, option.argparseOptions);
            }
        }
        const args = parser.parse_args();

        const getJsonKey = (option: Option<any>): string => {
            return option.name.replace(/^-+/g, "").replace(/-/g, "_");
        };

        const getOptionByName = (name: string): Option<any> | null => {
            for (const option of this.#options) {
                if (getJsonKey(option) === name) {
                    return option;
                }
            }
            return null;
        };

        // Load config from file if it exists
        let config: any = {};
        logger.info("Loading config file: " + args["config"]);
        const configFileExists = fs.existsSync(args["config"]);
        if (configFileExists) {
            try {
                config = JSON.parse(fs.readFileSync(args["config"], {encoding: "utf-8"}));

                // Check for unknown options
                for (const key of Object.keys(config)) {
                    if (getOptionByName(key) === null) {
                        logger.warn("Unknown option: " + key);
                    }
                }

                for (const option of this.#options) {
                    // Verify that this actually contains only strings
                    if (option instanceof StringListOption) {
                        const key = getJsonKey(option);
                        const value = config[key];
                        if (value === undefined) {
                            continue;
                        }
                        for (const item of value) {
                            if (typeof item !== "string") {
                                throw new Error(`Error parsing option "${key}": Item is not a string: ${item}`);
                            }
                        }
                    }
                }
            } catch (error) {
                logger.error("Failed to read config file!");
                logger.error(error);
                process.exit(1);
            }
        } else {
            logger.warn("Config file not found! Creating a default one...");
        }

        // Override options from config with options from arguments and set defaults
        for (const option of this.#options) {
            const key = getJsonKey(option);
            if (args[key] === undefined) {
                if (option instanceof JsonOption) {
                    const defaultValue = option.defaultValue;
                    if (typeof defaultValue === "function") {
                        _.merge(config[key], defaultValue());
                    } else {
                        _.merge(config[key], defaultValue);
                    }
                }
                if (config[key] === undefined) {
                    const defaultValue = option.defaultValue;
                    if (typeof defaultValue === "function") {
                        config[key] = defaultValue();
                    } else {
                        config[key] = defaultValue;
                    }
                }
            } else {
                if (typeof args[key] === "string") {
                    config[key] = option.parse(args[key]);
                } else {
                    config[key] = args[key];
                }
            }
        }

        // Save config file if it didn't exist
        if (this.#saveIfNotExist) {
            if (!configFileExists) {
                fs.writeFileSync(args["config"], JSON.stringify(config, null, 4));
                logger.info("Config saved to " + args["config"]);
            }
        }

        return config;
    }

}
