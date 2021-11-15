'use strict';

// Set up logger
import {transports, createLogger, format} from 'winston';
const logger = createLogger({
    format: format.combine(
        format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
        {
            transform(info: any, opts) {
                const message = info.message;
                if (message instanceof Error) {
                    info.message = message.stack?.replace(/^Error/g, message.constructor.name);
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
        new transports.Console(),
        new transports.File({
            filename: `log-${new Date().getTime()}.txt`,
            level: 'debug'
        })
    ]
});

export default logger;
