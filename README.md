<div align="center">

# Cassie

### Your server's little multitool.

Moderation, music, server protection, games, and a bunch of useful little things.

<p>
  <img src="https://img.shields.io/badge/discord.js-v14-75658F?style=flat-square&logo=discord&logoColor=white" alt="discord.js v14">
  <img src="https://img.shields.io/badge/TypeScript-6.0.3-617F9C?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 6.0.3">
  <img src="https://img.shields.io/badge/PostgreSQL-Supabase-64877C?style=flat-square" alt="PostgreSQL Supabase">
  <img src="https://img.shields.io/badge/license-MIT-A17A8B?style=flat-square" alt="MIT License">
</p>

</div>

<p align="center">
  <img src="https://i.ibb.co/cSLhmbpN/image-3.png" alt="Cassie banner" width="70%">
</p>

## So, what is Cassie?

Cassie is a Discord bot for doing the server stuff, fun stuff, and "wait, is there a command for that?" stuff. She supports both prefix and slash commands, plus interactive menus.

The default prefix is `$`. Need a hand? [Come say hi](https://discord.gg/YpCfcCTXdv).

## What she does

| Category | What you can do |
|---|---|
| Keep things in check | Moderation, antinuke, and logs |
| Make it feel like home | Welcome messages, birthdays, reaction roles, and autoroles |
| Put something on | Music, queues, and voice controls |
| Get stuff done | Server and user info, custom responses, and handy utilities |
| Mess around | Games, social commands, and image cards |

## Want to run Cassie yourself?

You'll need **Node.js 18+**, a Discord bot application, and a **PostgreSQL** database.

Grab the code and install the dependencies:

```bash
git clone https://github.com/ReyanshIsNeverInnocent/Cassie.git
cd Cassie
npm install
```

Add a `.env` file in the project folder:

```env
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
DATABASE_URL=your_postgresql_connection_string
BOT_IDENTIFIER=cassie
```

Build it, then start it:

```bash
npm run build
npm start
```

For local development, `npm run dev` does both. In the Discord Developer Portal, turn on **Server Members** and **Message Content** intents. **Presence** is only needed for status-based vanity roles.

Give the bot the permissions it needs for the features you want to use. Moderation and role tools need their matching Discord permissions.

## Make it yours

- **Bot name and status:** `dior/config/botInstances.ts`
- **Prefix and links:** `dior/config.ts`
- **Redis cache:** optional. Set `REDIS_URL` if you want shared caching. PostgreSQL still stores the data.
- **Log webhooks:** optional `READY_LOG_WEBHOOK_URL`, `SHARD_LOG_WEBHOOK_URL`, `JOIN_LEAVE_WEBHOOK_URL`, `ERROR_LOG_WEBHOOK_URL`, and `COMMAND_LOG_WEBHOOK_URL`
- **Extra integrations:** optional API keys for image hosting, movie info, music lookups, and IP checks
- **MongoDB migration:** `MONGO_URI` and `DIRECT_DATABASE_URL` are only used by `npm run migrate:postgres`

Keep your tokens and API keys private. Please don't commit your `.env` file.

## If you're poking around the code

```text
index.ts                 Starts the bot's clusters
dior/
  commands/              Prefix commands
  slashCommands/         Slash command definitions
  components/            Interactive menus and messages
  events/                Discord and music events
  database/              PostgreSQL and optional Redis
  config/                Bot instances and settings
```

## License

MIT. Do what you like, just check the [license](LICENSE).
