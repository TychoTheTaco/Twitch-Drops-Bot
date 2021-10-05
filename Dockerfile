FROM node:14-bullseye

# Install Google Chrome
RUN apt-get update \
    && wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get install ./google-chrome*.deb --yes \
    && rm ./google-chrome*.deb

WORKDIR /app
COPY package*.json ./

RUN npm install

COPY ./src ./src

WORKDIR /app/data

CMD ["node", "--unhandled-rejections=strict", "/app/src/index.js", \
     "--config", \
     "config.json", \
     "--browser", "google-chrome-stable", \
     "--browser-args=--no-sandbox", \
     "--headless-login"]
