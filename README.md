# Twitch Drops Bot

This is a Node.js bot that uses [Puppeteer](https://github.com/puppeteer/puppeteer) to automatically watch Twitch streams and claim drop rewards.

## Disclaimer

Use this bot at your own risk! This bot uses parts of the Twitch API that are not intended for public use. I am not responsible for anything that happens to your Twitch account.

## Usage

1) Install [Node.js](https://nodejs.org/)
2) Install [Google Chrome](https://www.google.com/chrome/)
3) Install this package: `npm install .`
4) Start the bot with `node src/index.js`

This bot automatically creates a config file with various options including:
|Option| Description |
| --- | --- |
|<code>browser</code>|Path to your browser executable. Only Chrome is currently supported. Although Puppeteer includes a version of Chromium, it does not support the video format required to watch Twitch streams, so a seperate Chrome installation is required.|
|<code>games</code>| A list of IDs of the games that the bot should automatically watch. See games.csv for a list of game IDs. This item is optional. If empty or omitted, the bot will try to watch all games.|
|<code>username</code>| Your Twitch username. This item is optional. It is only used to automatically fill out the login page.|
|<code>password</code>| Your Twitch password. This item is optional. It is only used to automatically fill out the login page.|
|<code>interval</code>|The number of minutes to wait between checking for new drop campaigns. Default: 15|

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
|<code>&#8209;&#8209;headless-login</code>| Login to Twitch in headless mode. If this is enabled, you must also provide a username and password. This is useful for logging in remotely. This cannot be used at the same time as <code>headful</code>.|
|<code>&#8209;&#8209;headful</code>|Run everything in headful mode. This will display the browser at all times. Useful for debugging. This cannot be used at the same time as <code>headless-login</code>.|
|<code>&#8209;&#8209;interval</code>|The number of minutes to wait between checking for new drop campaigns. Default: 15|
