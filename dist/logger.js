'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
// Set up logger
const winston_1 = require("winston");
const logger = (0, winston_1.createLogger)({
    format: winston_1.format.combine(winston_1.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), {
        transform(info, opts) {
            var _a;
            const message = info.message;
            if (message instanceof Error) {
                info.message = (_a = message.stack) === null || _a === void 0 ? void 0 : _a.replace(/^Error/g, message.constructor.name);
            }
            return info;
        }
    }, winston_1.format.printf(info => {
        let result = `[${info.timestamp}] [${info.level}] ${info.message}`;
        if (info.stack) {
            result += ` ${info.stack}`;
        }
        return result;
    })),
    transports: [
        new winston_1.transports.Console(),
        new winston_1.transports.File({
            filename: `log-${new Date().getTime()}.txt`,
            level: 'debug'
        })
    ]
});
exports.default = logger;
