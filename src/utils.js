'use strict';

const prompt = require("prompt");

async function asyncPrompt(schema) {
    return new Promise((resolve, reject) => {
        prompt.get(schema, (error, result) => {
            if (error) {
                reject(error);
            }
            resolve(result);
        });
    });
}

module.exports = {
    asyncPrompt
}
