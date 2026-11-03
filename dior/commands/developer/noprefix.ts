// xoxo/commands/developer/noprefix.ts
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';
import { sendWrongUsage } from '../../components/wrongUsage.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { buildNoprefixListPayload } from '../../components/settings/noprefixList.js';
import { escapeMarkdown } from '../../utils/formatting.js';
import { sendNoprefixStatus } from '../settings/noprefix.js';

export const options = {
  name: 'glnoprefix',
  aliases: ['gnop'] as string[],
  description: 'Manage no-prefix access.',
  usage: `noprefix add <user> [duration]   — e.g. 30m 2h 7d 1mo 1y (omit for permanent)
  noprefix remove <user>
  noprefix extend <user> <duration>
  noprefix makeperm <user>
  noprefix list
  noprefix status <user>
  noprefix enable / disable
  noprefix server enable/disable/list [server id]`,
  category: 'developer',
  owner: true,
  cooldown: 0,
};

// ── Duration parser ────────────────────────────────────────────────────────────
// Accepts: 30m, 2h, 7d, 1mo, 1y, 1dec, 30min, 2hrs, 7days, 1month, 2months, 1year, 1decade
// Returns seconds, or null on parse failure.
// Max: 10 decades (315,360,000 seconds).

const MAX_NOPREFIX_SECONDS = 10 * 10 * 365 * 24 * 60 * 60; // 10 decades

export function parseDuration(raw: string): number | null {
  if (!raw) return null;

  const s = raw.trim().toLowerCase();

  // Named shorthands
  const named: Record<string, number> = {
    'perm': 0, 'permanent': 0, 'forever': 0,
  };
  if (named[s] !== undefined) return named[s];

  // Numeric pattern: <number><unit>
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(dec|decade|decades|mo|month|months|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks|y|yr|yrs|year|years)$/);
  if (!match) return null;

  const value = parseFloat(match[1]!);
  const unit  = match[2]!;

  const secondsMap: Record<string, number> = {
    dec: 10 * 365 * 24 * 3600, decade: 10 * 365 * 24 * 3600, decades: 10 * 365 * 24 * 3600,
    mo: 60 * 60 * 24 * 30, month: 60 * 60 * 24 * 30, months: 60 * 60 * 24 * 30,
    m: 60, min: 60, mins: 60, minute: 60, minutes: 60,
    h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600,
    d: 86400, day: 86400, days: 86400,
    w: 604800, week: 604800, weeks: 604800,
    y: 31536000, yr: 31536000, yrs: 31536000, year: 31536000, years: 31536000,
  };

  const mult = secondsMap[unit];
  if (mult === undefined) return null;

  const result = Math.round(value * mult);
  if (result > MAX_NOPREFIX_SECONDS) return null;
  return result;
}

