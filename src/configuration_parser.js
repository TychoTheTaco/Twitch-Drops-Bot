'use strict';

const fs = require('fs');
const {ArgumentParser} = require('argparse');

const logger = require('./logger');

class ConfigurationParser {

    #options;
    #saveIfNotExist;

    constructor(options, saveIfNotExist = true) {
        this.#options = options;
        this.#saveIfNotExist = saveIfNotExist;
    }

    parse() {

        // Parse arguments
        const parser = new ArgumentParser();
        parser.add_argument('--config', '-c', {default: 'config.json'});
        for (const option of this.#options) {
            if (option.alias) {
                parser.add_argument(option.name, option.alias, option.argparseOptions);
            } else {
                parser.add_argument(option.name, option.argparseOptions);
            }
        }
        const args = parser.parse_args();

        // Load config from file if it exists
        let config = {};
        logger.info('Loading config file: ' + args['config']);
        const configFileExists = fs.existsSync(args['config']);
        if (configFileExists) {
            try {
                config = JSON.parse(fs.readFileSync(args['config'], {encoding: 'utf-8'}));
            } catch (error) {
                logger.error('Failed to read config file!');
                logger.error(error);
                process.exit(1);
            }
        } else {
            logger.warn('Config file not found! Creating a default one...');
        }

        // Override options from config with options from arguments and set defaults
        for (const option of this.#options) {
            const key = option['name'].replace(/^-+/g, '').replace(/-/g, '_');
            if (args[key] === undefined) {
                if (config[key] === undefined) {
                    const defaultValue = option.defaultValue;
                    if (typeof defaultValue === 'function') {
                        config[key] = defaultValue();
                    } else {
                        config[key] = defaultValue;
                    }
                }
            } else {
                if (typeof args[key] === 'string') {
                    config[key] = option.parse(args[key]);
                } else {
                    config[key] = args[key];
                }
            }
        }

        // Save config file if it didn't exist
        if (this.#saveIfNotExist){
            if (!configFileExists) {
                fs.writeFileSync(args['config'], JSON.stringify(config));
                logger.info('Config saved to ' + args['config']);
            }
        }

        return config;
    }

}

module.exports = {
    ConfigurationParser
};
