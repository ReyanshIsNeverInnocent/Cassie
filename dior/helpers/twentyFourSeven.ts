// xoxo/helpers/twentyFourSeven.ts
// In-memory registry for pending 24/7 rejoin timers (guildId → timeout handle)

import { entersState, joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice';
import type { VoiceConnection } from '@discordjs/voice';

const rejoinTimers = new Map<string, ReturnType<typeof setTimeout>>();
const idleVoiceConnections = new Map<string, VoiceConnection>();
const voiceTransitions = new Map<string, { channelId: string; timer: ReturnType<typeof setTimeout> }>();
const VOICE_READY_TIMEOUT_MS = 20_000;
const TRANSITION_TIMEOUT_MS = 15_000;

function beginVoiceTransition(guildId: string, channelId: string): void {
  const existing = voiceTransitions.get(guildId);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(() => voiceTransitions.delete(guildId), TRANSITION_TIMEOUT_MS);
  voiceTransitions.set(guildId, { channelId, timer });
}

export function is247VoiceTransitioning(guildId: string): boolean {
  return voiceTransitions.has(guildId);
}

export function complete247VoiceTransition(guildId: string, channelId: string): void {
  const transition = voiceTransitions.get(guildId);
  if (!transition || transition.channelId !== channelId) return;
  clearTimeout(transition.timer);
  voiceTransitions.delete(guildId);
}

export function releaseIdleVoiceForMusic(guildId: string, channelId: string): void {
  const connection = idleVoiceConnections.get(guildId);
  if (!connection) return;

  beginVoiceTransition(guildId, channelId);
  idleVoiceConnections.delete(guildId);
  connection.destroy();
}

export function removeIdleVoiceConnection(guildId: string): void {
  const connection = idleVoiceConnections.get(guildId);
  if (!connection) return;
  idleVoiceConnections.delete(guildId);
  connection.destroy();
}

export async function reconnect247Voice(client: any, guild: any, channelId: string): Promise<void> {
  beginVoiceTransition(guild.id, channelId);
  removeIdleVoiceConnection(guild.id);
  await join247Voice(client, guild, channelId);
}

export async function join247Voice(client: any, guild: any, channelId: string): Promise<void> {
  let channel = guild.channels?.cache?.get(channelId);
  if (!channel) channel = await guild.channels?.fetch(channelId);
  if (!channel?.isVoiceBased?.()) {
    throw new Error(`Saved channel <${channelId}> no longer exists or isn't a voice channel.`);
  }

  const member = guild.members?.me ?? (await guild.members?.fetchMe?.());
  if (!member || !channel.permissionsFor(member)?.has('Connect')) {
    throw new Error(`Missing Connect permission in <#${channelId}>.`);
  }

  const existingConnection = idleVoiceConnections.get(guild.id);
  if (
    existingConnection &&
    existingConnection.state.status !== VoiceConnectionStatus.Destroyed &&
    existingConnection.joinConfig.channelId === channelId
  ) {
    try {
      await entersState(existingConnection, VoiceConnectionStatus.Ready, VOICE_READY_TIMEOUT_MS);
      return;
    } catch (error) {
      idleVoiceConnections.delete(guild.id);
      existingConnection.destroy();
      throw error;
    }
  }

  beginVoiceTransition(guild.id, channelId);
  const player = client.kazagumo?.players?.get(guild.id);
  if (player) await player.destroy();

  if (existingConnection) {
    idleVoiceConnections.delete(guild.id);
    existingConnection.destroy();
  }

  const connection = joinVoiceChannel({
    channelId,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
  });
  idleVoiceConnections.set(guild.id, connection);
  let connectionErrorLogged = false;
  connection.on('error', (error) => {
    if (connectionErrorLogged) return;
    connectionErrorLogged = true;
    console.error(`[24-7] Voice connection error in ${guild.name}: ${error.message}`);
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, VOICE_READY_TIMEOUT_MS);
  } catch (error) {
    if (idleVoiceConnections.get(guild.id) === connection) idleVoiceConnections.delete(guild.id);
    connection.destroy();
    throw error;
  }
}

export function scheduleRejoin(client: any, guildId: string, channelId: string, delayMs: number): void {
  clearRejoin(guildId);
  console.log(`[24-7] Scheduled rejoin to <${channelId}> in ${delayMs / 1000}s for guild ${guildId}`);
  const timer = setTimeout(async () => {
    rejoinTimers.delete(guildId);
    await performRejoin(client, guildId, channelId);
  }, delayMs);
  rejoinTimers.set(guildId, timer);
}

export function clearRejoin(guildId: string): void {
  const timer = rejoinTimers.get(guildId);
  if (timer !== undefined) {
    clearTimeout(timer);
    rejoinTimers.delete(guildId);
    console.log(`[24-7] Cancelled pending rejoin for guild ${guildId}`);
  }
}

async function performRejoin(client: any, guildId: string, channelId: string, retryCount = 0): Promise<void> {
  const guild = client.guilds?.cache?.get(guildId);
  if (!guild) return;

  try {
    await join247Voice(client, guild, channelId);
    clearRejoin(guildId);
    console.log(`[24-7] Rejoined 24/7 channel in ${guild.name}`);
  } catch (err) {
    console.error(`[24-7] Rejoin failed for ${guild.name}: ${err instanceof Error ? err.message : String(err)}`);

    // Retry with backoff while Discord's voice connection stabilises.
    // Cap at 3 retries (delays: 30s → 60s → 120s).
    const MAX_RETRIES = 3;
    if (retryCount < MAX_RETRIES) {
      const retryDelay = 30_000 * Math.pow(2, retryCount); // 30s, 60s, 120s
      console.log(`[24-7] Scheduling retry ${retryCount + 1}/${MAX_RETRIES} for ${guild.name} in ${retryDelay / 1000}s`);
      const timer = setTimeout(async () => {
        rejoinTimers.delete(guildId);
        await performRejoin(client, guildId, channelId, retryCount + 1);
      }, retryDelay);
      rejoinTimers.set(guildId, timer);
    } else {
      console.warn(`[24-7] Giving up on rejoining ${guild.name} after ${MAX_RETRIES} retries.`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot-time restore
// ─────────────────────────────────────────────────────────────────────────────
//
// Restore saved voice connections independently of Lavalink. These
// audio-less connections keep 24/7 guilds present even during node outages.

let bootReconnectStarted = false;

export async function reconnectAllOnBoot(client: any): Promise<void> {
  if (bootReconnectStarted) return;
  bootReconnectStarted = true;

  await _doReconnectAll(client, 'boot');
}

export async function reconnectOnNodeOutage(client: any): Promise<void> {
  await _doReconnectAll(client, 'node-outage');
}

async function _doReconnectAll(client: any, reason: string): Promise<void> {
  if (!client.db?.getAllEnabled24Seven) return;

  let entries: Array<{ guildId: string; channelId: string }> = [];
  try {
    entries = await client.db.getAllEnabled24Seven();
  } catch (err) {
    console.error(`[24-7] Failed to load enabled 24/7 guilds (${reason}): ${(err as Error).message}`);
    return;
  }

  if (entries.length === 0) return;
  console.log(`[24-7] [${reason}] Restoring up to ${entries.length} 24/7 connection(s)...`);

  let restored = 0;
  for (const { guildId, channelId } of entries) {
    // Only reconnect guilds this cluster actually owns.
    const guild = client.guilds?.cache?.get(guildId);
    if (!guild) continue;

    // Clear any pending rejoin timer so there's no race with this reconnect.
    clearRejoin(guildId);

    try {
      await join247Voice(client, guild, channelId);
      restored++;
      console.log(`[24-7] [${reason}] Restored connection in ${guild.name} (<#${channelId}>)`);
    } catch (err) {
      console.error(`[24-7] [${reason}] Failed to restore connection in ${guild.name}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Stagger to avoid a burst of simultaneous voice-gateway handshakes.
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  console.log(`[24-7] [${reason}] Reconnect pass complete: ${restored}/${entries.length} restored.`);
}
