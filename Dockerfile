FROM node:14-bullseye

# Install Google Chrome
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update && apt-get install -y google-chrome-stable

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
