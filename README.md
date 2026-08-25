# Resell Buddy — Discord Bot

Always-on slash commands for testing (no payment required).

## Deploy on Railway (recommended)

1. Go to https://railway.app and sign in (GitHub is fine)
2. **New Project** → **Deploy from GitHub repo**
3. Select **hasansutcu08-dev/resell-buddy-bot**
4. **Variables** tab → add:

```
DISCORD_BOT_TOKEN=your_token
DISCORD_CLIENT_ID=1541927788603514921
DISCORD_GUILD_ID=1541876534670000219
```

5. Deploy. When logs show `ONLINE as Resell Buddy#5621`, use `/ping` in Discord.

## Local

```bash
cp .env.example .env
npm install
npm start
```

## Commands

`/ping` `/help` `/link` `/claimowner` `/status`  
`/monitor create|list|delete` `/alerts` `/demoalert` `/subscribe`
