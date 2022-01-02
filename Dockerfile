FROM node:14-bullseye

# Install Google Chrome
RUN apt-get update \
    && wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get install ./google-chrome*.deb --yes \
    && rm ./google-chrome*.deb

# Copy required files
WORKDIR /app
COPY ./src ./src
COPY package*.json ./
COPY tsconfig.json ./

# Don't download the bundled Chromium with Puppeteer (It doesn't have the required video codecs to play Twitch video streams)
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Install dependencies
RUN npm install

# Install Typescript. Doesn't work without -g flag for some reason
RUN npm install typescript -g

# Compile the app
RUN tsc

WORKDIR /app/data

CMD ["node", "--unhandled-rejections=strict", "/app/dist/index.js", \
     "--config", \
     "config.json", \
     "--browser", "google-chrome-stable", \
     "--browser-args=--no-sandbox", \
     "--headless-login"]
