# Zeta for Discord

Zeta's Discord app shows listening activity and controls an online Zeta player.
Install it under **Add to My Apps** or add it to a server. Replies appear in DMs
and in channels where Discord permits them. Connection settings stay private in
shared channels.

## Run the bot

Use Node.js 24.17 or later. Create a dedicated app in the
[Discord Developer Portal](https://discord.com/developers/applications).
Under **Installation**, enable **User Install** and add the `applications.commands`
scope to its default install settings. Leave **Interactions Endpoint URL** empty
so Discord sends commands over its Gateway.

For server installs, also enable **Guild Install**. Add the `bot` and
`applications.commands` scopes with **View Channel**, **Send Messages**, **Embed Links**,
**Attach Files**, **Send Messages in Threads**, **Connect**, and **Speak**
permissions.

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
its install links. Discord may take a moment to propagate changes to slash
commands. For an app added to an account only, a server can restrict public
replies with its **Use External Apps** permission.

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
| `/nowplaying` | Shares cover art, track details, and playback progress when a Zeta device provides them. |
| `/defaultdevice` | Saves a player from `/devices` for your commands. Pass `clear: True` to remove it. An explicit device or your active voice session takes priority. |
| `/recent`, `/toptracks`, `/topartists` | Shows data from the selected listening profile. Set `share:False` to reply privately. |
| `/devices`, `/queue` | Lists online Zeta devices and the selected player's upcoming tracks. |
| `/album` | Shows cover art, album details and up to five tracks. Provide a song to look it up in Zeta. |
| `/play`, `/playnext`, `/enqueue` | Searches by song and artist, then starts playback or adds the match to the queue. |
| `/skip`, `/previous`, `/pause`, `/unpause` | Controls an online Zeta player. |
| `/seek`, `/volume` | Jumps to a position in seconds or sets volume from 0 to 100%. |
| `/lyrics` | Looks up lyrics for the current track or a song you search for. |
| `/join`, `/leave` | Shares the local desktop Zeta player's audio in your server voice channel or ends the session. |
| `/help` | Lists commands in Discord. |

The bot prefers an online device that's already playing. Use the optional
`device` argument to pick a specific one by name or by ID from `/devices`.
On Android, `/devices` shows whether the phone is answering commands. If it
shows no reply, bring Zeta to the foreground on the phone and check its Wayship
connection in Settings before trying the command again.
The selected Zeta app runs song searches, lyrics lookups, and playback. The bot
passes requests and results over Wayship. Listening-profile lookups call Last.fm
or ListenBrainz directly and can work with the player closed.

## Share audio in a server voice channel

Run the bot and desktop Zeta on the same computer. Install Zeta to the server
using the bot's server-install link, then connect the desktop app and your
Discord account to the same Wayship account. Join a regular server voice channel
and use `/join`. You can pass a device name or ID if several desktop players
are online. Use `/play` and the other player commands in that server to run
the connected Zeta player.

Zeta sends its music output to the bot through an authenticated loopback
connection. Local volume is independent of the audio shared to Discord.
Use `/leave` or **Stop Discord audio** in Zeta to end the session. The bot
also leaves when the session host leaves the voice channel. One local voice
session can be active at a time.

## Check locally

Run `npm --prefix bot test` to test command registration data, account storage,
and playback routing with mocked Discord and Wayship requests.

[Discord user installation](https://docs.discord.com/developers/tutorials/developing-a-user-installable-app) ·
[Wayship peer signaling](https://wayship.link/docs.md#peer-signaling)
