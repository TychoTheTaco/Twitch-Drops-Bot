FROM node:14-bullseye

# Install Google Chrome
RUN wget -qO - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" | tee /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y google-chrome-stable

WORKDIR /app
COPY package*.json ./

RUN npm install

COPY ./src ./src

WORKDIR /app/data
COPY games.csv games.csv

CMD ["node", "--unhandled-rejections=strict", "/app/src/index.js", \
     "--config", \
     "config.json", \
     "--browser", "google-chrome-stable", \
     "--browser-args=--no-sandbox", \
     "--headless-login"]
