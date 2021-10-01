FROM node:lts-alpine

RUN apk update && \
    apk add chromium

WORKDIR /app
COPY package*.json ./

RUN npm install

COPY ./src ./src

CMD [ "node", "--unhandled-rejections=strict", "/app/src/index.js", \
    "--browser", "/usr/bin/chromium-browser", \
    "--browser-args=--no-sandbox" ]