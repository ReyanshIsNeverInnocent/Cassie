import { PermissionFlagsBits } from 'discord.js';
import type { CassieClient } from '../structures/CassieClient.js';
import { sendError, sendSuccess } from '../components/statusMessages.js';
import { resolveUser } from './userResolver.js';

type TextLockMode = 'uwu' | 'freaky';

const CACHE_TTL_MS = 3_000;
const WEBHOOK_NAME = 'Cassie Text Lock';
const lockCache = new Map<string, { mode: TextLockMode | null; expiresAt: number }>();
const webhookCache = new Map<string, Promise<any>>();
const warningTimes = new Map<string, number>();

function lockKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function logThrottled(key: string, message: string): void {
  const now = Date.now();
  if ((warningTimes.get(key) ?? 0) > now - 60_000) return;
  warningTimes.set(key, now);
  console.error(message);
}

async function getTextLock(
  client: CassieClient,
  guildId: string,
  userId: string,
): Promise<TextLockMode | null> {
  const key = lockKey(guildId, userId);
  const cached = lockCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.mode;

  const lock = await client.db.getTextMessageLock(guildId, userId);
  const mode = lock?.mode ?? null;
  if (lockCache.size >= 10_000) {
    const now = Date.now();
    for (const [cacheKey, entry] of lockCache) {
      if (entry.expiresAt <= now) lockCache.delete(cacheKey);
    }
  }
  lockCache.set(key, { mode, expiresAt: Date.now() + CACHE_TTL_MS });
  return mode;
}

export async function executeTextLockCommand(
  context: { message?: any; interaction?: any },
  client: CassieClient,
  mode: TextLockMode,
  fallbackUserArg = '',
): Promise<any> {
  const isInteraction = !!context.interaction;
  const guild = isInteraction ? context.interaction.guild : context.message.guild;
  const actor = isInteraction ? context.interaction.user : context.message.author;
  const member = isInteraction ? context.interaction.member : context.message.member;
  const channel = isInteraction ? context.interaction.channel : context.message.channel;
  const ctx = context;

  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const isDeveloper = client.config.developers.some(([, id]: [string, string]) => id === actor.id);
  const isOwner = actor.id === guild.ownerId;
  if (!isDeveloper && !isOwner && !member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
    return sendError(ctx, 'Only server administrators, the server owner, or a bot developer can use this command.');
  }

  const userArg = isInteraction
    ? context.interaction.options.getUser('user', true).id
    : context.message.commandRawArgs?.match(/^\s*(?:"([^"]+)"|'([^']+)'|(\S+))/)?.slice(1).find(Boolean) ?? fallbackUserArg;
  const targetUser = isInteraction
    ? context.interaction.options.getUser('user', true)
    : await resolveUser(client, guild, userArg);
  if (!targetUser) return sendError(ctx, 'Could not find that user. Use a mention, user ID, or username.');

  const targetMember = await guild.members.fetch(targetUser.id).catch((): null => null);
  if (!targetMember) return sendError(ctx, 'That user is not a member of this server.');

  try {
    const existing = await client.db.getTextMessageLock(guild.id, targetUser.id);
    if (existing?.mode === mode) {
      await client.db.deleteTextMessageLock(guild.id, targetUser.id);
      lockCache.set(lockKey(guild.id, targetUser.id), { mode: null, expiresAt: Date.now() + CACHE_TTL_MS });
      return sendSuccess(ctx, `Removed the ${mode === 'uwu' ? 'UwU' : 'Freaky'} lock from <@${targetUser.id}>.`);
    }

    const botMember = guild.members.me ?? await guild.members.fetchMe().catch((): null => null);
    const botPermissions = botMember ? channel?.permissionsFor?.(botMember) : null;
    if (!botPermissions?.has?.(PermissionFlagsBits.ManageWebhooks) ||
        !botPermissions?.has?.(PermissionFlagsBits.ManageMessages)) {
      return sendError(ctx, 'I need **Manage Webhooks** and **Manage Messages** permissions in this channel to apply text locks.');
    }

    await client.db.setTextMessageLock(guild.id, targetUser.id, mode, actor.id);
    lockCache.set(lockKey(guild.id, targetUser.id), { mode, expiresAt: Date.now() + CACHE_TTL_MS });
    const action = existing
      ? `Changed <@${targetUser.id}>'s server-wide text lock to ${mode === 'uwu' ? 'UwU' : 'Freaky'}.`
      : `Enabled the server-wide ${mode === 'uwu' ? 'UwU' : 'Freaky'} lock for <@${targetUser.id}>.`;
    return sendSuccess(ctx, action);
  } catch (error: unknown) {
    console.error(`[text-lock] Failed to update ${mode} lock: ${error instanceof Error ? error.message : String(error)}`);
    return sendError(ctx, 'The text lock could not be saved. Please try again later.');
  }
}

