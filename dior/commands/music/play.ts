// xoxo/commands/music/play.ts
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import {
  sendLoadingMessage,
  sendTrackAddedMessage,
  sendPlaylistAddedMessage,
} from '../../components/music/addedToQueue.js';
import { extractThumbnail, formatDuration } from '../../utils/formatting.js';
import { unifiedSearch } from '../../helpers/sourceSearch.js';
import { updateNowPlayingMessage } from '../../helpers/nowPlayingManager.js';
import { addTracks } from '../../helpers/sessionQueue.js';
import { join247Voice, releaseIdleVoiceForMusic } from '../../helpers/twentyFourSeven.js';

export const options = {
  name: 'play',
  aliases: ['p'] as string[],
  description: 'Play a song or add it to the queue.',
  usage: 'play <song name or URL>',
  category: 'music',
  isDeveloper: false,
  userPerms: [] as string[],
  botPerms: [] as string[],
  player: false,
  inVoiceChannel: true,
  sameVoiceChannel: false,
  cooldown: 3,
};

async function handle(
  ctx: { guild: any; user: any; voiceChannel: any; textChannelId: string; message?: any; interaction?: any; isSlash: boolean },
  query: string,
  client: CassieClient,
) {
  const { guild, user, voiceChannel, textChannelId, message, interaction, isSlash } = ctx;

  // ctxObj — used BEFORE the loading message is sent (no existingMessage yet)
  const ctxObj = isSlash ? { interaction } : { message };

  if (!query) return sendError(ctxObj, 'Please provide a song name or URL.');

  const loadingMsg = await sendLoadingMessage(ctxObj as any, query);

  // errCtx — used AFTER the loading message is sent.
  // For prefix: pass loadingMsg as existingMessage so sendError edits the
  //   loading message in place rather than leaving it orphaned.
  // For slash: interaction is already deferred+replied, so editReply replaces
  //   the loading content automatically — no change needed.
  const errCtx = isSlash
    ? { interaction }
    : { message: message!, existingMessage: loadingMsg as any };

  let result: any;
  try {
    result = await unifiedSearch(client as any, query, user);
  } catch {
    return sendError(errCtx, 'Failed to search for that song. Please try again.');
  }

  if (!result?.tracks?.length) {
    return sendError(
      errCtx,
      result?.requestedSource
        ? `No results found using the requested source (**${result.requestedSource}**). The source may be unavailable on the connected Lavalink node.`
        : 'No results found for your query.',
    );
  }

  let player: any;
  releaseIdleVoiceForMusic(guild.id, voiceChannel.id);
  try {
    player = await (client as any).kazagumo.createPlayer({
      guildId: guild.id,
      voiceId: voiceChannel.id,
      textId:  textChannelId,
      deaf:    true,
      volume:  100,
    });
  } catch (err: any) {
    const saved247 = await client.db?.get24Seven(guild.id).catch((): null => null);
    if (saved247?.enabled) {
      try {
        await join247Voice(client, guild, saved247.channelId);
      } catch (restoreError) {
        console.error(`[24-7] Could not restore voice after music connection failed in ${guild.name}: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`);
      }
    }
    return sendError(errCtx, `Could not connect to your voice channel: ${err?.message ?? 'unknown error'}`);
  }

  player.textId = textChannelId;
  if (player.voiceId && player.voiceId !== voiceChannel.id) {
    player.setVoiceChannel(voiceChannel.id);
  }

  if (result.type === 'PLAYLIST') {
    const firstTrack    = result.tracks[0];
    const playlistCount = result.tracks.length;

    // ⚠ ORDER MATTERS — KazagumoQueue.add(tracks[]) calls shift() when there's
    // no current track, dropping the first element from the array BEFORE we can
    // tag it. Tag all tracks first, THEN hand the array to Kazagumo.
    addTracks(player, result.tracks, user);
    player.queue.add(result.tracks);

    const thumbnail = firstTrack?.thumbnail ?? extractThumbnail(firstTrack) ?? undefined;

    if (loadingMsg) {
      await sendPlaylistAddedMessage(
        isSlash ? { interaction } : { message: message!, existingMessage: loadingMsg as any },
        { name: result.playlistName || 'Unknown Playlist', trackCount: playlistCount, thumbnail },
      );
    }
  } else {
    const track   = result.tracks[0];
    addTracks(player, [track], user);
    player.queue.add(track);

    const queuePos  = player.queue.length;
    const thumbnail = track.thumbnail ?? extractThumbnail(track) ?? undefined;

    if (loadingMsg) {
      await sendTrackAddedMessage(
        isSlash ? { interaction } : { message: message!, existingMessage: loadingMsg as any },
        {
          title:    track.title,
          author:   track.author || 'Unknown',
          duration: track.length ? formatDuration(track.length) : 'LIVE',
          position: queuePos,
          url:      track.uri,
          thumbnail,
        },
      );
    }
  }

  if (!player.playing && !player.paused) {
    await player.play().catch((): null => null);
  } else {
    // Player is already playing or paused — just refresh the now-playing panel
    // to show the updated queue without touching playback state.
    await updateNowPlayingMessage(client as any, player).catch((): null => null);
  }
}

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  const query        = args.join(' ');
  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) return sendError({ message }, 'You must be in a voice channel.');

  await handle(
    { guild: message.guild, user: message.author, voiceChannel, textChannelId: message.channel.id, message, isSlash: false },
    query,
    client,
  );
}

export async function slashExecute(interaction: any, client: CassieClient) {
  const query        = interaction.options.getString('song', true);
  const voiceChannel = interaction.member?.voice?.channel;
  if (!voiceChannel) return sendError({ interaction }, 'You must be in a voice channel.');

  await handle(
    { guild: interaction.guild, user: interaction.user, voiceChannel, textChannelId: interaction.channel.id, interaction, isSlash: true },
    query,
    client,
  );
}
