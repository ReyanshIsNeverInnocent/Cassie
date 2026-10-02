<h1 align="center">Cassie</h1>

<p align="center">
  <em>A powerful, multi-instance Discord bot built for moderation, antinuke, and utility - with a clean Components V2 interface throughout.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-Supabase-00E599?style=flat-square&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
</p>

---

## About

**Cassie** is a feature-rich Discord bot focused on server management and safety. Every response uses Discord's **Components V2** format — no classic embeds for bot-generated UI. It supports multiple named instances (Main, Beta, etc.) running from the same codebase, process-level clustering via `discord-hybrid-sharding`, and a PostgreSQL data layer hosted on Neon.

Default prefix: `$` · Support server: [discord.gg/YpCfcCTXdv](https://discord.gg/YpCfcCTXdv)

---

## Features

### Moderation
A full moderation suite with DM notifications, audit-log reasons, and optional slash-command confirmation prompts.

| Command | Description |
|---|---|
| `$ban` / `$hackban` | Ban or force-ban (by ID) a user — DMs them before action |
| `$kick` | Kick a member with DM |
| `$timeout` / `$untimeout` | Timeout with duration strings (`1h30m`) — multi-select panel for bulk removal |
| `$unban` | Unban by ID or via interactive dropdown of all bans |
| `$warn` / `$warnings` / `$clearwarnings` | Warning system — stored in DB, DM on warn |
| `$strip` | Remove all roles from a member |
| `$lock` / `$unlock` / `$lockdown` | Per-channel or server-wide lockdown |
| `$purge` | 13+ subcommands: `all`, `bot`, `user`, `text`, `images`, `links`, `between`, and more |
| `$role` / `$roleadd` / `$roleremove` / `$roleall` | Role management with multi-select picker and batch assignment |
| `$nick` / `$massnick` | Nickname management — individual or mass |
| `$masskick` | Kick all members matching a filter |
| `$slowmode` | Set slowmode with human duration strings |
| `$snipe` / `$reactionsnipe` | View the last deleted message or reaction in a channel |
| `$hide` / `$unhide` / `$nsfw` | Channel visibility and NSFW toggles |
| `$delete-channel` / `$nuke` | Delete or nuke-recreate channels |

### Antinuke
Automatic protection against server nukes — no configuration required for baseline protection.

- **11 modules:** channel create/delete, role create/delete, dangerous role-update, ban spree, bot-add, mass kick, guild identity change, emoji delete, unauthorized webhooks
- **4 punishment types:** kick, ban, strip-roles, quarantine (auto-creates quarantine role on first use)
- **Per-module thresholds:** configurable count + time window
- **Whitelist:** users and roles exempt from punishment
- **Revert callbacks:** deleted channels/roles recreated, wrongful bans reversed
- Managed via `$antinuke` — status, modules, profiles (lockdown/strict/balanced/lenient), whitelist, logs

### Utility
| Command | Description |
|---|---|
| `$afk` | Set AFK (server or global scope) — auto-removed on next message, notifies on mention |
| `$userinfo` | 4-tab panel: About · Roles · Permissions · Assets |
| `$serverinfo` | 5-tab panel: Overview · Members · Channels · Security · Assets |
| `$avatar` / `$banner` | Shows server vs global variant picker |
| `$sticky` | Sticky messages that re-post on every new message — supports text, embeds, and CV2 |
| `$list` | Rich paginated list of roles, members, bots, emojis, stickers, channels, bans |
| `$embed` | Interactive classic-embed builder with live preview (title, fields, buttons, etc.) |
| `$container` | Interactive CV2 message builder — text, spacer, info card, photo grid, quick links |
| `$autoresponder` | Per-guild autoresponders with trigger/response management |
| `$autorole` | Auto-assign roles to new members and bots on join |
| `$alias` | Create personal shortcuts for any command |
| `$selfprefix` | Set a personal prefix that works alongside the server prefix |
| `$namestyle` | Set the bot's display-name style for this server |
| `$webhook` | Interactive webhook manager — create, send, rename, move, delete |
| `$vanity` | Look up a Discord vanity URL and check if it's taken |
| `$whoping` | See the last 10 messages that pinged you in this channel |
| `$archive` | Save recent channel messages to a `.txt` file sent to your DMs |
| `$purge-till` | Delete messages up to a specific message ID |
| `$firstmessage` | Jump to the very first message in a channel |

### Welcomer
- Configurable welcome messages with a full **placeholder system** (`${user_mention}`, `${server_member_count}`, etc.)
- Supports plain text, saved embed/CV2 payloads, or a combination
- Toggle bot-join greets independently

### Birthday System
- Users set their birthday globally — announced per-server on the day
- Per-server announcement channel and message (placeholder-aware, supports saved CV2 payloads)
- `$birthday list` — shows upcoming birthdays of members in the server
- Scheduler runs every 15 minutes; atomic DB claim prevents double-announcements across restarts

### Vanity Role System
- Two independent triggers: **custom status keyword** and **server tag**
- Auto-assigns / removes a configured role when the condition is met or lost
- Optional DM/channel announcement when a role is gained

### Logging System
- 7 log categories: `channel`, `member`, `role`, `vc`, `message`, `server`, `modlog`
- Per-category channel overrides, enable/disable toggles, and exception lists
- Modlogs automatically track ban, kick, timeout, warn, strip, nick, hackban, unban actions
- Configured via `$log` — inline or interactive panel

### Saved Data System
- Save reusable message / embed / CV2 payloads with `$create-data`
- Send, view, or delete them later via interactive dropdowns
- Used as the backend for welcomer messages, birthday announcements, sticky payloads, and the container builder

### Fun
`$ship` · `$gay` · `$simp` · `$howcute` · `$autistic` · `$intelligent` · `$rizz` · `$wanted` · `$whowouldwin` · `$tictactoe` · `$rps` (PvP or vs bot) · `$guessthenumber` · `$image` (DuckDuckGo image search)

### VC Controls
`$mute` · `$unmute` · `$deafen` · `$undeafen` · `$disconnect` · `$shift`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (ESM, ES2022 target) |
| Discord API | discord.js v14 |
| Clustering | discord-hybrid-sharding |
| Database | PostgreSQL on Neon (custom `Database` class) |
| Canvas | @napi-rs/canvas (ship images, rating cards) |
| Runtime | Node.js v18+ |

---

## Self-Hosting

### 1. Clone & install

```bash
git clone https://github.com/ReyanshIsNeverInnocent/cassie.git
cd cassie
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in the values:

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | Yes | Your bot's token |
| `DISCORD_CLIENT_ID` | Yes | Your application's client ID |
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string used by the bot |
| `DIRECT_DATABASE_URL` | No | Direct Neon connection used by migrations |
| `REDIS_URL` | No | Redis connection URL (`redis://` or `rediss://`) for the optional shared cache |
| `BOT_IDENTIFIER` | Yes | Separates documents for each bot instance |
| `MONGO_URI` | No | Legacy MongoDB source used only by `npm run migrate:postgres` |
| `READY_LOG_WEBHOOK_URL` | No | Webhook for ready-state logs |
| `SHARD_LOG_WEBHOOK_URL` | No | Webhook for shard lifecycle events |
| `JOIN_LEAVE_WEBHOOK_URL` | No | Webhook for guild join/leave events |
| `ERROR_LOG_WEBHOOK_URL` | No | Webhook for uncaught errors |
| `COMMAND_LOG_WEBHOOK_URL` | No | Webhook for command usage logs |

### 3. Build and run

```bash
npm run build && npm start
```

For development (no rebuild required):
```bash
npm run dev
```

### Optional Redis cache

PostgreSQL remains the durable source of truth. When `REDIS_URL` is configured, Cassie uses its 10-second in-process cache first, then Redis on local cache misses to share guild prefixes, disabled commands, and blacklist checks across cluster processes. If Redis is unset or unavailable, the bot falls back to PostgreSQL. Redis is not required to run Cassie.

Use a private Redis instance and keep its URL/password secret. For TLS-enabled hosted Redis, use the `rediss://` URL provided by the host.

The bot's cluster 0 publishes an aggregated website stats snapshot to Cloudflare Workers KV at `cassie:website:stats:v1` every 30 seconds with a 15-minute expiry. Set `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID`, and `CF_KV_WRITE_TOKEN` on the bot host. Website stats use KV; Redis remains for the bot's shared database cache.

### Required Discord intents & permissions

**Privileged intents** (must be enabled in the Developer Portal):
- Server Members Intent
- Message Content Intent
- Presence Intent (for Vanity Role status trigger)

**Bot permissions:** `Administrator` is recommended for full functionality. At minimum: `Manage Guild`, `Manage Roles`, `Manage Channels`, `Ban Members`, `Kick Members`, `Moderate Members`, `Manage Messages`, `Read Message History`, `Send Messages`, `View Channels`.

---

## Architecture Overview

```
index.ts                  ← ClusterManager entry point
dior/
  cassie.ts             ← Per-cluster bootstrap (login → ready)
  config.ts               ← Central runtime configuration
  commands/               ← Prefix + slash execute logic (by category)
  slashCommands/          ← Slash command builder definitions only
  components/             ← All CV2 payload builders
  events/discord/         ← discord.js event handlers
  helpers/                ← Helper factories loaded into client.helpers
  utils/                  ← Formatting, webhook logger, etc.
  database/               ← PostgreSQL interface and migration adapter
  config/                 ← Bot instances, categories, antinuke modules
  structures/             ← CassieClient, StatusManager
```

All user-visible responses use Discord's **Components V2** format (`MessageFlags.IsComponentsV2`). CV2 builders live exclusively in `dior/components/` — never inline in command files.

---

## License

[MIT](LICENSE) © 2026 Reyansh