function isKnownCommand(message: any, client: CassieClient, commandText: string): boolean {
  const commandName = commandText.trim().split(/\s+/, 1)[0]?.toLowerCase();
  if (!commandName) return false;
  return client.commands.has(commandName) || client.commands.has(client.aliases.get(commandName) ?? '');
}

async function isCommandMessage(message: any, client: CassieClient): Promise<boolean> {
  const content = String(message.content ?? '').trimStart();
  const prefixes = new Set<string>([
    client.config.prefix,
    client.userPrefixes.get(message.author.id) ?? '',
  ]);
  try {
    const guildPrefix = await client.db.getGuildPrefix(message.guild.id);
    if (guildPrefix) prefixes.add(guildPrefix);
  } catch (error: unknown) {
    logThrottled(
      `guild-prefix:${message.guild.id}`,
      `[text-lock] Could not load the server prefix while checking a locked message: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  for (const prefix of prefixes) {
    if (prefix && content.startsWith(prefix) && isKnownCommand(message, client, content.slice(prefix.length))) {
      return true;
    }
  }

  const botId = client.user?.id;
  if (botId) {
    const mention = content.match(new RegExp(`^<@!?${botId}>\\s*`));
    if (mention && isKnownCommand(message, client, content.slice(mention[0].length))) return true;
  }

  return isKnownCommand(message, client, content);
}

const PROTECTED_TEXT = /(```[\s\S]*?```|`[^`\n]*`|https?:\/\/\S+|<@!?[\d]+>|<@&[\d]+>|<#\d+>|<a?:[a-zA-Z0-9_]+:\d+>|\[[^\]]+\]\(https?:\/\/[^)]+\))/gi;

function uwuifyPlainText(text: string): string {
  const substitutions: Record<string, string> = {
    the: 'da',
    this: 'dis',
    that: 'dat',
    then: 'den',
    them: 'dem',
    they: 'dey',
    their: 'deir',
    there: 'dere',
    these: 'dese',
    those: 'dose',
    you: 'u',
    your: 'ur',
    "you're": 'ur',
    "you've": "u've",
    "you'll": "u'll",
    "you'd": "u'd",
    love: 'wuv',
    little: 'widdle',
    really: 'weawwy',
    very: 'vewy',
    please: 'pwease',
    friend: 'fwiend',
    cute: 'kyoot',
    good: 'gud',
    with: 'wif',
    for: 'fow',
    hello: 'hewwo',
    hi: 'hai',
    no: 'nyo',
    all: 'aww',
    am: 'im',
    my: 'mah',
    me: 'm-me',
  };
  let stutters = 0;
  const transformed = text.replace(/\p{L}+(?:['’]\p{L}+)*/gu, (word) => {
    const lower = word.toLocaleLowerCase();
    const mapped = substitutions[lower];
    let result = mapped ?? word
      .replace(/th/gi, (match) => match === 'TH' ? 'D' : match[0] === 'T' ? 'D' : 'd')
      .replace(/ove\b/gi, 'uv')
      .replace(/n(?=[aeiou])/gi, (match) => match === 'N' ? 'Ny' : 'ny')
      .replace(/[rl]/gi, (letter) => letter === 'R' || letter === 'L' ? 'W' : 'w');

    if (word === word.toLocaleUpperCase()) {
      result = result.toLocaleUpperCase();
    } else if (word[0] === word[0]?.toLocaleUpperCase()) {
      result = result[0].toLocaleUpperCase() + result.slice(1);
    }

    if (!mapped && result.length > 3 && Math.random() < 0.12) {
      result = result.replace(/([aeiou])/i, '$1$1');
    }

    if (stutters < 4 && word.length >= 2 && Math.random() < 0.18) {
      stutters++;
      const initial = result[0];
      result = `${initial}-${result}`;
    }
    return result;
  });

  if (!transformed.trim()) return transformed;

  const additions: string[] = [];
  if (Math.random() < 0.2) {
    additions.push(['uwu', 'nya~', 'owo', 'hehe~'][Math.floor(Math.random() * 4)]);
  }
  if (Math.random() < 0.5) {
    additions.push([
      '(^-^)',
      '(｡♥‿♥｡)',
      '(≧◡≦)',
      '(˶ᵔ ᵕ ᵔ˶)',
      '(⁄ ⁄>⁄ ▽ ⁄<⁄ ⁄)',
      'ฅ^•ﻌ•^ฅ',
      '>w<',
      '♡',
    ][Math.floor(Math.random() * 8)]);
  }
  if (Math.random() < 0.45) {
    additions.push([
      '✧･ﾟ: *✧･ﾟ',
      '⋆｡°✩',
      '♡₊˚',
      '୨୧',
      '🎀✨',
      '🌸',
      '🩷',
      '｡･:*˚:✧｡',
    ][Math.floor(Math.random() * 8)]);
  }
  return additions.length ? `${transformed} ${additions.join(' ')}` : transformed;
}

export function transformLockedText(text: string, mode: TextLockMode): string {
  const segments = text.split(PROTECTED_TEXT);
  const transformed = segments.map((segment) => {
    if (!segment) return segment;
    PROTECTED_TEXT.lastIndex = 0;
    return PROTECTED_TEXT.test(segment)
      ? segment
      : mode === 'uwu'
        ? uwuifyPlainText(segment)
        : [...segment].map((character) => {
            const code = character.codePointAt(0)!;
            if (code >= 65 && code <= 90) return String.fromCodePoint(0x1d4d0 + code - 65);
            if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d4ea + code - 97);
            return character;
          }).join('');
  }).join('');
  return transformed.length > 2000 ? `${transformed.slice(0, 1999)}…` : transformed;
}

async function getTextLockWebhook(channel: any, client: CassieClient): Promise<any> {
  const webhookChannel = channel.isThread?.() ? channel.parent : channel;
  if (!webhookChannel?.createWebhook || !webhookChannel?.fetchWebhooks) {
    throw new Error('This channel cannot create text-lock webhooks.');
  }

  const key = webhookChannel.id;
  const cached = webhookCache.get(key);
  if (cached) return cached;

  const pending = (async () => {
    const webhooks = await webhookChannel.fetchWebhooks();
    const existing = webhooks.find((hook: any) =>
      hook.name === WEBHOOK_NAME && hook.owner?.id === client.user?.id && hook.token,
    );
    if (existing) return existing;
    return webhookChannel.createWebhook({
      name: WEBHOOK_NAME,
      reason: 'Create a webhook for server-wide text transformations',
    });
  })();
  webhookCache.set(key, pending);
  try {
    return await pending;
  } catch (error) {
    webhookCache.delete(key);
    throw error;
  }
}

export async function processTextMessageLock(message: any, client: CassieClient): Promise<boolean> {
  if (!message?.guild || message.author?.bot || message.webhookId) return false;
  if (!client.db || typeof client.db.getTextMessageLock !== 'function') return false;

  let mode: TextLockMode | null;
  try {
    mode = await getTextLock(client, message.guild.id, message.author.id);
  } catch (error: unknown) {
    logThrottled(
      `lock-read:${message.guild.id}:${message.author.id}`,
      `[text-lock] Failed to load a user's text lock: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
  if (!mode) return false;
  if (await isCommandMessage(message, client)) return false;

  const channel = message.channel;
  const botMember = message.guild.members.me;
  if (!botMember) {
    logThrottled(
      `permissions:${channel.id}`,
      `[text-lock] Bot member is unavailable in guild ${message.guild.id}; left the original message unchanged.`,
    );
    return false;
  }
  const permissions = channel.permissionsFor?.(botMember);
  if (
      !permissions?.has?.(PermissionFlagsBits.ManageWebhooks) ||
      !permissions?.has?.(PermissionFlagsBits.ManageMessages)) {
    logThrottled(
      `permissions:${channel.id}`,
      `[text-lock] Missing Manage Webhooks or Manage Messages in channel ${channel.id}; left the original message unchanged.`,
    );
    return false;
  }

  try {
    const webhook = await getTextLockWebhook(channel, client);
    const member = message.member ?? await message.guild.members.fetch(message.author.id).catch((): null => null);
    const attachments = [...(message.attachments?.values?.() ?? [])];
    const stickers = [...(message.stickers?.values?.() ?? [])];
    const stickerText = stickers.map((sticker: any) => `[Sticker: ${sticker.name}]`).join(' ');
    const sourceText = [message.content, stickerText].filter(Boolean).join('\n');
    const content = transformLockedText(sourceText, mode) || '\u200B';
    await webhook.send({
      content,
      username: (member?.displayName ?? message.author.username).slice(0, 80),
      avatarURL: member?.displayAvatarURL?.({ size: 256 }) ?? message.author.displayAvatarURL?.({ size: 256 }),
      files: attachments.map((attachment: any) => ({ attachment: attachment.url, name: attachment.name })),
      embeds: message.embeds?.length ? message.embeds : undefined,
      threadId: channel.isThread?.() ? channel.id : undefined,
      allowedMentions: { parse: [] },
    });
  } catch (error: unknown) {
    const code = (error as { code?: number })?.code;
    if (code === 10015 || code === 50027) {
      webhookCache.delete(channel.isThread?.() ? channel.parentId : channel.id);
    }
    logThrottled(
      `repost:${channel.id}`,
      `[text-lock] Failed to repost a locked message in ${channel.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }

  try {
    await message.delete();
  } catch (error: unknown) {
    logThrottled(
      `delete:${channel.id}`,
      `[text-lock] Reposted a locked message but could not delete its original in ${channel.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return true;
}
