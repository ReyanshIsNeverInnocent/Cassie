// xoxo/commands/music/add.ts
// Add a song to the queue of an already-active player.
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import {
  sendLoadingMessage, sendTrackAddedMessage, sendPlaylistAddedMessage,
} from '../../components/music/addedToQueue.js';
import { extractThumbnail, formatDuration } from '../../utils/formatting.js';
import { unifiedSearch } from '../../helpers/sourceSearch.js';
import { updateNowPlayingMessage } from '../../helpers/nowPlayingManager.js';
import { addTracks } from '../../helpers/sessionQueue.js';

export const options = {
  name: 'add',
  aliases: [] as string[],
  description: 'Add a song to the queue. (Bot must already be in a voice channel.)',
  usage: 'add <song name or URL>',
  category: 'music',
  isDeveloper: false,
  userPerms: [] as string[],
  botPerms: [] as string[],
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  cooldown: 3,
};

async function handle(
  ctx: { guild: any; user: any; voiceChannel: any; textChannelId: string; message?: any; interaction?: any; isSlash: boolean },
  query: string,
  client: CassieClient,
) {
  const { guild, user, voiceChannel, textChannelId, message, interaction, isSlash } = ctx;
  const ctxObj = isSlash ? { interaction } : { message };

  if (!query) return sendError(ctxObj, 'Please provide a song name or URL.');

  const loadingMsg = await sendLoadingMessage(ctxObj as any, query);

  let result: any;
  try {
    result = await unifiedSearch(client as any, query, user);
  } catch {
    return sendError(ctxObj, 'Failed to search for that song. Please try again.');
  }

  if (!result?.tracks?.length) return sendError(ctxObj, 'No results found for your query.');

  const player = (client as any).kazagumo.players.get(guild.id);
  if (!player) return sendError(ctxObj, 'There is no active player in this server.');
  player.textId = textChannelId;

  if (result.type === 'PLAYLIST') {
    const firstTrack    = result.tracks[0];
    const playlistCount = result.tracks.length;
    addTracks(player, result.tracks, user);
    player.queue.add(result.tracks);
    const thumbnail = firstTrack?.thumbnail ?? extractThumbnail(firstTrack) ?? undefined;
    if (loadingMsg) {
      await sendPlaylistAddedMessage(
        isSlash ? { interaction } : { message, existingMessage: loadingMsg as any },
        { name: result.playlistName || 'Unknown Playlist', trackCount: playlistCount, thumbnail },
      );
    }
  } else {
    const track    = result.tracks[0];
    player.queue.add(track);
    addTracks(player, [track], user);
    const thumbnail = track.thumbnail ?? extractThumbnail(track) ?? undefined;
    if (loadingMsg) {
      await sendTrackAddedMessage(
        isSlash ? { interaction } : { message, existingMessage: loadingMsg as any },
        { title: track.title, author: track.author || 'Unknown', duration: track.length ? formatDuration(track.length) : 'LIVE', position: player.queue.length, url: track.uri, thumbnail },
      );
    }
  }

  if (!player.playing && !player.paused) {
    try {
      await player.play();
    } catch (error: unknown) {
      console.error('[MUSIC] Failed to start queued track.', {
        guild: { id: guild.id, name: guild.name },
        nodeName: player.shoukaku?.node?.name ?? 'unknown',
        track: {
          title: player.queue?.current?.title,
          author: player.queue?.current?.author,
          source: player.queue?.current?.sourceName,
          uri: player.queue?.current?.uri,
        },
        error,
      });
      return sendError(
        isSlash ? { interaction } : { message, existingMessage: loadingMsg as any },
        'The track was added, but Lavalink failed to start playback. Check the bot console for details.',
      );
    }
  } else {
    await updateNowPlayingMessage(client as any, player).catch((): null => null);
  }
}

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  const query       = args.join(' ');
  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) return sendError({ message }, 'You must be in a voice channel.');
  await handle({ guild: message.guild, user: message.author, voiceChannel, textChannelId: message.channel.id, message, isSlash: false }, query, client);
}

export async function slashExecute(interaction: any, client: CassieClient) {
  const query       = interaction.options.getString('song', true);
  const voiceChannel = interaction.member?.voice?.channel;
  if (!voiceChannel) return sendError({ interaction }, 'You must be in a voice channel.');
  await handle({ guild: interaction.guild, user: interaction.user, voiceChannel, textChannelId: interaction.channel.id, interaction, isSlash: true }, query, client);
}
