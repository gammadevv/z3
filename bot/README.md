# Zeta for Discord

Zeta's Discord app shows listening activity and controls an online Zeta player.
It installs to your Discord account under **Add to My Apps** and can be used
in servers and DMs where Discord allows apps.

## Run the bot

Use Node.js 24.17 or later. Create a dedicated app in the
[Discord Developer Portal](https://discord.com/developers/applications).
Under **Installation**, enable **User Install** and add the `applications.commands`
scope to its default install settings. Leave **Interactions Endpoint URL** empty
so Discord sends commands over its Gateway.

From the repository root:

```sh
npm --prefix bot ci
cp bot/.env.example bot/.env
```

Set `DISCORD_TOKEN` in `bot/.env` to the app's bot token. Set `LASTFM_API_KEY`
if you'd like to enable Last.fm lookups. ListenBrainz works with no API key.

```sh
npm --prefix bot start
```

Keep the bot process running. Startup syncs this app's global commands and prints
its user-install link. Open that link and select **Add to My Apps**. Discord may
take a moment to propagate changes to slash commands.

## Connect accounts

- Use `/link service:Last.fm username:yourname` or
  `/link service:ListenBrainz username:yourname` to read your public listening
  profile. Use `/profile` to see saved connections.
- Use `/wayship` to control a desktop or Android build of Zeta with Discord bot
  support. Select **Open Wayship**, sign in to the same account used under
  **Zeta Settings → Nearby devices → Connect with Wayship**, and approve a new
  **Discord Bot** connection. Paste that dedicated app token in **Enter app
  token**. The form is private to your Discord interaction. Keep the Zeta player
  open and connected while using it.
- Use `/unlink` to remove any saved connection. To revoke an issued Wayship
  token, remove the Discord Bot under **Connected apps** in Wayship.

Connection data is stored in the bot's ignored `.data/` directory by default.
Set `ZETA_BOT_DATA_DIR` to put it elsewhere. Use one bot process per data directory.

## Commands

| Command | What it does |
| --- | --- |
| `/playing` | Shows live Zeta playback or the linked scrobbling service's live track. If neither is available, it can show the last played track. |
| `/recent`, `/toptracks`, `/topartists` | Shows data from the selected listening profile. Set `share:True` to post a listening result in the channel. |
| `/devices`, `/queue` | Lists online Zeta devices and the selected player's upcoming tracks. |
| `/play`, `/playnext`, `/enqueue` | Searches by song and artist, then starts playback or adds the match to the queue. |
| `/skip`, `/previous`, `/pause`, `/unpause` | Controls an online Zeta player. |
| `/seek`, `/volume` | Jumps to a position in seconds or sets volume from 0 to 100%. |
| `/lyrics` | Looks up lyrics for the current track or a song you search for. |
| `/help` | Lists commands in Discord. |

The bot prefers an online device that's already playing. Use the optional
`device` argument to pick a specific one by name or by ID from `/devices`.
Playback controls require an online Wayship connection. Listening stats can
work with the player closed.

## Check locally

Run `npm --prefix bot test` to test command registration data, account storage,
and playback routing with mocked Discord and Wayship requests.

[Discord user installation](https://docs.discord.com/developers/tutorials/developing-a-user-installable-app) ·
[Wayship peer signaling](https://wayship.link/docs.md#peer-signaling)
