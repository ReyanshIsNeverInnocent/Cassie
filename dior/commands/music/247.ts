// xoxo/commands/music/247.ts
import { ChannelType } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess, sendInfo } from '../../components/statusMessages.js';
import { join247Voice, clearRejoin, removeIdleVoiceConnection } from '../../helpers/twentyFourSeven.js';

export const options = {
  name: '24/7',
  aliases: ['247', 'twentyfourseven', 'stay'] as string[],
  description: 'Manage 24/7 mode — keep the bot permanently connected to a voice channel.',
  usage: '24/7 <enable [channel] | disable | view>',
  category: 'music',
  isDeveloper: false,
  userPerms: ['ManageGuild'] as string[],
  botPerms: [] as string[],
  player: false,
  inVoiceChannel: false,
  sameVoiceChannel: false,
  cooldown: 5,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function resolveVoiceChannel(guild: any, raw: string | null): any | null {
  if (!raw) return null;
  const idMatch = raw.match(/^<#(\d+)>$/) ?? raw.match(/^(\d{17,20})$/);
  const channelId = idMatch ? idMatch[1] : raw.trim();
  const channel = guild.channels.cache.get(channelId);
  // isVoiceBased() covers both regular voice and stage channels — the slash
  // variant's addChannelTypes() already allows both, so the prefix path must
  // match or `24/7 enable <stage-channel-id>` would silently reject a value
  // the slash command happily accepts.
  if (!channel || !channel.isVoiceBased?.()) return null;
  return channel;
}

function getTextChannelId(ctx: { message?: any; interaction?: any; isSlash: boolean }, guild: any): string {
  return (
    ctx.message?.channel?.id ??
    ctx.interaction?.channelId ??
    guild.systemChannelId ??
    guild.id
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcommand handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleEnable(
  ctx: { message?: any; interaction?: any; isSlash: boolean },
  guild: any,
  rawArg: string | null,
  client: CassieClient,
): Promise<any> {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };

  // Resolve target voice channel.
  // If no arg, fall back to the bot's current VC; error if neither exists.
  let targetChannel: any = null;
  if (rawArg) {
    targetChannel = resolveVoiceChannel(guild, rawArg);
    if (!targetChannel) {
      return sendError(ctxObj, 'Could not find that voice channel. Please mention it or provide its ID.');
    }
  } else {
    const botVoice = guild.members.me?.voice?.channel;
    if (!botVoice) {
      return sendError(
        ctxObj,
        'I am not in any voice channel. Either join a voice channel first, or provide a channel to lock me in.',
      );
    }
    targetChannel = botVoice;
  }

  // Check permissions up front — a bad Connect grant otherwise saves
  // fine to the DB but the bot then silently fails to actually be there,
  // and every future rejoin attempt (boot, disconnect, queue-end) fails too.
  const botMember = guild.members.me;
  const perms = botMember ? targetChannel.permissionsFor(botMember) : null;
  if (!perms?.has('Connect')) {
    return sendError(ctxObj, `I don't have permission to join <#${targetChannel.id}>. Please grant Connect first.`);
  }

  // If already enabled in the same channel, skip.
  const current = await client.db?.get24Seven(guild.id).catch((): null => null);
  if (current?.enabled && current.channelId === targetChannel.id) {
    const player = client.kazagumo.players.get(guild.id) as any;
    if (!player || (!player.playing && !player.paused)) {
      try {
        await join247Voice(client, guild, targetChannel.id);
      } catch (error) {
        return sendError(
          ctxObj,
          `Could not connect to <#${targetChannel.id}>: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return sendInfo(ctxObj, `24/7 is already enabled in <#${targetChannel.id}>. No changes made.`);
  }

  // Save to DB (simple channelId string, enabled=true).
  await client.db?.set24Seven(guild.id, targetChannel.id);

  // Clear any pending rejoin for a clean state.
  clearRejoin(guild.id);

  const textId = getTextChannelId(ctx, guild);
  const player = client.kazagumo.players.get(guild.id) as any;

  if (player && (player.playing || player.paused)) {
    // Keep an active music player intact; idle players are replaced by an
    // audio-less voice connection in join247Voice().
    if (player.voiceId !== targetChannel.id) {
      player.setVoiceChannel(targetChannel.id);
      player.textId = textId;
    }
  } else {
    try {
      await join247Voice(client, guild, targetChannel.id);
    } catch (error) {
      return sendError(
        ctxObj,
        `Could not connect to <#${targetChannel.id}>: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  // If already in targetChannel, nothing to do — bot stays.

  return sendSuccess(ctxObj, `24/7 mode enabled! I will stay in <#${targetChannel.id}> permanently.`);
}

async function handleDisable(
  ctx: { message?: any; interaction?: any; isSlash: boolean },
  guild: any,
  client: CassieClient,
): Promise<any> {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };
  const current = await client.db?.get24Seven(guild.id).catch((): null => null);

  if (!current?.enabled) {
    return sendInfo(ctxObj, '24/7 mode is not currently enabled in this server.');
  }

  clearRejoin(guild.id);
  await client.db?.clear24Seven(guild.id);
  if (!client.kazagumo.players.get(guild.id)) removeIdleVoiceConnection(guild.id);

  return sendSuccess(ctxObj, '24/7 mode has been disabled. The bot will leave normally when the queue ends.');
}

async function handleView(
  ctx: { message?: any; interaction?: any; isSlash: boolean },
  guild: any,
  client: CassieClient,
): Promise<any> {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };
  const current = await client.db?.get24Seven(guild.id).catch((): null => null);

  if (!current?.enabled) {
    return sendInfo(ctxObj, '24/7 mode is not currently enabled in this server.');
  }

  return sendInfo(ctxObj, `24/7 channel: <#${current.channelId}>`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  const subcommand = args[0]?.toLowerCase();
  const ctx = { message, isSlash: false };

  if (subcommand === 'enable') {
    // Pass the first arg after 'enable' (could be mention or ID).
    await handleEnable(ctx, message.guild, args[1] ?? null, client);
  } else if (subcommand === 'disable') {
    await handleDisable(ctx, message.guild, client);
  } else if (subcommand === 'view') {
    await handleView(ctx, message.guild, client);
  } else {
    await sendError({ message }, `Invalid subcommand. Usage: \`${options.usage}\``);
  }
}

export async function slashExecute(interaction: any, client: CassieClient) {
  await interaction.deferReply();
  const sub = interaction.options.getSubcommand();
  const ctx = { interaction, isSlash: true };

  if (sub === 'enable') {
    const channel = interaction.options.getChannel('channel', false);
    await handleEnable(ctx, interaction.guild, channel?.id ?? null, client);
  } else if (sub === 'disable') {
    await handleDisable(ctx, interaction.guild, client);
  } else if (sub === 'view') {
    await handleView(ctx, interaction.guild, client);
  }
}
