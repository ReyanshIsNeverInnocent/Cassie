// xoxo/helpers/nowPlayingManager.ts
import { sendNowPlaying, buildNowPlayingPayload, type NowPlayingTrackInfo } from '../components/music/nowPlaying.js';
import { extractThumbnail, formatDuration } from '../utils/formatting.js';
import { generateNowPlayingCanvas } from '../canvas/NowPlayingCanvas.js';

interface PositionSnapshot {
  position: number;
  time: number;
}

interface StoredMessage {
  channelId: string;
  messageId: string;
  isQueueEnd: boolean;
}

interface PlayerState {
  positionSnapshot?: PositionSnapshot;
  nowPlayingMessage?: StoredMessage;
}

const playerStates = new Map<string, PlayerState>();

/** Auto-update interval IDs — one per active player (keyed by guildId). */
const updateIntervals = new Map<string, ReturnType<typeof setInterval>>();

const NP_UPDATE_INTERVAL_MS = 10_000; // 10 seconds

export function getActiveNowPlayingUpdateCount(): number {
  return updateIntervals.size;
}

function getState(guildId: string): PlayerState {
  if (!playerStates.has(guildId)) playerStates.set(guildId, {});
  return playerStates.get(guildId)!;
}

function stopUpdateInterval(guildId: string): void {
  const existing = updateIntervals.get(guildId);
  if (existing) {
    clearInterval(existing);
    updateIntervals.delete(guildId);
  }
}

function startUpdateInterval(client: any, player: any): void {
  const guildId = player.guildId;
  stopUpdateInterval(guildId); // clear any previous interval first

  const id = setInterval(async () => {
    const state = playerStates.get(guildId);
    // Stop if no active now-playing message
    if (!state?.nowPlayingMessage) { stopUpdateInterval(guildId); return; }

    const currentPlayer = client.kazagumo?.players?.get(guildId);
    if (!currentPlayer?.queue?.current) { stopUpdateInterval(guildId); return; }

    await updateNowPlayingMessage(client, currentPlayer);
  }, NP_UPDATE_INTERVAL_MS);

  updateIntervals.set(guildId, id);
}

export function setPositionSnapshot(guildId: string, position: number): void {
  getState(guildId).positionSnapshot = { position, time: Date.now() };
}

export function clearPlayerState(guildId: string): void {
  stopUpdateInterval(guildId);
  playerStates.delete(guildId);
}

export function markMessageAsQueueEnd(guildId: string): void {
  const state = getState(guildId);
  if (state.nowPlayingMessage) {
    state.nowPlayingMessage.isQueueEnd = true;
  }
}

function formatPosition(ms: number): string {
  if (!ms || ms <= 0) return '00:00';
  return formatDuration(ms);
}

function getInterpolatedPosition(player: any): number {
  const snapshot = getState(player.guildId).positionSnapshot;
  if (!snapshot) return player.position ?? 0;

  const elapsed = player.playing && !player.paused ? Date.now() - snapshot.time : 0;
  const length = player.queue?.current?.length ?? 0;
  const interpolated = snapshot.position + elapsed;
  return length > 0 ? Math.min(interpolated, length) : interpolated;
}

/** Silently generate the canvas image for a track; returns null on failure. */
async function buildCanvasBuffer(trackInfo: NowPlayingTrackInfo, player: any): Promise<Buffer | null> {
  try {
    return await generateNowPlayingCanvas({
      title:             trackInfo.title,
      artist:            trackInfo.artist,
      currentFormatted:  trackInfo.currentFormatted,
      durationFormatted: trackInfo.durationFormatted,
      progress:          trackInfo.progress,
      volume:            trackInfo.volume ?? player.volume ?? 100,
      requestedBy:       trackInfo.requestedBy,
      thumbnailUrl:      trackInfo.thumbnailUrl,
      isLive:            trackInfo.durationFormatted === 'LIVE',
    });
  } catch {
    return null;
  }
}

