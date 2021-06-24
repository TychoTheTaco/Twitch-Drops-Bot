# Twitch Drops Bot

This is a Node.js bot that uses [puppeteer](https://github.com/puppeteer/puppeteer) to automatically watch Twitch streams and claim drop rewards. After logging in, this bot will run in headless mode, so see the console for progress and other output.

## Disclaimer

Use this bot at your own risk! This bot uses parts of the Twitch API that are not intended for public use. I am not responsible for anything that happens to your Twitch account.

## Usage

1) Install [Node.js](https://nodejs.org/)
2) Install this package: `npm install .`
3) Start the bot with `node index.js`

This bot automatically creates a config file with various options including:
|Option| Description |
| --- | --- |
|<code>browser</code>|Path to your browser executable. Only Chrome is currently supported.|
|<code>games</code>| A list of IDs of the games that the bot should automatically watch. See games.csv for a list of game IDs. This item is optional. If empty or omitted, the bot will try to watch all games.|
|<code>username</code>| Your Twitch username. This item is optional. It is only used to automatically fill out the login page.|
|<code>password</code>| Your Twitch password. This item is optional. It is only used to automatically fill out the login page.|

A sample config file looks like this:
```
{
  "browser": "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "games": ["30921", "511224", "488552"]
}
```

Some options can also be specified as command line arguments. Items passed as command line arguments will override items in the config file.
|Argument| Description |
| --- | --- |
|<code>&#8209;&#8209;config&nbsp;\<path\></code>|Path to your configuration file.|
|<code>&#8209;&#8209;username&nbsp;\<string\></code>| Twitch username.|
|<code>&#8209;&#8209;password&nbsp;\<string\></code>| Twitch password.|
