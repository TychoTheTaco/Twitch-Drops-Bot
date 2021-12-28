# Twitch Drops Bot

This is a Node.js bot that uses [Puppeteer](https://github.com/puppeteer/puppeteer) to automatically watch Twitch streams and claim drop rewards.

## Usage

1) Install [Node.js](https://nodejs.org/) (Requires version 14+)
2) Install [Google Chrome](https://www.google.com/chrome/)
3) Install this package: `npm install .`
4) Start the bot with `node dist/index.js` or `npm run start`. If there is no configuration file, a default one will be created.
5) By default, the bot will attempt to watch all games. You can change which games that the bot watches by specifying game IDs in the config file. See `games.csv` for the game IDs.

### Options

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

| Argument | Config | Description | Default |
| --- | --- | --- | --- |
| <code>&#8209;&#8209;config&nbsp;\<path\></code> | | Path to your configuration file.| `config.json` |
| <code>&#8209;&#8209;browser&nbsp;\<path\></code> | `browser` | Path to your browser executable. Only Chrome is currently supported. Although Puppeteer includes a version of Chromium, it does not support the video format required to watch Twitch streams, so a separate Chrome installation is required. | System dependent |
| <code>&#8209;&#8209;games&nbsp;\<ids\></code> | `games` | A list of IDs of the games that the bot should automatically watch. See `games.csv` for a list of game IDs. This item is optional. If empty or omitted, the bot will try to watch all games. | `[]` |
| <code>&#8209;&#8209;username&nbsp;\<string\></code> | `username` | Your Twitch username. It is only used to automatically fill out the login page. This is required if `headless-login` is `true`, otherwise it is optional. | |
| <code>&#8209;&#8209;password&nbsp;\<string\></code> | `password` | Your Twitch password. It is only used to automatically fill out the login page. This is required if `headless-login` is `true`, otherwise it is optional. | |
| <code>&#8209;&#8209;headless-login</code> | `headless_login` | Login to Twitch in headless mode. If this is enabled, you must also provide a username and password. This is useful for logging in remotely. | `false` |
| <code>&#8209;&#8209;headless&nbsp;\<boolean\></code> | `headless` | Toggle headless mode. If false, this will display the browser at all times. Useful for debugging. | `true` |
| <code>&#8209;&#8209;interval&nbsp;\<minutes\></code> | `interval` | The number of minutes to wait between checking for new drop campaigns.| `15` |
| <code>&#8209;&#8209;browser&#8209;args&nbsp;\<args\></code> | `browser_args` | Extra arguments to pass to the browser instance. | `[]` |
| <code>&#8209;&#8209;watch&#8209;unlisted&#8209;games</code> | `watch_unlisted_games` | If this is set to `true`, the app will watch streams of games that are not listed in the config after listed games have completed. | `false` |
| <code>&#8209;&#8209;cookies&#8209;path</code> | `cookies_path` | The path to a file containing Twitch login cookies. If the file does not exist, one will be created after logging in. | <code>cookies&#8209;\<username>.json</code> |
| <code>&#8209;&#8209;log&#8209;level</code> | `log_level` | The log level to display in the console. All log levels are still logged to the log file. | <code>info</code> |
| <code>&#8209;&#8209;show&#8209;account&#8209;not&#8209;linked&#8209;warning</code> | `show_account_not_linked_warning` | Show a warning if your Twitch account is not linked to a Drop Campaign. | <code>true</code> |
| <code>&#8209;&#8209;load&#8209;timeout&#8209;secs</code> | `load_timeout_secs` | Increasing the timeout can help with low-end devices (such as: Raspberry Pi). | <code>30</code>
| <code>&#8209;&#8209;failed&#8209;stream&#8209;retry</code> | `failed_stream_retry` | The number of failures a stream can have before being blacklisted. | <code>3</code>
| <code>&#8209;&#8209;failed&#8209;stream&#8209;timeout</code> | `failed_stream_timeout` | The number of minutes to wait before removing a stream from blacklist. | <code>30</code>
| <code>&#8209;&#8209;hide&#8209;video</code> | `hide_video` | Setting the visibility of a video to "hidden" will lower the CPU usage. | <code>false</code>

### Update Games List

If you want to update the list of games found in `games.csv`, just run `npm run updateGames`.

## Docker

You can also run this bot in a docker container. The latest image can be downloaded [here](https://github.com/TychoTheTaco/Twitch-Drops-Bot/pkgs/container/twitch-drops-bot).

### Starting the container

Use one of the following commands to start the container. Make sure you run this command in the same directory as `config.json`, since it will map the current directory to the `/app/data` directory in the container. If this is the first
time running the bot, a `config.json` file will be created in the current directory. 

Windows (Command Prompt): `docker run -v %cd%:/app/data -i -t --sig-proxy=false ghcr.io/tychothetaco/twitch-drops-bot`

Linux: `docker run -v ${PWD}:/app/data -i -t --sig-proxy=false ghcr.io/tychothetaco/twitch-drops-bot`

## Raspberry Pi

Make sure to install the latest version of Node.js, look at [this link](https://github.com/nodesource/distributions/blob/master/README.md).

To install Node.js 16 use the following commands:

```sh
$ sudo curl -sL https://deb.nodesource.com/setup_16.x | bash -
$ sudo sudo apt-get update && apt-get install -y nodejs
```
