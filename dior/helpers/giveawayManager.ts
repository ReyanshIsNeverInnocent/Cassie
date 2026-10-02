import { randomUUID } from 'node:crypto';
import type { GiveawayDoc } from '../database/database.js';
import type { CassieClient } from '../structures/CassieClient.js';
import {
  buildActiveGiveawayPayload,
  buildEndedGiveawayPayload,
  buildWinnerAnnouncement,
} from '../components/features/giveaway.js';

export const MAX_GIVEAWAY_DURATION_MS = 365 * 24 * 60 * 60 * 1000;
export const MAX_GIVEAWAY_WINNERS = 20;
const SCHEDULER_INTERVAL_MS = 15_000;
const END_CLAIM_LEASE_MS = 2 * 60_000;

async function getGiveawayServerIcon(client: CassieClient, guildId: string): Promise<string | null> {
  const guild = client.guilds.cache.get(guildId)
    ?? await client.guilds.fetch(guildId).catch((): null => null);
  return guild?.iconURL({ size: 256, extension: 'png' }) ?? null;
}

export function parseGiveawayDuration(raw: string | undefined): number | null {
  const match = raw?.trim().match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const multiplier: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const duration = amount * multiplier[match[2].toLowerCase()];
  if (!Number.isSafeInteger(duration) || duration <= 0 || duration > MAX_GIVEAWAY_DURATION_MS) return null;
  return duration;
}

export async function startGiveaway(
  client: CassieClient,
  channel: any,
  guildId: string,
  hostId: string,
  durationMs: number,
  winnerCount: number,
  prize: string,
): Promise<GiveawayDoc> {
  if (!client.db) throw new Error('Database is unavailable right now.');

  const id = randomUUID();
  const now = Date.now();
  const giveaway: GiveawayDoc = {
    _id: id,
    id,
    guild_id: guildId,
    channel_id: channel.id,
    message_id: '',
    host_id: hostId,
    prize: prize.trim(),
    winners: winnerCount,
    end_at: now + durationMs,
    status: 'active',
    winner_ids: [],
    winner_history: [],
    created_at: now,
  };

  const guild = client.guilds.cache.get(guildId);
  const serverIconUrl = guild?.iconURL({ size: 256, extension: 'png' }) ?? null;
  const activeGiveaways = await client.db.listActiveGiveawaysByGuild(guildId, 10);
  if (activeGiveaways.length >= 10) {
    throw new Error('This server already has the maximum of 10 active giveaways. End or cancel one before starting another.');
  }
  const entries = await client.db.listGiveawayEntries(giveaway.id).catch((): any[] => []);
  const message = await channel.send(buildActiveGiveawayPayload(giveaway, entries.length, serverIconUrl));
  giveaway.message_id = message.id;
  try {
    await client.db.createGiveaway(giveaway);
  } catch (error) {
    await message.delete().catch((): null => null);
    throw error;
  }
  return giveaway;
}

