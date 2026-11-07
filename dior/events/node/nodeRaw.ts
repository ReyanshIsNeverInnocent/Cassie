// Shoukaku event: 'raw' — inspect Lavalink player events before Kazagumo handles them.
import type { TrackEndEvent } from 'shoukaku';

export const name = 'raw';
export const type = 'node';

export function execute(client: any, nodeName: string, payload: any): void {
  if (payload?.op !== 'event' || payload?.type !== 'TrackEndEvent') return;

  const player = client.kazagumo?.players?.get(payload.guildId);
  const track = player?.queue?.current ?? player?.queue?.previous?.[0];
  const guild = client.guilds.cache.get(payload.guildId);
  const event = payload as TrackEndEvent;

  console.warn('[PLAYER] Lavalink track ended.', {
    guild: guild ? { id: guild.id, name: guild.name } : { id: payload.guildId },
    nodeName,
    reason: event.reason,
    track: track
      ? {
          title: track.title,
          author: track.author,
          source: track.sourceName,
          uri: track.uri,
        }
      : { encoded: event.track?.encoded ? '[present]' : undefined },
  });
}
