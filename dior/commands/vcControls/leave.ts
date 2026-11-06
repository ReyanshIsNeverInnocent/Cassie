// xoxo/commands/vcControls/leave.ts
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendSuccess, sendError } from '../../components/statusMessages.js';
import { disableNowPlayingButtons, clearPlayerState } from '../../helpers/nowPlayingManager.js';
import { removeIdleVoiceConnection, scheduleRejoin } from '../../helpers/twentyFourSeven.js';

export const options = {
  name: 'leave',
  aliases: [] as string[],
  description: 'Make the bot leave the voice channel.',
  usage: 'leave',
  category: 'vcControls',
  isDeveloper: false,
  userPerms: [] as string[],
  botPerms: [] as string[],
  player: false,
  inVoiceChannel: false,
  sameVoiceChannel: false,
  cooldown: 5,
};

async function handle(ctx: any, client: CassieClient, guildId: string) {
  const player: any = client.kazagumo.players.get(guildId);
  const guild = client.guilds.cache.get(guildId);
  const channelId: string | null = player?.voiceId ?? guild?.members?.me?.voice?.channelId ?? null;
  if (!channelId) return sendError(ctx, 'I am not in any voice channel.');

  if (player) {
    await disableNowPlayingButtons(client, player).catch((): null => null);
    await player.destroy().catch((): null => null);
    clearPlayerState(guildId);
  } else {
    removeIdleVoiceConnection(guildId);
  }

  // If 24/7 mode is enabled, schedule a rejoin so the bot comes back.
  const settings = await (client as any).db?.get24Seven?.(guildId).catch((): null => null);
  if (settings?.enabled) {
    scheduleRejoin(client, guildId, settings.channelId, 2000);
    return sendSuccess(
      ctx,
      `Left <#${channelId}>. Rejoining 24/7 channel <#${settings.channelId}> shortly.`,
    );
  }

  return sendSuccess(ctx, `Left <#${channelId}>.`);
}

export async function prefixExecute(message: any, _args: string[], client: CassieClient) {
  return handle({ message }, client, message.guild.id);
}

export async function slashExecute(interaction: any, client: CassieClient) {
  await interaction.deferReply();
  const ctx = { interaction };
  if (!interaction.guild) return sendError(ctx, 'This command can only be used in a server.');
  return handle(ctx, client, interaction.guild.id);
}
