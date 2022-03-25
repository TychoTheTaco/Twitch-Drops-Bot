# Twitch Drops Bot

This is a Node.js bot that uses [Puppeteer](https://github.com/puppeteer/puppeteer) to automatically watch Twitch streams and claim drop rewards.

## Getting Started

The recommended way of using this bot is to use [Docker](https://www.docker.com/).

### Docker

Pull the latest image with `docker pull ghcr.io/tychothetaco/twitch-drops-bot:latest`.

#### Starting the container

Use one of the following commands to start the container. Make sure you run this command in the same directory as `config.json`, since it will map the current directory to the `/app/data` directory in the container. If this is the first
time running the bot, a `config.json` file will be created in the current directory.

Windows (Command Prompt): `docker run -v %cd%:/app/data -i -t --sig-proxy=false ghcr.io/tychothetaco/twitch-drops-bot`

Linux: `docker run -v ${PWD}:/app/data -i -t --sig-proxy=false ghcr.io/tychothetaco/twitch-drops-bot`

To detach from the docker session without terminating it, use `CTRL-P` `CTRL-Q`.

### Non-Docker Setup

1) Install [Node.js](https://nodejs.org/) (Requires version 14+)
2) Install [Google Chrome](https://www.google.com/chrome/)
3) Install this package: `npm install .`
4) Build the app: `npm run build`
5) Start the bot with `node dist/index.js` or `npm run start`. If there is no configuration file, a default one will be created.
6) By default, the bot will attempt to watch all games. You can change which games that the bot watches by specifying game IDs in the config file. See `games.csv` for the game IDs.

### Raspberry Pi

Make sure to install the latest version of Node.js, look at [this link](https://github.com/nodesource/distributions/blob/master/README.md).

To install Node.js 16 use the following commands:

```sh
$ sudo curl -sL https://deb.nodesource.com/setup_16.x | bash -
$ sudo sudo apt-get update && apt-get install -y nodejs
```

## Options

There are multiple options you can configure. They can be provided as command line arguments or in a config JSON file. Options passed as command line arguments will override items in the config file. If no command line arguments are provided, a default config file will be generated.

A sample config file looks like this:
```
{
    "browser": "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "games": ["30921", "511224", "488552"],
    "headless": true,
    "headless_login": false,
    "interval": 15,
    "browser_args": []
}
```

Below is a list of all available options.

`--config <path>` The path to your configuration file.

- Alias: `-c` 
- Default: `config.json`

`--browser <path>` | `browser` The path to your browser executable. Only Google Chrome is currently supported. Although Puppeteer includes a version of Chromium, it does not support the video format required to watch Twitch streams, so a separate Google Chrome installation is required.

- Alias: `-b`
- Default: Operating system dependent

`‑‑games <ids>` | `games` A list of IDs of the games that the bot should automatically watch. See `games.csv` for a list of game IDs. If empty or omitted, the bot will try to watch all games. If provided as a command line argument, this should be a comma-separated list of IDs. If provided in the JSON config, this should be an array of strings. This list is in order of priority! The bot will give priority to games that are at the beginning of the list. For example: Your config file has `"games": ["1", "2", "3"]`. The bot is currently watching a stream for game `2`. The bot periodically checks if there are active campaigns/streams for the other games listed, and finds one for game `1`. Game `1` is listed first in the config, so it has a higher priority and the bot will switch to it. If there are multiple active campaigns for a game, then it will give priority to the one that ends first.

- Alias: `-g`

`‑‑username <string>` | `username` Your Twitch username. It is only used to automatically fill out the login page. This is required if `headless-login` is `true`, otherwise it is optional.

- Alias: `-u`

`‑‑password <string>` | `password` Your Twitch password. It is only used to automatically fill out the login page. This is required if `headless-login` is `true`, otherwise it is optional.

- Alias: `-p`

`‑‑headless-login` | `headless_login` Login to Twitch in headless mode. If this is enabled, you must also provide a username and password. This is useful for logging in remotely.

- Default: `false`

`‑‑headless <boolean>` | `headless` Toggle headless mode. If `false`, this will display the browser at all times. Useful for debugging.

- Default: `true`

`‑‑interval <minutes>` | `interval` The number of minutes to wait between checking for new drop campaigns.

- Alias: `-i`
- Default: `15`

`‑‑browser‑args <args>` | `browser_args` Extra arguments to pass to the browser instance. If provided as a command line argument, this should be a comma-separated list of args. Note that `\ ` is used as an escape character so if you want to use a comma in one of the args, it needs to be escaped so this `--some-arg=a,b,c` would be `--some-arg=a\,b\,c` If provided in the JSON config, this should be an array of strings.

`‑‑watch‑unlisted‑games` | `watch_unlisted_games` When `true`, the app will watch streams of games that are not listed in the config if the listed games' campaigns are completed or no streams are active.

- Default: `false`

`‑‑cookies‑path <path>` | `cookies_path` The path to a file containing Twitch login cookies. If the file does not exist, one will be created after logging in.

- Default: `cookies‑<username>.json`

`‑‑log‑level <level>` | `log_level` The log level to display in the console. All log levels are still logged to the log file. Using a level lower than `info` may cause the progress bar to get messed up.

- Default: `info`

`‑‑show‑account‑not‑linked‑warning` | `show_account_not_linked_warning` Show a warning if your Twitch account is not linked to a Drop Campaign.

- Alias: `-sanlw`
- Default: `true`

`‑‑load‑timeout‑secs <seconds>` | `load_timeout_secs` The number of seconds to wait for page loading. Increasing the timeout can help with low-end devices (such as: Raspberry Pi).

- Alias: `-t`
- Default: `30`

`‑‑failed‑stream‑retry <count>` | `failed_stream_retry` The number of failures a stream can have before being (temporarily) blacklisted.

- Default: `3`

`‑‑failed‑stream‑timeout <minutes>` | `failed_stream_timeout` The number of minutes to wait before removing a stream from the blacklist.

- Default: `30`

`‑‑hide‑video` | `hide_video` Change the visibility of all `video` elements to `hidden` to lower the CPU usage.

- Default: `false`

`‑‑ignored-games` | `ignored_games` A list of IDs of games that the bot should ignore. This is useful when `watch_unlisted_games` is `true`, but you want to ignore some games.

`‑‑attempt-impossible-campaigns` | `attempt_impossible_campaigns` When true, the bot will make progress towards Drop Campaigns even if the campaign is expected to end before we can finish watching to claim the Drop. For example: A Drop Campaign will end in 30 minutes. We have watched 15 / 60 minutes for one of the Drops. Normally, we will not be able to finish and claim the Drop so there is no point in trying. However, sometimes Drop Campaigns get extended which means we would have had enough time.

- Default: `true`

`‑‑watch-streams-when-no-drop-campaigns-active` | `watch_streams_when_no_drop_campaigns_active` When true, the bot will watch streams when there are no Drop Campaigns active, or if there are no streams online for any pending Drop Campaigns. This is useful if you still want to claim community points.

- Default: `false`

`‑-broadcasters` | `broadcasters` A list of broadcasters (streamers) usernames that the bot should watch when it is idle (no Drop Campaigns active). This list is in order of priority.

`‑-do-version-check` | `do_version_check` Check for a new version on startup.

- Default: `true`

### Update Games List

If you want to update the list of games found in `games.csv`, just run `npm run updateGames`.
