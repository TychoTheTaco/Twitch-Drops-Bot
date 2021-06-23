# Twitch Drops Bot

This is a Node.js bot that uses [puppeteer](https://github.com/puppeteer/puppeteer) to automatically watch Twitch streams and claim drop rewards.

## Disclaimer

Use this bot at your own risk! This bot uses parts of the Twitch API that are not intended for public use. I am not responsible for anything that happens to your Twitch account.

## Usage

Create a config file with the following contents:
```
{
  "browser": Path to your Chrome executable.
  "games": A list of IDs of the games that the bot should automatically watch. See games.csv for a list of game IDs.
  "username": Your Twitch username. This item is optional. It is only used to automatically fill out the login page.
  "password": Your Twitch password. This item is optional. It is only used to automatically fill out the login page.
}
```
For example, `config.json`
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

Start the bot with `node index.js`.
