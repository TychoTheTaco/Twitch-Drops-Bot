# Twitch Drops Bot

A Node.js bot that uses [Puppeteer](https://github.com/puppeteer/puppeteer) to automatically watch Twitch streams and claim drop rewards.

## Getting Started

The recommended way of using this bot is to use [Docker](https://www.docker.com/).

### Docker

#### Tags

`latest` - The latest development version. This includes all commits from the `dev` branch.

`latest-release` - The latest release version. This includes all commits from the `master` branch.

`vX.X.X` - Specific release versions.

#### 1. Pull the image

Pull the latest release image with `docker pull ghcr.io/tychothetaco/twitch-drops-bot:latest-release`.

#### 2. Starting the container

Use one of the following commands to start the container. Make sure you run this command in the same directory as `config.json`, since it will map the current directory to the `/app/data` directory in the container. If this is the first
time running the bot, a default `config.json` file will be created in the current directory.

Windows (Command Prompt): `docker run --rm -v "%cd%":/app/data -i -t --sig-proxy=false ghcr.io/tychothetaco/twitch-drops-bot:latest-release`

Windows (PowerShell): `docker run --rm -v "${PWD}":/app/data -i -t --sig-proxy=false ghcr.io/tychothetaco/twitch-drops-bot:latest-release`

Linux: `docker run --rm -v "${PWD}":/app/data -i -t --sig-proxy=false ghcr.io/tychothetaco/twitch-drops-bot:latest-release`

To detach from the docker session without terminating it, use `CTRL-P` `CTRL-Q`.

##### Troubleshooting Docker

`docker: Error response from daemon: create %cd%: "%cd%" includes invalid characters for a local volume name, only "[a-zA-Z0-9][a-zA-Z0-9_.-]" are allowed. If you intended to pass a host directory, use absolute path.`

You are using the `Command Prompt` command above, but are not using Command Prompt as your terminal. Make sure to use the correct command for your OS/terminal.

#### 3. Customize config.json

- By default, the bot will attempt to watch all games. You can change which games that the bot watches by specifying game names or IDs in the config file. See `games.csv` for the game IDs.
- Add your username to the config so that the bot can reuse the correct cookies, so you don't have to log in again everytime the bot is restarted.

### Non-Docker Setup

1) Install [Node.js](https://nodejs.org/) (Requires version 16+)
2) Install [Google Chrome](https://www.google.com/chrome/)
3) Install this package: `npm install .`
4) Build the app: `npm run build`
5) Start the bot with `node dist/index.js` or `npm run start`. If there is no configuration file, a default one will be created.
6) Customize your config.json. (Restart the bot for changes to be applied)
    1) By default, the bot will attempt to watch all games. You can change which games that the bot watches by specifying game names or IDs in the config file. See `games.csv` for the game IDs.
    2) Add your username to the config so that the bot can reuse the correct cookies, so you don't have to log in again everytime the bot is restarted.

After updating your install, re-run `npm install .` and `npm run build`.

#### Raspberry Pi

Make sure to install the latest version of Node.js, look at [this link](https://github.com/nodesource/distributions/blob/master/README.md).

To install Node.js 16 use the following commands:

```sh
sudo curl -sL https://deb.nodesource.com/setup_16.x | bash -
sudo sudo apt-get update && apt-get install -y nodejs
```

## Options

See [Options](docs/options.md) for a list of all available options.

### Update Games List

If you want to update the list of games found in `games.csv`, just run `npm run updateGames` or `npm run u`.

## Troubleshooting

`Error watching stream`

When this happens, its usually because the stream page did not load fast enough. It's normal for this to happen occasionally, but if it happens often, it might be due to a slow or unstable network connection. This can also happen if you're
using a low-power system such as a Raspberry Pi.

Try increasing `load_timeout_secs` to `60` or `90`.

## FAQ

### The game I want to watch is not in `games.csv`. Can I still use this bot for that game?

Yes, you can use this bot for any game! The `games.csv` file is provided for convenience and might be missing some games, but you can find a game's ID yourself by following these steps.
Open the game's main page on Twitch, for example, Rocket League: <https://www.twitch.tv/directory/game/Rocket%20League>. Right-click the game's image. Click `Inspect Element`. You should see something like this:

```html
<img alt="Rocket League" class="tw-image" src="https://static-cdn.jtvnw.net/ttv-boxart/30921-144x192.jpg">
```

The number in between `ttv-boxart/` and `-144x192.jpg` is the game ID. In this example it is `30921`.
