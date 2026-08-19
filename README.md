# Community Games Bot

A Discord bot to keep your server active: trivia, an economy with daily rewards and gambling-style mini games, hangman, and a leveling/XP leaderboard for chatting.

## Commands
| Command | What it does |
|---|---|
| `/daily` | Claim a daily coin reward (100 coins, once per 24h) |
| `/balance` | Check your coin balance |
| `/coinflip amount choice` | Bet coins on heads/tails |
| `/slots amount` | Bet coins on the slot machine (match 3 = jackpot, match 2 = small payout) |
| `/trivia` | Start a multiple-choice trivia question — first correct answer wins coins |
| `/hangman` | Start a hangman game in the channel — everyone can guess by typing a single letter |
| `/rps` | Rock Paper Scissors against the bot — win for coins |
| `/guessnumber` | Number-guessing game (1–100) — type your guess in chat, first correct wins coins |
| `/wouldyourather` | Posts a Would You Rather prompt with vote buttons |
| `/rank` | See your level, XP, and coin balance |
| `/leaderboard type:level` or `type:coins` | Server leaderboard |
| `/apply` | Apply for a Novara mod or creator role (see below) |
| `/modslots` | Check how many of the 20 moderator slots are still open |
| `/setupverify` | (Admin) Post the Verify button in this channel — new members get an Unverified role on join until they click it |
| `/warn user reason` | Warn a member — DMs them and logs it, keeps a running count |
| `/warnings user` | View a member's full warning history |
| `/clearwarnings user` | Wipe a member's warnings |
| `/kick user reason` | Kick a member |
| `/ban user reason delete_days` | Ban a member, optionally deleting 0-7 days of their recent messages |
| `/unban user_id` | Unban by user ID |

## Moderation + Logging
Set `LOG_CHANNEL_ID` in `.env` to a private mod-only channel. Two kinds of logging happen there automatically:
- **Mod actions** — every warn/kick/ban/clearwarnings posts an embed with who did it, to whom, and why.
- **Passive events** — message deletions and edits (showing before/after), and member joins/leaves (join shows account age, useful for spotting alt accounts).

All moderation commands require the matching Discord permission (Moderate Members for warn, Kick Members for kick, Ban Members for ban/unban) — the bot checks this itself, so only people with the right server permissions can use them even if they somehow get the slash command to show up.

Warnings persist in `warnings.json`, same pattern as `applications.json` — survives restarts as long as your host doesn't wipe the filesystem on redeploy.

## Applications system (mod + creator roles)
Running `/apply` shows a role picker: **Community Moderator**, **Senior Moderator** (these two share a combined cap of **20 total slots**, per your recruitment doc), **Manga Artist**, **Translator**, **Editor**, **Proofreader**, **Letter Writer** (these five are uncapped).

Picking a role opens a short form (Discord "modal") asking for timezone, weekly availability, experience, why this role, and a portfolio link or relevant story. On submit:
- The applicant gets a confirmation DM-style reply.
- The full application is posted to your `APPLICATIONS_CHANNEL_ID` channel with **Approve** / **Reject** buttons (only people with Manage Roles permission can click these).
- Approving a mod-tier application automatically checks the 20-slot cap and blocks approval if it's already full.
- The applicant gets a DM telling them the outcome either way.
- All applications are saved to `applications.json` so nothing is lost on restart.

You'll need to set `APPLICATIONS_CHANNEL_ID` in your `.env` — create a private channel (e.g. `#mod-applications-review`) visible only to admins, and use its Channel ID (same right-click → Copy Channel ID method as before).

Members also earn XP passively just by chatting (small cooldown so it can't be farmed), and level up automatically with a bonus coin reward.

Bot also sends a welcome message to new members automatically.

## Setup (15–20 minutes)

### 1. Create the bot application
1. Go to https://discord.com/developers/applications → **New Application** → name it.
2. Left sidebar → **Bot** → **Add Bot**.
3. Under **Privileged Gateway Intents**, enable `SERVER MEMBERS INTENT` and `MESSAGE CONTENT INTENT`.
4. **Reset Token** → copy it → this is `DISCORD_TOKEN`. Never share this publicly.
5. On **General Information**, copy the **Application ID** → this is `CLIENT_ID`.

### 2. Invite it to your server
1. **OAuth2 → URL Generator**.
2. Scopes: `bot`, `applications.commands`.
3. Permissions: `Send Messages`, `Embed Links`, `Read Message History`, `Use Slash Commands`.
4. Open the generated URL, pick your server, authorize.

### 3. Get your Server ID
1. Discord → **User Settings → Advanced → Developer Mode** (turn on).
2. Right-click your server icon → **Copy Server ID** → this is `GUILD_ID`.

### 4. Configure
Rename `.env.example` to `.env`, fill in the three values above.

### 5. Run it locally to test
```bash
npm install
npm start
```

### 6. Deploy so it stays online 24/7

**Railway (easiest)**
1. https://railway.app → New Project → upload this folder or connect a GitHub repo.
2. Add your `.env` values under the project's **Variables** tab.
3. Railway runs `npm start` automatically and keeps it alive.

**Replit**
1. New Node.js Repl → upload files.
2. Add your env values in the **Secrets** tab.
3. Use Replit's "Always On" (or UptimeRobot pinging it) to keep the free tier alive.

## Notes
- **Data persistence**: coins/XP/levels are stored in `data.json` in the same folder, so they survive restarts. If you deploy to Railway/Replit, make sure the filesystem isn't wiped on redeploy — if it is, this is the first thing to swap for a real database (ask me and I'll wire up Supabase or SQLite).
- **Economy balance**: starting balance is 100 coins, daily reward is 100 coins — tune these numbers in `economy.js` if games feel too easy/hard to grind.
- **Adding more trivia questions or hangman words**: just add entries to the `QUESTIONS` array in `trivia.js` or `WORDS` array in `hangman.js`.
