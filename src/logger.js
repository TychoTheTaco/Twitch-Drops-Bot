'use strict';

// Set up logger
const {transports, createLogger, format} = require('winston');
const logger = createLogger({
    format: format.combine(
        format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
        {
            transform(info, opts) {
                const message = info.message;
                if (message instanceof Error) {
                    info.message = message.stack.replace(/^Error/g, message.constructor.name);
                }
                return info;
            }
        },
        format.printf(info => {
            let result = `[${info.timestamp}] [${info.level}] ${info.message}`;
            if (info.stack) {
                result += ` ${info.stack}`;
            }
            return result;
        })
    ),
    transports: [
        new transports.Console()
    ]
});

module.exports = logger;
