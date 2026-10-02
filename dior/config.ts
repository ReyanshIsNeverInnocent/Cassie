// xoxo/config.ts
//
// Central runtime configuration for the bot.
//
// File layout (top → bottom):
//   1.  Bot identity       — token, clientId, prefix, language       (env-driven)
//   2.  Developers         — owner / co-owner list
//   3.  Display labels     — strings shown in the debug menu
//   4.  Notes channel      — `note` dev command target + divider
//   5.  Embed color        — fallback embed accent color
//   6.  Links              — public links (support server, etc.)
//   7.  Webhooks           — log-channel webhook URLs                 (env-driven)
//   8.  Default presence   — fallback presence when no botInstances
//                            entry matches the running clientId
//
// Per-bot status / presence config lives in `xoxo/config/botInstances.ts`.
// Hosting IP → display-name map lives in `xoxo/config/hostingServices.ts`.
// Debug-command tunables live in `xoxo/config/debugConfig.ts`.

import "dotenv/config";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Config {
  // 1. Bot identity
  /** Display name of this bot — used everywhere instead of hardcoding. */
  botName: string;
  /** Discord bot token (from env). */
  botToken: string | undefined;
  /** Discord application / client ID (from env). */
  clientId: string | undefined;
  /** Default text-command prefix. */
  prefix: string;
  /** Programming language label shown in the debug menu. */
  language: string;

  // 2. Developers
  /** `[name, id][]` — first entry is treated as the MAIN developer. */
  developers: [string, string][];
  /** Guild IDs used by the developer-only emoji upload command. */
  emojiServerIds: [string, string, string];

  // 3. Display labels
  /**
   * Hosting service display override. When non-empty, this value is shown
   * as the hosting provider everywhere (debug menu, ready webhook, etc.)
   * and the IP-matching table in `xoxo/config/hostingServices.ts` is bypassed.
   * Set to "" to use automatic IP-based detection.
   */
  hardcodeHostingService: string;
  /**
   * Fallback hosting provider label. Used when `hardcodeHostingService` is
   * "" (empty) AND the fetched public IP doesn't match any entry in
   * `xoxo/config/hostingServices.ts`.
   */
  fallbackHostingService: string;
  /** Database provider label shown in the debug menu. */
  databaseProvider: string;

  // 4. Notes channel
  /** Channel ID where the dev-only `note` command posts notes. */
  notesChannelId: string;
  /** Plain-text divider message sent after every `note` post. */
  noteDivider: string;

  // 4b. Saved data channel
  /** Channel ID where the `create` command stores saved message/embed/cv2 payloads. */
  savedDataChannelId: string;
  /** Channel ID where $serverlist posts an embed per guild the bot is in. */
  serverListChannelId: string;
  /** Plain-text divider message sent after every saved-data post and every sticky-data upload. */
  dataDivider: string;
  /** Channel ID where deleted saved-data entries are logged. */
  deletedDataChannelId: string;
  /** Channel ID where sticky payload files are archived when a sticky is set. */
  stickyDataChannelId: string;
  /** Plain-text divider message sent after every sticky-data upload. */
  stickyDataDivider: string;

  // 5. Embed color
  /** Default embed accent color (hex). */
  embedColor: string;
  /** Default accent color for Components V2 messages and message-style panels (hex). */
  defaultAccentColor: string;

  // 6. Links
  /** Public support server invite URL. */
  supportServer: string;
  /** Support server guild ID — its saved name style is used as the default for all other guilds. */
  supportServerId: string;

  // 7. Webhooks (env-driven; any may be undefined)
  webhooks: {
    readyLog: string | undefined;
    shardLog: string | undefined;
    joinLeave: string | undefined;
    errorLog: string | undefined;
    commandLog: string | undefined;
  };

  // 8. Music
  /**
   * Default Lavalink search prefix used when the user's query is plain text
   * (not a URL and not already prefixed).
   *   "ytsearch"  — YouTube
   *   "ytmsearch" — YouTube Music
   *   "scsearch"  — SoundCloud
   *   "spsearch"  — Spotify     (requires LavaSrc on the node)
   *   "dzsearch"  — Deezer      (requires LavaSrc on the node)
   *   "jssearch"  — JioSaavn    (requires the JioSaavn plugin on the node)
   */
  defaultSource: string;
  /** Lavalink node connection list. */
  nodes: Array<{
    host: string;
    port: number;
    name: string;
    auth: string;
    secure: boolean;
  }>;
  /** Song metadata and display volume used by `nowplaying sample` / `test`. */
  sampleNowPlaying: {
    title: string;
    artist: string;
    volume: number;
  };
  /** Image shown on the `filter help` / `filter available` guide. */
  filterHelpImageUrl: string;
  /** A custom banner image for the VoiceMaster CV2 panel. Set to a direct image URL when you want a custom header. */
  voicemasterImageUrl: string;
  // 9. Default presence
  /**
   * Fallback presence — applied only when no entry in
   * `xoxo/config/botInstances.ts` matches the running clientId.
   */
  defaultPresence: {
    name: string;
    type: string;
    status: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bot name (named export — imported directly by many modules)
// ─────────────────────────────────────────────────────────────────────────────

export const botName = "Cassie";

/** Canonical bot invite link — no extra permission/scope query params. */
export function getInviteUrl(clientId: string | undefined | null): string | null {
  if (!clientId) return null;
  return `https://discord.com/oauth2/authorize?client_id=${clientId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

export const config: Config = {
  // ── 1. Bot identity ────────────────────────────────────────────────────────
  botName,
  botToken: process.env["DISCORD_TOKEN"],
  clientId: process.env["DISCORD_CLIENT_ID"],
  prefix: "$",
  language: "TypeScript",

  // ── 2. Developers ──────────────────────────────────────────────────────────
  // The first entry is treated as the MAIN developer wherever needed.
  developers: [["Reyansh", "922491166149214218"]],
  // Set these to the three guilds that store emojis.
  emojiServerIds: [
    "1068184193093349376",
    "946257905877913610",
    "1537811128657383485",
  ],

  // ── 3. Display labels ──────────────────────────────────────────────────────
  // Leave hardcodeHostingService as "" to fall back to IP-based detection
  // from xoxo/config/hostingServices.ts.
  hardcodeHostingService: "",
  // Shown when hardcodeHostingService is "" and the public IP doesn't match
  // any entry in xoxo/config/hostingServices.ts.
  fallbackHostingService: "Novalunosis-XIV (local)",
  databaseProvider: "Supabase Postgres",

  // ── 4. Notes channel ───────────────────────────────────────────────────────
  notesChannelId: "1521510471276957837",
  noteDivider:
    "**. ݁₊ ⊹ . ݁ ⟡ ݁ . ⊹ ₊ ݁.. ݁₊ ⊹ . ݁ ⟡ ݁ . ⊹ ₊ ݁.. ݁₊ ⊹ . ݁ ⟡ ݁ . ⊹ ₊ ݁.**",

  // ── 4b. Saved data channel ─────────────────────────────────────────────────
  // Channel where $create stores message/embed/cv2 payloads as files.
  savedDataChannelId: "1520465483495641250",
  // Channel where $serverlist posts an embed per guild the bot is in.
  serverListChannelId: "1522111035228819597",
  dataDivider:
    "**︶︶₊˚꒷︶︶꒷꒦♡₊˚ ︶︶₊˚꒷︶︶꒷꒦♡₊˚ ︶︶₊˚꒷︶︶꒷꒦♡₊˚**",
  // Channel where deleted saved-data entries are logged.
  deletedDataChannelId: "1520495793268850760",
  // Channel where sticky payload files are stored when a sticky is set.
  stickyDataChannelId: "1521487031279157299",
  stickyDataDivider:
    "**︶︶₊˚꒷︶︶꒷꒦♡₊˚ ︶︶₊˚꒷︶︶꒷꒦♡₊˚ ︶︶₊˚꒷︶︶꒷꒦♡₊˚**",

  // ── 5. Embed color ─────────────────────────────────────────────────────────
  embedColor: "#b4f8c8",
  defaultAccentColor: "#F5CBCB",

  // ── 6. Links ───────────────────────────────────────────────────────────────
  supportServer: "https://discord.gg/YpCfcCTXdv",
  supportServerId: "1493286181885050961",

  // ── 7. Webhooks (from .env) ────────────────────────────────────────────────
  webhooks: {
    readyLog: process.env["READY_LOG_WEBHOOK_URL"],
    shardLog: process.env["SHARD_LOG_WEBHOOK_URL"],
    joinLeave: process.env["JOIN_LEAVE_WEBHOOK_URL"],
    errorLog: process.env["ERROR_LOG_WEBHOOK_URL"],
    commandLog: process.env["COMMAND_LOG_WEBHOOK_URL"],
  },

  // ── 8b. Music ──────────────────────────────────────────────────────────────
  defaultSource: 'ytsearch',
  nodes: [
    /* {
      host:   'merlion.endercloud.in',
      port:   46573,
      name:   'Merlion',
      auth:   'youshallnotpass',
      secure: false,
    }, */
    {
      host:   'lavalinkv4.serenetia.com',
      port:   443,
      name:   'Serenetia',
      auth:   'https://seretia.link/discord',
      secure: true,
    },
    {
      host:   'lavalink.jirayu.net',
      port:   13592,
      name:   'Jirayu',
      auth:   'youshallnotpass',
      secure: false,
    },
  ],
  // ── 8c. Now-playing sample ─────────────────────────────────────────────────
  // Set only the song identity and preview volume here. Duration, artwork,
  // URL, and other track data are fetched from the music search result.
  sampleNowPlaying: {
    title: 'Call Out My Name',
    artist: 'The Weeknd',
    volume: 67,
  },
  filterHelpImageUrl: 'https://i.ibb.co/gLryQTK4/Vinyl-aesthetic-music-1.jpg',
  voicemasterImageUrl: 'https://i.ibb.co/0pGmGqTw/Better-Voicemaster-Image.png',

  // ── 8. Default presence ────────────────────────────────────────────────────
  // Fallback only — used when no botInstances.ts entry matches the running
  // clientId. Per-bot presences are defined in xoxo/config/botInstances.ts.
  defaultPresence: {
    name: "/help | {guilds} Guilds",
    type: "Listening",
    status: "idle",
  },
};

export default config;