function formatExpiry(expiresAt: Date | null | undefined): string {
  if (!expiresAt) return '**Permanent**';
  const s = Math.floor(expiresAt.getTime() / 1000);
  return `<t:${s}:R> (<t:${s}:f>)`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function resolveTargetUserId(message: any, args: string[], client: CassieClient, offset = 1): Promise<string | null> {
  const rawTarget = args.slice(offset).join(' ').trim();
  if (!rawTarget) return null;
  // Try just the first token for user resolution (rest may be the duration)
  const user = await resolveUser(client, message.guild, args[offset] ?? '');
  return user?.id ?? null;
}

function resolveGuildId(message: any, maybeGuildId?: string): string | null {
  if (!maybeGuildId) return message.guild?.id ?? null;
  return /^\d{17,20}$/.test(maybeGuildId) ? maybeGuildId : null;
}

function formatGuild(client: CassieClient, guildId: string): string {
  const guild = client.guilds.cache.get(guildId);
  if (guild) return `${escapeMarkdown(guild.name)} (${guildId})`;
  return guildId;
}

// ── Subcommand handlers ───────────────────────────────────────────────────────

async function handleList(message: any, client: CassieClient) {
  const users = await client.db.getNoPrefixUsers();
  const now   = Date.now();
  const lines = await Promise.all(users.map(async (entry: any) => {
    const user = await client.users.fetch(entry.user_id).catch((): null => null);
    const tag  = user ? `${user.tag} (${entry.user_id})` : entry.user_id;
    const exp  = entry.expiresAt
      ? (entry.expiresAt.getTime() < now
          ? `~~${tag}~~ (expired)`
          : `${tag} — expires <t:${Math.floor(entry.expiresAt.getTime() / 1000)}:R>`)
      : `${tag} — Permanent`;
    return exp;
  }));
  await message.channel.send(
    buildNoprefixListPayload(
      'Noprefix Users list',
      lines,
      'Total users',
      'No users have noprefix access (except the developers).',
    ) as any,
  );
}

async function handleServerList(message: any, client: CassieClient) {
  const guilds = await client.db.getNoPrefixDisabledGuilds();
  const lines  = guilds.map((entry: any) => {
    const guild = client.guilds.cache.get(entry.guild_id);
    return guild ? `${escapeMarkdown(guild.name)} (${entry.guild_id})` : entry.guild_id;
  });
  await message.channel.send(
    buildNoprefixListPayload(
      'Noprefix Disabled Servers list',
      lines,
      'Total disabled servers',
      "Noprefix hasn't been disabled in any servers.",
    ) as any,
  );
}

async function handleServer(message: any, args: string[], client: CassieClient) {
  const action = args[1]?.toLowerCase();
  if (action === 'list') {
    if (args.length !== 2) return sendWrongUsage({ message, client }, options.name, options.usage);
    return handleServerList(message, client);
  }
  if (!['enable', 'disable'].includes(action)) {
    return sendWrongUsage({ message, client }, options.name, options.usage);
  }
  if (args.length > 3) return sendWrongUsage({ message, client }, options.name, options.usage);
  const guildId = resolveGuildId(message, args[2]);
  if (!guildId) return sendError({ message }, 'Please provide a valid server ID.');
  const label             = formatGuild(client, guildId);
  const isCurrentlyDisabled = await client.db.isGuildNoPrefixDisabled(guildId);
  if (action === 'enable') {
    if (!isCurrentlyDisabled) return sendInfo({ message }, `Noprefix is already enabled in **${label}**.`);
    await client.db.enableGuildNoPrefix(guildId);
    return sendSuccess({ message }, `Noprefix has been enabled in **${label}**.`);
  }
  if (isCurrentlyDisabled) return sendInfo({ message }, `Noprefix is already disabled in **${label}**.`);
  await client.db.disableGuildNoPrefix(guildId, message.author.id);
  return sendSuccess({ message }, `Noprefix has been disabled in **${label}**.`);
}

// ── Main execute ──────────────────────────────────────────────────────────────

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  if (args.length === 0) return sendWrongUsage({ message, client }, options.name, options.usage);

  const action = args[0]?.toLowerCase();

  if (action === 'status') {
    const target = await resolveUser(client, message.guild, args[1] ?? '');
    if (!target || args.length !== 2) return sendError({ message }, 'Please provide one valid user ID, mention, or username.');
    const isDeveloper = client.config.developers.some(([, id]: [string, string]) => id === target.id);
    return sendNoprefixStatus(message, client, isDeveloper, target.id, target);
  }

  // ── add ────────────────────────────────────────────────────────────────────
  if (action === 'add') {
    if (args.length < 2 || args.length > 3) return sendWrongUsage({ message, client }, options.name, options.usage);
    const userId = await resolveTargetUserId(message, args, client);
    if (!userId) return sendError({ message }, 'Please provide a valid user ID, mention, or username.');

    // Optional duration — args[2] (args[1] is the user)
    let expiresAt: Date | null = null;
    const rawDur = args[2];
    if (rawDur) {
      const secs = parseDuration(rawDur);
      if (secs === null) {
        return sendError({ message }, `Invalid duration \`${rawDur}\`. Examples: \`30m\`, \`2h\`, \`7d\`, \`1mo\`, \`1y\``);
      }
      if (secs === 0 && !/^(perm|permanent|forever)$/i.test(rawDur.trim())) {
        return sendError({ message }, 'A numeric duration must be greater than zero. Use `perm` for permanent access.');
      }
      expiresAt = secs === 0 ? null : new Date(Date.now() + secs * 1000);
    }

    const alreadyAdded = await client.db.isNoPrefixUser(userId);
    if (alreadyAdded) {
      // Update expiry only
      await client.db.addNoPrefixUser(userId, message.author.id, expiresAt);
      return sendSuccess({ message }, `<@${userId}> already had noprefix — expiry updated to ${formatExpiry(expiresAt)}.`);
    }
    await client.db.addNoPrefixUser(userId, message.author.id, expiresAt);
    return sendSuccess({ message }, `Noprefix access added for <@${userId}>.\nExpires: ${formatExpiry(expiresAt)}`);
  }

  // ── remove ─────────────────────────────────────────────────────────────────
  if (action === 'remove') {
    if (args.length !== 2) return sendWrongUsage({ message, client }, options.name, options.usage);
    const userId = await resolveTargetUserId(message, args, client);
    if (!userId) return sendError({ message }, 'Please provide a valid user ID, mention, or username.');
    const removed = await client.db.removeNoPrefixUser(userId);
    if (!removed) return sendError({ message }, `<@${userId}> is not in the noprefix list.`);
    return sendSuccess({ message }, `Noprefix access has been removed from <@${userId}>.`);
  }

  // ── extend ─────────────────────────────────────────────────────────────────
  if (action === 'extend') {
    if (args.length !== 3) return sendWrongUsage({ message, client }, options.name, options.usage);
    const userId = await resolveTargetUserId(message, args, client);
    if (!userId) return sendError({ message }, 'Please provide a valid user ID, mention, or username.');

    const rawDur = args[2];
    if (!rawDur) return sendError({ message }, 'Please provide a duration to extend by. Example: `extend @user 7d`');
    const secs = parseDuration(rawDur);
    if (!secs) return sendError({ message }, `Invalid duration \`${rawDur}\`. Examples: \`30m\`, \`2h\`, \`7d\`, \`1mo\`, \`1y\``);

    const entry = await client.db.getNoPrefixUserEntry(userId);
    if (!entry) return sendError({ message }, `<@${userId}> is not in the noprefix list.`);

    const base     = entry.expiresAt && entry.expiresAt.getTime() > Date.now()
      ? entry.expiresAt.getTime()
      : Date.now();
    const newExpiry = new Date(base + secs * 1000);

    await client.db.addNoPrefixUser(userId, entry.addedBy, newExpiry);
    return sendSuccess({ message }, `<@${userId}> noprefix extended. New expiry: ${formatExpiry(newExpiry)}.`);
  }

  // ── makeperm ───────────────────────────────────────────────────────────────
  if (action === 'makeperm' || action === 'permanent' || action === 'perm') {
    if (args.length !== 2) return sendWrongUsage({ message, client }, options.name, options.usage);
    const userId = await resolveTargetUserId(message, args, client);
    if (!userId) return sendError({ message }, 'Please provide a valid user ID, mention, or username.');
    const entry = await client.db.getNoPrefixUserEntry(userId);
    if (!entry) return sendError({ message }, `<@${userId}> is not in the noprefix list.`);
    if (!entry.expiresAt) return sendInfo({ message }, `<@${userId}> already has permanent noprefix access.`);
    await client.db.addNoPrefixUser(userId, entry.addedBy, null);
    return sendSuccess({ message }, `<@${userId}> noprefix access is now **permanent**.`);
  }

  // ── list ───────────────────────────────────────────────────────────────────
  if (action === 'list') return handleList(message, client);

  // ── enable / disable ───────────────────────────────────────────────────────
  if (action === 'enable') {
    const alreadyEnabled = await client.db.getNoprefixGlobalEnabled();
    if (alreadyEnabled) return sendInfo({ message }, 'Noprefix is already globally enabled.');
    await client.db.setNoprefixGlobalEnabled(true);
    return sendSuccess({ message }, 'Noprefix has been globally enabled.');
  }

  if (action === 'disable') {
    const alreadyEnabled = await client.db.getNoprefixGlobalEnabled();
    if (!alreadyEnabled) return sendInfo({ message }, 'Noprefix is already globally disabled.');
    await client.db.setNoprefixGlobalEnabled(false);
    return sendSuccess({ message }, 'Noprefix has been globally disabled.');
  }

  if (action === 'server') return handleServer(message, args, client);

  return sendWrongUsage({ message, client }, options.name, options.usage);
}
