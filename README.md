# Twitch Drops Bot

This is a Node.js bot that uses [Puppeteer](https://github.com/puppeteer/puppeteer) to automatically watch Twitch streams and claim drop rewards.

## Disclaimer

Use this bot at your own risk! This bot uses parts of the Twitch API that are not intended for public use. I am not responsible for anything that happens to your Twitch account.

## Usage

1) Install [Node.js](https://nodejs.org/)
2) Install [Google Chrome](https://www.google.com/chrome/)
3) Install this package: `npm install .`
4) Start the bot with `node src/index.js`

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
| <code>&#8209;&#8209;update&#8209;games</code> | | Updates `games.csv` with current campaigns games and exits after it's done | |