export async function endGiveaway(
  client: CassieClient,
  id: string,
  options: { force?: boolean; cancel?: boolean } = {},
): Promise<'ended' | 'already-ended' | 'not-found' | 'not-due' | 'busy'> {
  if (!client.db) return 'not-found';
  const beforeClaim = await client.db.getGiveaway(id);
  if (!beforeClaim) return 'not-found';
  if (beforeClaim.status === 'ended') return 'already-ended';
  if (!options.force && beforeClaim.end_at > Date.now()) return 'not-due';

  const now = Date.now();
  const giveaway = await client.db.claimGiveawayEnd(id, now, now - END_CLAIM_LEASE_MS);
  if (!giveaway) return 'busy';

  try {
    const channel: any = client.channels.cache.get(giveaway.channel_id)
      ?? await client.channels.fetch(giveaway.channel_id).catch((): null => null);
    if (!channel?.messages) throw new Error('Giveaway channel is unavailable.');

    const message = await channel.messages.fetch(giveaway.message_id).catch((): null => null);
    const entries = await client.db.listGiveawayEntries(giveaway.id);
    let winnerIds = options.cancel ? [] : (giveaway.winner_ids ?? []);

    if (!options.cancel && !winnerIds.length && entries.length) {
      const shuffled = entries.map((entry) => entry.user_id);
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      winnerIds = shuffled.slice(0, Math.min(giveaway.winners, shuffled.length));
      const history = [...new Set([...(giveaway.winner_history ?? []), ...winnerIds])];
      await client.db.updateGiveaway(giveaway.id, { winner_ids: winnerIds, winner_history: history });
      giveaway.winner_ids = winnerIds;
      giveaway.winner_history = history;
    }

    giveaway.status = 'ended';
    giveaway.ended_at = now;

    if (message) {
      const serverIconUrl = await getGiveawayServerIcon(client, giveaway.guild_id);
      await message.edit(buildEndedGiveawayPayload(giveaway, entries.length, serverIconUrl)).catch((error: unknown) => {
        console.warn(`[GIVEAWAY] Could not update giveaway message ${giveaway.message_id}: ${(error as Error).message}`);
      });
    }
    await channel.send(buildWinnerAnnouncement(giveaway, winnerIds, message?.url)).catch((error: unknown) => {
      console.warn(`[GIVEAWAY] Could not announce winners for ${giveaway.id}: ${(error as Error).message}`);
    });
    await client.db.updateGiveaway(giveaway.id, {
      status: 'ended',
      ended_at: now,
      winner_ids: winnerIds,
      winner_history: giveaway.winner_history ?? winnerIds,
    });
    return 'ended';
  } catch (error) {
    await client.db.releaseGiveawayEnd(giveaway.id).catch((): null => null);
    throw error;
  }
}

export async function rerollGiveaway(client: CassieClient, giveaway: GiveawayDoc): Promise<string[]> {
  if (!client.db) throw new Error('Database is unavailable right now.');
  if (giveaway.status !== 'ended') throw new Error('That giveaway has not ended yet.');

  const entries = await client.db.listGiveawayEntries(giveaway.id);
  if (!entries.length) throw new Error('There are no entries to reroll.');

  const previous = new Set(giveaway.winner_history ?? giveaway.winner_ids);
  const allIds = entries.map((entry) => entry.user_id);
  const eligible = allIds.filter((id) => !previous.has(id));
  const pool = eligible.length ? eligible : allIds;
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const winnerIds = shuffled.slice(0, Math.min(giveaway.winners, shuffled.length));
  const winnerHistory = [...new Set([...previous, ...winnerIds])];
  await client.db.updateGiveaway(giveaway.id, {
    winner_ids: winnerIds,
    winner_history: winnerHistory,
  });
  giveaway.winner_ids = winnerIds;
  giveaway.winner_history = winnerHistory;

  const channel: any = client.channels.cache.get(giveaway.channel_id)
    ?? await client.channels.fetch(giveaway.channel_id).catch((): null => null);
  const message = await channel?.messages?.fetch(giveaway.message_id).catch((): null => null);
  if (!channel?.send) throw new Error('The giveaway channel is unavailable.');
  const serverIconUrl = await getGiveawayServerIcon(client, giveaway.guild_id);
  if (message) {
    await message.edit(buildEndedGiveawayPayload(giveaway, entries.length, serverIconUrl));
  }
  await channel.send(buildWinnerAnnouncement(giveaway, winnerIds, message?.url, true));
  return winnerIds;
}

export async function initializeGiveawayScheduler(client: CassieClient): Promise<void> {
  if (!client.db) return;

  let checking = false;
  const check = async (): Promise<void> => {
    if (checking || !client.db) return;
    checking = true;
    try {
      const now = Date.now();
      const staleBefore = now - END_CLAIM_LEASE_MS;
      const giveaways = await client.db.listGiveawaysForScheduler();
      for (const giveaway of giveaways) {
        const due = giveaway.status === 'active' && giveaway.end_at <= now;
        const abandoned = giveaway.status === 'ending' && (giveaway.ending_claimed_at ?? 0) < staleBefore;
        if (!due && !abandoned) continue;
        // Each Discord guild belongs to one shard; the claim also protects against overlapping workers.
        if (!client.guilds.cache.has(giveaway.guild_id)) continue;
        await endGiveaway(client, giveaway.id).catch((error: unknown) => {
          console.error(`[GIVEAWAY] Failed to end ${giveaway.id}: ${(error as Error).message}`);
        });
      }
    } finally {
      checking = false;
    }
  };

  await check();
  setInterval(() => { void check(); }, SCHEDULER_INTERVAL_MS);
}