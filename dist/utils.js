'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const prompt = require('prompt');
function asyncPrompt(schema) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            prompt.get(schema, (error, result) => {
                if (error) {
                    reject(error);
                }
                resolve(result);
            });
        });
    });
}
function saveScreenshotAndHtml(page, pathPrefix) {
    return __awaiter(this, void 0, void 0, function* () {
        const time = new Date().getTime();
        const screenshotPath = pathPrefix + '-screenshot-' + time + '.png';
        const htmlPath = pathPrefix + '-page-' + time + '.html';
        yield page.screenshot({
            fullPage: true,
            path: screenshotPath
        });
        fs_1.default.writeFileSync(htmlPath, yield page.content());
    });
}
exports.default = {
    asyncPrompt,
    saveScreenshotAndHtml
};
