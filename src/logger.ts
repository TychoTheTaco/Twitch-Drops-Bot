import {transports, createLogger, format} from 'winston';

// Set up logger
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
        new transports.Console({
            format: format.colorize({
                colors: {info: "white", warn: "yellow", error: "red"},
                all: true
            })
        })
    ]
});

export default logger;
