// xoxo/commands/vcControls/disconnect.ts
//
// Disconnect one or more members from their voice channel. Defaults to the invoker.
//
// Prefix:  $disconnect [user ...]
// Slash:   /disconnect [user] [additional_users]

import { PermissionFlagsBits } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendSuccess, sendError } from '../../components/statusMessages.js';
import { resolveUser } from '../../helpers/userResolver.js';

export const options = {
  name:        'disconnect',
  aliases:     ['dsc', 'devoice'] as string[],
  description: 'Disconnect one or more members from their voice channels. Defaults to yourself.',
  usage:       'disconnect [user ...]',
  category:    'vcControls',
  owner:       false,
  cooldown:    3,
};

async function handle(
  ctx:           { message?: any; interaction?: any },
  guild:         any,
  targetUsers:   any[],
  commandUserId: string,
  invalidUsers:  string[] = [],
): Promise<any> {
  const results = invalidUsers.map((user) => `User not found: \`${user}\`.`);
  let failed = invalidUsers.length > 0;

  for (const targetUser of targetUsers) {
    const targetMember = await guild.members.fetch(targetUser.id).catch((): null => null);
    if (!targetMember) {
      results.push(`<@${targetUser.id}> could not be found in this server.`);
      failed = true;
      continue;
    }

    // Use voiceStates cache directly — member.voice?.channel can read stale data
    // when the member object was freshly fetched from the REST API.
    const voiceState = guild.voiceStates.cache.get(targetUser.id);
    if (!voiceState?.channelId) {
      results.push(
        targetUser.id === commandUserId
          ? 'You are not in any voice channel.'
          : `<@${targetUser.id}> is not in any voice channel.`,
      );
      failed = true;
      continue;
    }

    const channelId = voiceState.channelId;
    const disconnected = await targetMember.voice.disconnect().catch((): null => null);
    if (!disconnected) {
      results.push(`Failed to disconnect <@${targetUser.id}>.`);
      failed = true;
      continue;
    }

    results.push(
      targetUser.id === commandUserId
        ? `Disconnected you from <#${channelId}>.`
        : `Disconnected <@${targetUser.id}> from <#${channelId}>.`,
    );
  }

  const result = results.join('\n');
  return failed ? sendError(ctx, result) : sendSuccess(ctx, result);
}

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.MoveMembers))
    return sendError(ctx, 'You need the **Move Members** permission to use this command.');

  const botMember = await message.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.MoveMembers))
    return sendError(ctx, 'I need the **Move Members** permission to disconnect members.');

  const targets = new Map<string, any>();
  const invalidUsers: string[] = [];
  for (const arg of args) {
    const resolved = await resolveUser(client, message.guild, arg);
    if (resolved) targets.set(resolved.id, resolved);
    else invalidUsers.push(arg);
  }

  if (!args.length) targets.set(message.author.id, message.author);
  return handle(ctx, message.guild, [...targets.values()], message.author.id, invalidUsers);
}

export async function slashExecute(
  interaction: any,
  client:      CassieClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx = { interaction };
  if (!interaction.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.MoveMembers))
    return sendError(ctx, 'You need the **Move Members** permission to use this command.');

  const botMember = await interaction.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.MoveMembers))
    return sendError(ctx, 'I need the **Move Members** permission to disconnect members.');

  const targets = new Map<string, any>();
  const selectedUser = interaction.options.getUser('user');
  if (selectedUser) targets.set(selectedUser.id, selectedUser);

  const invalidUsers: string[] = [];
  const additionalUsers: string = interaction.options.getString('additional_users') ?? '';
  for (const arg of additionalUsers.trim().split(/\s+/).filter(Boolean)) {
    const resolved = await resolveUser(client, interaction.guild, arg);
    if (resolved) targets.set(resolved.id, resolved);
    else invalidUsers.push(arg);
  }

  if (!targets.size && !invalidUsers.length) targets.set(interaction.user.id, interaction.user);
  return handle(ctx, interaction.guild, [...targets.values()], interaction.user.id, invalidUsers);
}
