FROM node:current-bullseye

# Install Chromium
RUN apt-get update && apt-get install chromium -y

# Copy required files
WORKDIR /app
COPY ./src ./src
COPY package*.json ./
COPY tsconfig.json ./

# Don't download the bundled Chromium with Puppeteer
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
     "--browser", "chromium", \
     "--browser-args=--no-sandbox", \
     "--headless-login"]
