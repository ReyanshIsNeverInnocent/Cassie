// xoxo/commands/music/nowplaying.ts
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { sendNowPlaying } from '../../components/music/nowPlaying.js';
import { buildTrackInfo } from '../../helpers/nowPlayingManager.js';
import { generateNowPlayingCanvas } from '../../canvas/NowPlayingCanvas.js';
import { extractThumbnail, formatDuration } from '../../utils/formatting.js';
import { unifiedSearch } from '../../helpers/sourceSearch.js';

export const options = {
  name: 'nowplaying',
  aliases: ['np'] as string[],
  description: 'Show the currently playing track.',
  usage: 'nowplaying [sample|test]',
  category: 'music',
  isDeveloper: false,
  userPerms: [] as string[],
  botPerms: [] as string[],
  player: true,
  inVoiceChannel: false,
  sameVoiceChannel: false,
  cooldown: 3,
};

async function handle(
  ctx: { message?: any; interaction?: any; isSlash: boolean },
  guildId: string,
  args: string[],
  client: CassieClient,
) {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };

  // Sample/test is a prefix-only preview mode. The song identity comes from
  // config; the search result supplies duration, artwork, URL, and source data.
  // Any other text falls through to the normal live-track behavior below.
  const isSample = !ctx.isSlash && ['sample', 'test'].includes(args[0]?.toLowerCase());
  if (isSample) {
    const sample = client.config.sampleNowPlaying;
    const query = `${sample.title} ${sample.artist}`.trim();

    let result: any;
    try {
      result = await unifiedSearch(client as any, query, ctx.message?.author);
    } catch {
      return sendError(ctxObj, 'Failed to search for that song. Please try again.');
    }

    const track = result?.tracks?.[0];
    if (!track) return sendError(ctxObj, 'No results found for that song.');

    // Duration comes only from the track returned by the search.
    const resolvedDurationMs = Number(track.length ?? 0);
    if (!Number.isFinite(resolvedDurationMs) || resolvedDurationMs <= 0) {
      return sendError(ctxObj, 'That result does not have a playable duration for a preview.');
    }

    const position = resolvedDurationMs / 2;
    const requester = ctx.message?.author?.username ?? 'Unknown user';
    const volume = Math.max(0, Math.min(100, Number(sample.volume)));
    const trackInfo = {
      title:             track.title,
      artist:            track.author || 'Unknown',
      url:               track.uri,
      // The preview is intentionally labelled Deezer, matching the sample
      // panel contract even if the fallback search chain resolves elsewhere.
      sourceName:        'deezer',
      durationFormatted: formatDuration(resolvedDurationMs),
      currentFormatted:  formatDuration(position),
      progress:          50,
      thumbnailUrl:      (track.thumbnail ?? extractThumbnail(track) ?? undefined) as string | undefined,
      volume,
      isServerVolume:    false,
      requestedBy:       requester,
    };
    const samplePlayer: any = {
      volume,
      paused: false,
      loop: 'none',
      data: new Map(),
      queue: { previous: [], length: 0, current: trackInfo },
    };
    const canvasBuffer = await generateNowPlayingCanvas({
      title:             trackInfo.title,
      artist:            trackInfo.artist,
      currentFormatted:  trackInfo.currentFormatted,
      durationFormatted: trackInfo.durationFormatted,
      progress:          trackInfo.progress,
      volume:            trackInfo.volume,
      requestedBy:       trackInfo.requestedBy,
      thumbnailUrl:      trackInfo.thumbnailUrl,
      isLive:            false,
    }).catch((): null => null);

    await sendNowPlaying(ctxObj as any, samplePlayer, trackInfo, {
      isSample: true,
      prefix: client.config?.prefix,
      canvasBuffer: canvasBuffer ?? undefined,
    });
    return;
  }

  const player  = (client as any).kazagumo.players.get(guildId);
  if (!player?.queue?.current) return sendError(ctxObj, 'There is nothing currently playing.');

  const track     = player.queue.current;
  const prefix    = (client as any).config?.prefix;
  const trackInfo = buildTrackInfo(player, track);

  const canvasBuffer = await generateNowPlayingCanvas({
    title:             trackInfo.title,
    artist:            trackInfo.artist,
    currentFormatted:  trackInfo.currentFormatted,
    durationFormatted: trackInfo.durationFormatted,
    progress:          trackInfo.progress,
    volume:            trackInfo.volume ?? player.volume ?? 100,
    requestedBy:       trackInfo.requestedBy,
    thumbnailUrl:      trackInfo.thumbnailUrl,
    isLive:            trackInfo.durationFormatted === 'LIVE',
  }).catch((): null => null);

  await sendNowPlaying(ctxObj as any, player, trackInfo, { prefix, canvasBuffer: canvasBuffer ?? undefined });
}

export async function prefixExecute(message: any, _args: string[], client: CassieClient) {
  await handle({ message, isSlash: false }, message.guild.id, _args, client);
}
export async function slashExecute(interaction: any, client: CassieClient) {
  await handle({ interaction, isSlash: true }, interaction.guild.id, [], client);
}
