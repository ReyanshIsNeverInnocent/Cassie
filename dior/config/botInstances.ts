// xoxo/config/botInstances.ts
//
// Per-bot status / presence configuration consumed by StatusManager.
//
// Each entry in `botInstances` maps a Discord clientId to a complete
// description of how that specific bot should appear:
//
//   • `displayStatus` — the gateway status pill ("online" / "idle" / "dnd" /
//     "invisible") OR a special device hint: "mobile", "web", or "vr". Device
//     hints can only be installed at gateway IDENTIFY time, so if you mix one
//     into an array, the device icon is decided by the FIRST value at boot and
//     cannot change later.
//
//   • `mode` — what kind of thing this bot displays:
//       - "presence" → an activity ("Listening to ...", "Watching ...", etc.)
//       - "status"   → a Custom Status ("emoji + text" on the user popup)
//
//   • `statusEntries`   — list used when mode === "status".   Each is { text }.
//   • `presenceEntries` — list used when mode === "presence". Each is
//     { activityType, text, streamUrl? }. `streamUrl` is required when
//     `activityType === "Streaming"` (must be a valid Twitch URL).
//
//   • `statusRotation`   — "single" → only first entry is applied;
//                          "multi"  → cycles through statusEntries.
//   • `presenceRotation` — same semantics for presenceEntries.
//
// `name` is the human-readable label printed under the [STATUS] log tag at
// startup so you can see which instance config kicked in for the current
// process. Also forwarded to the ready-log webhook.
//
// `text` supports placeholders: {guilds}, {users}, {botName}.

import type { ActivityType as _ActivityType } from "discord.js";

/** How long (ms) StatusManager waits between entries when a rotation is "multi". */
export const ROTATION_INTERVAL_MS = 10101;

export type DisplayStatus = "online" | "idle" | "dnd" | "invisible" | "mobile" | "web" | "vr";
export type DisplayMode = "presence" | "status";
export type RotationMode = "single" | "multi";
export type ActivityKind =
  | "Playing"
  | "Listening"
  | "Watching"
  | "Competing"
  | "Streaming"
  | "Custom";

export interface StatusOnlyEntry {
  /** The visible text shown on the Custom Status popup. */
  text: string;
}

export interface PresenceOnlyEntry {
  /** The visible text — required. */
  text: string;
  /** ActivityType keyword. Defaults to "Playing". */
  activityType?: ActivityKind;
  /** Required only when `activityType === 'Streaming'`. Must be a valid Twitch URL. */
  streamUrl?: string;
}

export interface BotInstance {
  /** Friendly label used in debug-menu "Build" line + identifies which file this is. */
  buildName: string;
  /** Discord clientId — matched against `process.env.DISCORD_CLIENT_ID` at boot. */
  clientId: string;
  /** Short label printed at startup under the `[STATUS]` log tag. */
  name: string;
  /** A single status pill OR an array (rotated). */
  displayStatus: DisplayStatus | DisplayStatus[];
  /** Which family is applied: "status" → statusEntries, "presence" → presenceEntries. */
  mode: DisplayMode;
  /** Rotation behaviour for statusEntries. Default: "single". */
  statusRotation?: RotationMode;
  /** Rotation behaviour for presenceEntries. Default: "single". */
  presenceRotation?: RotationMode;
  /** Status-mode entries. Required when mode === "status" (and at least one). */
  statusEntries?: StatusOnlyEntry[];
  /** Presence-mode entries. Required when mode === "presence" (and at least one). */
  presenceEntries?: PresenceOnlyEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Bot instance table.
// ─────────────────────────────────────────────────────────────────────────────

export const botInstances: BotInstance[] = [
  {
    buildName: "Cassie",
    clientId: "956120503523889172",
    name: "Main",
    displayStatus: "vr",
    mode: "status",
    presenceRotation: "multi",
    presenceEntries: [
      {
        activityType: "Listening",
        text: "/help | {guilds} Guilds | {users} Users",
      },
      { activityType: "Watching", text: "XO Tour '26" },
      { activityType: "Playing", text: "with my heart" },
      { activityType: "Playing", text: "Stray Kids!" },
    ],
    statusRotation: "multi",
    statusEntries: [
      { text: "In God We Trust." },
      { text: "💗 feeling cute" },
      { text: "✨ When the sun goes down, and the moon comes up!" },
      { text: "Screwing with {users} people." },
      { text: "Devil is a lie." },
      { text: "\"Thirty four, thirty fiveeee\" ~Ariana Grande" },
      { text: "Dear Lord, when I get to Heaven, Please, LET ME BRING MY MAN!" },
      { text: "Goddamn bitch, I am not a Teen Choice."},
      { text: " XOXO "},
    ],
  },
  {
    buildName: "Sin (Testing)",
    clientId: "1542129160346935336",
    name: "TEST",
    displayStatus: "dnd",
    mode: "status",
    presenceRotation: "single",
    presenceEntries: [
      { activityType: "Listening", text: "$!help | {guilds} Servers" },
    ],
    statusRotation: "multi",
    statusEntries: [
      { text: "One time for my LA sisters," },
      { text: "ONE TIME FOR MY LA HOES," },
      { text: "Lame niggas can't tell the difference." },
      { text: "ONE TIME FOR A NIGGA WHO KNOWS!" },
      { text: "Don't save her, she don't wanna be saved." },
      { text: "Don't save her, she don't wanna be saved." },
      { text: "Don't save her, she don't wanna be saved." },
      { text: "Don't save her, she don't wanna be saved." },
    ],
  },
  {
    buildName: "Nomadic (TheThird)",
    clientId: "1457601829738250301",
    name: "TheThird",
    displayStatus: "dnd",
    mode: "presence",
    presenceRotation: "single",
    presenceEntries: [
      {
        activityType: "Streaming",
        text: "music in {guilds} servers",
        streamUrl: "https://www.twitch.tv/discord",
      },
    ],
  },
  {
    buildName: "BETA version of Nomadic",
    clientId: "1442787596131373166",
    name: "BETA",
    displayStatus: "dnd",
    mode: "presence",
    presenceRotation: "single",
    presenceEntries: [
      { activityType: "Playing", text: "BETA Version of Nomadic" },
    ],
  },
];

/** Find the instance whose clientId matches the given id. */
export function findBotInstanceByClientId(
  clientId: string | null | undefined,
): BotInstance | null {
  if (!clientId) return null;
  return botInstances.find((b) => b.clientId === clientId) ?? null;
}

/** Helper: returns the first displayStatus value (always a single value). */
export function firstDisplayStatus(inst: BotInstance): DisplayStatus {
  return Array.isArray(inst.displayStatus)
    ? inst.displayStatus[0]
    : inst.displayStatus;
}

/** Helper: returns true if the instance has a "mobile" display status anywhere. */
export function instanceUsesMobile(inst: BotInstance): boolean {
  const ds = inst.displayStatus;
  if (Array.isArray(ds)) return ds.includes("mobile");
  return ds === "mobile";
}

/** Helper: returns true if the instance has a "web" display status anywhere. */
export function instanceUsesWeb(inst: BotInstance): boolean {
  const ds = inst.displayStatus;
  if (Array.isArray(ds)) return ds.includes("web");
  return ds === "web";
}

/** Helper: returns true if the instance has a "vr" display status anywhere. */
export function instanceUsesVR(inst: BotInstance): boolean {
  const ds = inst.displayStatus;
  if (Array.isArray(ds)) return ds.includes("vr");
  return ds === "vr";
}

// Re-export ActivityType for callers that already know they want it.
export type { _ActivityType as ActivityType };
