# Options

There are multiple options you can configure. They can be provided as command line arguments or in a config JSON file. Options passed as command line arguments will override items in the config file. If no command line arguments are
provided, a default config file will be generated.

A sample config file looks like this:

```json
{
    "username": "my_twitch_username",
    "password": "my_twitch_password",
    "browser": "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "games": ["Rocket league", "514152", "138585"],
    "headless": true,
    "headless_login": true,
    "interval": 15,
    "load_timeout_secs": 30,
    "failed_stream_retry": 3,
    "failed_stream_timeout": 30,
    "browser_args": [],
    "watch_unlisted_games": true,
    "hide_video": true,
    "show_account_not_linked_warning": true,
    "ignored_games": ["509511"],
    "attempt_impossible_campaigns": true,
    "watch_streams_when_no_drop_campaigns_active": true,
    "do_version_check": true,
    "broadcasters": ["my_favorite_streamer", "my_second_favorite_streamer"],
    "tui": {
        "enabled": true
    },
    "updates": {
        "type": "release",
        "enabled": true
    },
    "notifications": {
        "discord": [
            {
                "webhook_url": "https://discord.com/api/webhooks/abcde",
                "events": {
                    "new_drops_campaign": {
                        "games": "all"
                    },
                    "drop_claimed": {
                        "games": "config"
                    },
                    "community_points_earned": {
                        "reasons": [
                            "claim",
                            "streak",
                            "raid"
                        ]
                    },
                    "drop_ready_to_claim": {}
                }
            }
        ],
        "telegram": [
            {
                "token": "abcde",
                "chat_id": "12345",
                "events": {
                    "new_drops_campaign": {
                        "games": "all"
                    },
                    "drop_claimed": {
                        "games": "all"
                    },
                    "community_points_earned": {
                        "reasons": []
                    },
                    "drop_ready_to_claim": {}
                }
            }
        ]
    },
    "auto_claim_community_points": true,
    "auto_claim_drops": true
}
```

Below is a list of all available options.

`--config <path>` The path to your configuration file.

- Alias: `-c`
- Default: `config.json`

`--browser <path>` | `browser` The path to your browser executable. Only Google Chrome is currently supported. Although Puppeteer includes a version of Chromium, it does not support the video format required to watch Twitch streams, so a
separate Google Chrome installation is required.

- Alias: `-b`
- Default: Operating system dependent

`‑‑games <ids|names>` | `games` A list of IDs and/or names of the games that the bot should automatically watch. See `games.csv` for a list of game IDs (Note that this is not a complete list - this bot supports any games with time based
Drops). If empty or omitted, the bot will try to watch all games. If provided as a command line argument, this should be a comma-separated list of IDs. If provided in the JSON config, this should be an array of strings. This list is in
order of priority! The bot will give priority to games that are at the beginning of the list. For example: Your config file has `"games": ["1", "2", "3"]`. The bot is currently watching a stream for game `2`. The bot periodically checks if
there are active campaigns/streams for the other games listed, and finds one for game `1`. Game `1` is listed first in the config, so it has a higher priority and the bot will switch to it. If there are multiple active campaigns for a game,
then it will give priority to the one that ends first.

- Alias: `-g`

`‑‑username <string>` | `username` Your Twitch username. It is only used to automatically fill out the login page. This is required if `headless-login` is `true`, otherwise it is optional.

- Alias: `-u`

`‑‑password <string>` | `password` Your Twitch password. It is only used to automatically fill out the login page. This is required if `headless-login` is `true`, otherwise it is optional.

- Alias: `-p`

`‑‑auth-token <string>` | `auth_token` An auth token to use for logging in. This can be used instead of a username and password.

`‑‑headless-login` | `headless_login` Login to Twitch in headless mode. If this is enabled, you must also provide a username and password. This is useful for logging in remotely.

- Default: `false`

`‑‑headless <boolean>` | `headless` Toggle headless mode. If `false`, this will display the browser at all times. Useful for debugging.

- Default: `true`

`‑‑interval <minutes>` | `interval` The number of minutes to wait between checking for new drop campaigns.

- Alias: `-i`
- Default: `15`

`‑‑browser‑args <args>` | `browser_args` Extra arguments to pass to the browser instance. If provided as a command line argument, this should be a comma-separated list of args. Note that `\` is used as an escape character so if you want to
use a comma in one of the args, it needs to be escaped so this `--some-arg=a,b,c` would be `--some-arg=a\,b\,c` If provided in the JSON config, this should be an array of strings.

`‑‑watch‑unlisted‑games` | `watch_unlisted_games` When `true`, the app will watch streams of games that are not listed in the config if the listed games' campaigns are completed or no streams are active.

- Default: `false`

`‑‑cookies‑path <path>` | `cookies_path` The path to a file containing Twitch login cookies. If the file does not exist, one will be created after logging in.

- Default: `cookies‑<username>.json`

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

`‑‑attempt-impossible-campaigns` | `attempt_impossible_campaigns` When true, the bot will make progress towards Drop Campaigns even if the campaign is expected to end before we can finish watching to claim the Drop. For example: A Drop
Campaign will end in 30 minutes. We have watched 15 / 60 minutes for one of the Drops. Normally, we will not be able to finish and claim the Drop so there is no point in trying. However, sometimes Drop Campaigns get extended which means we
would have had enough time.

- Default: `true`

`‑‑watch-streams-when-no-drop-campaigns-active` | `watch_streams_when_no_drop_campaigns_active` When true, the bot will watch streams when there are no Drop Campaigns active, or if there are no streams online for any pending Drop Campaigns.
This is useful if you still want to claim community points.

- Default: `false`

`‑-broadcasters` | `broadcasters` A list of broadcasters (streamers) usernames that the bot should watch when it is idle (no Drop Campaigns active). This list is in order of priority.

`tui` Changes text-based user interface (TUI) options. This should be in JSON format.

- `enabled`: boolean - When `true`, enables a text-based interface for the bot. NOTE: THIS IS AN EXPERIMENTAL FEATURE.

`updates` Changes update check settings. This should be in JSON format.

- `enabled`: boolean - When `true` (default), the bot will check for updates once per day.
- `type`: string - Determines which type of update to be notified of.
  - `"dev"` - Notify about updates for new development versions and release versions of the bot.
  - `"release"` - (default) Only notify for new release versions of the bot.

`logging` - Change options related to logging. This should be in JSON format.

- `enabled`: When `true` (default), the app will log data to a file.
- `file`: Path of the log file (default: `log-XXXXXXXXXX.txt`). If you use this option, the file will be overwritten whenever you restart the app!
- `level`: The level of logging to write to the log file. One of: `debug` (default), `info`, `warn`, `error`.

`notifications` - See [Notifications](notifications.md) for more details.

`--auto-claim-drops` | `auto_claim_drops` Automatically claim Drop Rewards.

- Default: `true`

`--auto-claim-community-points` | `auto_claim_community_points` Automatically claim Community Points.

- Default: `true`
