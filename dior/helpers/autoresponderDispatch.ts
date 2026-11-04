// xoxo/helpers/autoresponderDispatch.ts
//
// Checks an incoming message against a guild's configured autoresponders
// and fires every matching trigger's responses (message + reaction, in the
// order they were added). Fire-and-forget — never throws, never blocks the
// rest of messageCreate.
//
// Also checks globally-enabled autoresponders from OTHER guilds (is_global true)
// so global triggers fire everywhere. Native guild triggers are always processed
// first; global-foreign ones are additive and never double-fired.
//
// A short per-trigger, per-channel cooldown prevents a single spammy user
// from hammering the same reaction/message trigger (and risking a Discord
// rate limit) by repeating the same word rapidly.

import type { CassieClient } from '../structures/CassieClient.js';
import { messageMatchesTrigger } from './autoresponderMatcher.js';
import type { AutoresponderDoc, AutoresponderReplyMode } from '../database/database.js';

const COOLDOWN_MS = 1_000;
const CACHE_TTL_MS = 15_000;
const lastFired = new Map<string, number>();
const guildCache = new Map<string, { expiresAt: number; docs: AutoresponderDoc[] }>();
let globalCache: { expiresAt: number; docs: AutoresponderDoc[] } | null = null;

// Periodic sweep so the cooldown map doesn't grow unbounded on busy bots.
const cooldownSweepTimer = setInterval(() => {
  const cutoff = Date.now() - COOLDOWN_MS * 4;
  for (const [key, ts] of lastFired) {
    if (ts < cutoff) lastFired.delete(key);
  }
}, 60_000);

export function isAutoresponderCooldownSweepRunning(): boolean {
  return Boolean(cooldownSweepTimer);
}

async function fireResponses(message: any, doc: AutoresponderDoc): Promise<void> {
  const cooldownKey = `${message.guild.id}:${message.channelId}:${doc.trigger_lower}`;
  const now = Date.now();
  const last = lastFired.get(cooldownKey) ?? 0;
  if (now - last < COOLDOWN_MS) return;
  lastFired.set(cooldownKey, now);

  for (const response of doc.responses) {
    if (response.type === 'message') {
      const mode: AutoresponderReplyMode = response.replyMode ?? 'normal';
      if (mode === 'reply_mention') {
        await message.reply({ content: response.content, allowedMentions: { repliedUser: true } }).catch((): null => null);
      } else if (mode === 'reply_no_mention') {
        await message.reply({ content: response.content, allowedMentions: { repliedUser: false, parse: [] } }).catch((): null => null);
      } else {
        await message.channel.send({ content: response.content, allowedMentions: { parse: [] } }).catch((): null => null);
      }
    } else if (response.type === 'reaction') {
      await message.react(response.content).catch((): null => null);
    }
  }
}

export async function dispatchAutoresponders(client: CassieClient, message: any): Promise<void> {
  if (!client.db || !message.guild) return;
  // Process other bots' messages, but never process this bot's own responses.
  if (message.author?.id && message.author.id === client.user?.id) return;
  if (typeof message.content !== 'string' || !message.content.trim()) return;

  const guildId: string = message.guild.id;

  // Cache these reads briefly: the PostgreSQL document adapter otherwise scans
  // the whole collection for every incoming message.
  const now = Date.now();
  const cachedGuild = guildCache.get(guildId);
  let docs: AutoresponderDoc[];
  if (cachedGuild && cachedGuild.expiresAt > now) {
    docs = cachedGuild.docs;
  } else {
    docs = await client.db.getAllAutoresponders(guildId).catch((): AutoresponderDoc[] => []);
    guildCache.set(guildId, { expiresAt: now + CACHE_TTL_MS, docs });
  }

  // Track which triggers have been processed (by trigger_lower) to avoid double-firing
  const firedTriggers = new Set<string>();

  for (const doc of docs) {
    if (!doc.enabled || !doc.responses.length) continue;
    if (!messageMatchesTrigger(message.content, doc.trigger, doc.match_type)) continue;
    await fireResponses(message, doc);
    firedTriggers.add(doc.trigger_lower);
  }

  // Global autoresponders from OTHER guilds
  let globalDocs: AutoresponderDoc[];
  if (globalCache && globalCache.expiresAt > now) {
    globalDocs = globalCache.docs;
  } else {
    globalDocs = await client.db.getGlobalAutoresponders().catch((): AutoresponderDoc[] => []);
    globalCache = { expiresAt: now + CACHE_TTL_MS, docs: globalDocs };
  }
  for (const doc of globalDocs) {
    // Skip if this doc belongs to the current guild (already processed above)
    if (doc.guild_id === guildId) continue;
    // Skip if a native trigger with the same text was already fired
    if (firedTriggers.has(doc.trigger_lower)) continue;
    if (!doc.enabled || !doc.responses.length) continue;
    if (!messageMatchesTrigger(message.content, doc.trigger, doc.match_type)) continue;
    await fireResponses(message, doc);
    // Mark fired so a second global doc with the same trigger_lower (from yet
    // another guild) doesn't fire again for this same message.
    firedTriggers.add(doc.trigger_lower);
  }
}
