'use strict';

// Set up logger
import {transports, createLogger, format} from 'winston';
const logger = createLogger({
    format: format.combine(
        format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
        format.printf(info => {
            let result = `[${info.timestamp}] [${info.level}]`;
            if (info.stack) {
                result += ` ${info.stack}`;
            } else {
                result += ` ${info.message}`;
            }
            return result;
        })
    ),
    transports: [
        new transports.Console(),
        new transports.File({
            filename: `log-${new Date().getTime()}.txt`,
            level: 'debug'
        })
    ]
});

export default logger;
