import { config } from '../../config.js';
// xoxo/commands/music/grab.ts
import {
  ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder,
  MessageFlags, SeparatorBuilder, TextDisplayBuilder,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { extractThumbnail, formatDuration } from '../../utils/formatting.js';

export const options = {
  name: 'grab',
  aliases: [] as string[],
  description: 'DM yourself the details of the currently playing track.',
  usage: 'grab',
  category: 'music',
  isDeveloper: false,
  userPerms: [] as string[],
  botPerms: [] as string[],
  player: true,
  inVoiceChannel: false,
  sameVoiceChannel: false,
  cooldown: 5,
};

function buildPayload(track: any): any {
  const thumb = track.thumbnail ?? extractThumbnail(track) ?? null;
  const lines = [
    `## ${track.title}`,
    `**Artist:** ${track.author || 'Unknown'}`,
    `**Duration:** ${track.length ? formatDuration(track.length) : 'LIVE'}`,
    track.uri ? `**Link:** ${track.uri}` : null,
    track.requester?.username ? `**Originally requested by:** ${track.requester.username}` : null,
  ].filter(Boolean) as string[];

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

  if (thumb) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(thumb)),
    );
  }

  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

async function handle(ctx: { message?: any; interaction?: any; isSlash: boolean; user: any }, guildId: string, client: CassieClient) {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };
  const player  = (client as any).kazagumo.players.get(guildId);
  if (!player?.queue?.current) return sendError(ctxObj, 'There is nothing currently playing.');

  const track = player.queue.current;
  const dm    = await ctx.user.createDM().catch((): null => null);
  if (!dm) return sendError(ctxObj, 'I could not DM you. Please enable DMs from server members.');

  const sent = await dm.send(buildPayload(track)).catch((): null => null);
  if (!sent) return sendError(ctxObj, 'I could not send you a DM.');

  return sendSuccess(ctxObj, 'Sent you the track details in your DMs.');
}

export async function prefixExecute(message: any, _args: string[], client: CassieClient) {
  await handle({ message, isSlash: false, user: message.author }, message.guild.id, client);
}
export async function slashExecute(interaction: any, client: CassieClient) {
  await interaction.deferReply({ ephemeral: true });
  await handle({ interaction, isSlash: true, user: interaction.user }, interaction.guild.id, client);
}