export function buildTrackInfo(player: any, track: any): NowPlayingTrackInfo {
  const position = getInterpolatedPosition(player);

  // Prefer the authoritative length from the Shoukaku player's active track
  // (set by Lavalink when playback begins) over the KazagumoTrack's cached
  // length (set at search time). For tracks that undergo lazy resolution
  // (e.g. Spotify → YouTube fallback), the resolved length can differ from
  // the search-result length, so Shoukaku's value is the ground truth here.
  const shoukakuLength: number | undefined = player.shoukaku?.track?.info?.length;
  const length = (shoukakuLength !== undefined && shoukakuLength > 0)
    ? shoukakuLength
    : (track.length ?? 0);

  const requester = track.requester;
  const requestedBy = (requester as any)?.username ?? undefined;

  return {
    title: track.title,
    artist: track.author || 'Unknown',
    url: track.uri,
    sourceName: track.sourceName || 'Unknown',
    durationFormatted: length > 0 ? formatDuration(length) : 'LIVE',
    currentFormatted: formatPosition(position),
    progress: length > 0 ? Math.min(100, (position / length) * 100) : 0,
    thumbnailUrl: track.thumbnail ?? extractThumbnail(track) ?? undefined,
    volume: player.volume ?? 100,
    isServerVolume:
      player.data?.get?.('serverVolume') !== undefined &&
      player.data.get('serverVolume') === (player.volume ?? 100),
    requestedBy,
  };
}

async function fetchStoredMessage(client: any, stored: StoredMessage): Promise<any | null> {
  try {
    const channel = client.channels.cache.get(stored.channelId);
    if (!channel) return null;
    return await (channel as any).messages.fetch(stored.messageId).catch((): null => null);
  } catch {
    return null;
  }
}

export async function deleteOldNowPlayingMessage(client: any, guildId: string): Promise<void> {
  const state = getState(guildId);
  const stored = state.nowPlayingMessage;
  if (!stored || stored.isQueueEnd) return;

  const msg = await fetchStoredMessage(client, stored);
  if (msg) await msg.delete().catch(() => {});

  state.nowPlayingMessage = undefined;
}

export async function disableNowPlayingButtons(client: any, player: any): Promise<void> {
  stopUpdateInterval(player.guildId);
  const guildId = player.guildId;
  const state = getState(guildId);
  const stored = state.nowPlayingMessage;
  if (!stored) return;

  const track = player.queue?.current ?? player.queue?.previous?.[0];
  if (!track) return;

  const prefix = client.config?.prefix;
  const trackInfo = buildTrackInfo(player, track);
  const canvasBuffer = await buildCanvasBuffer(trackInfo, player);
  const payload = buildNowPlayingPayload(player, trackInfo, { allDisabled: true, prefix, canvasBuffer: canvasBuffer ?? undefined }) as any;

  const msg = await fetchStoredMessage(client, stored);
  if (msg) await msg.edit(payload).catch(() => {});
}

export async function sendNowPlayingMessage(
  client: any,
  player: any,
  track: any,
): Promise<any> {
  const channel = client.channels.cache.get(player.textId);
  if (!channel) return;

  const prefix = client.config?.prefix;
  const trackInfo = buildTrackInfo(player, track);
  const canvasBuffer = await buildCanvasBuffer(trackInfo, player);
  const msg = await sendNowPlaying({ channel }, player, trackInfo, { prefix, canvasBuffer: canvasBuffer ?? undefined }).catch((): null => null);

  if (msg) {
    getState(player.guildId).nowPlayingMessage = {
      channelId: (channel as any).id,
      messageId: msg.id,
      isQueueEnd: false,
    };
    // Start the 10-second auto-update interval for this player.
    startUpdateInterval(client, player);
  }

  return msg;
}

export async function updateNowPlayingMessage(client: any, player: any): Promise<void> {
  const state = getState(player.guildId);
  const stored = state.nowPlayingMessage;
  if (!stored) return;

  const track = player.queue?.current;
  if (!track) return;

  const prefix = client.config?.prefix;
  const trackInfo = buildTrackInfo(player, track);
  const canvasBuffer = await buildCanvasBuffer(trackInfo, player);
  const payload = buildNowPlayingPayload(player, trackInfo, { prefix, canvasBuffer: canvasBuffer ?? undefined }) as any;

  const msg = await fetchStoredMessage(client, stored);
  if (msg) {
    await msg.edit(payload).catch(() => {});
    return;
  }

  // Original message gone — send a new one
  const channel = client.channels.cache.get(player.textId);
  if (!channel) return;

  const newMsg = await sendNowPlaying({ channel }, player, trackInfo, { prefix, canvasBuffer: canvasBuffer ?? undefined }).catch((): null => null);
  if (newMsg) {
    state.nowPlayingMessage = {
      channelId: (channel as any).id,
      messageId: newMsg.id,
      isQueueEnd: false,
    };
  }
}
