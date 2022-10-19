# Notifications

## Example

```
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
}
```

## Events

### new_drops_campaign

Sent when a new Drops Campaign is detected.

- `games` - One of the below options.
  - `all` - Notify for all games.
  - `config` - Notify only for games specified in the config.

### drop_claimed

Sent when a Drop Reward is claimed.

- `games` - One of the below options.
    - `all` - Notify for all games.
    - `config` - Notify only for games specified in the config.
 
### community_points_earned

Sent when community points are earned.

- `reasons` - A list of reasons to notify for. Options shown below. Leave blank to be notified for all reasons.
    - `watch` - Points earned every few minutes for watching.
    - `claim` - Points earned when clicking "claim points" button.
    - `watch_streak` - Points earned from a watch streak.
    - `raid` - Points earned for joining a raid.

### drop_ready_to_claim

Sent when the bot detects that a Drop Reward in your inventory is ready to claim. This may be sent multiple times for the same Drop Reward.

- `<no options>`