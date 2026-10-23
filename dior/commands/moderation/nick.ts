// xoxo/commands/moderation/nick.ts
//
// Change or reset a member's server nickname.
//
// Prefix:  $nick <@user|ID|username> [new nickname]      — omit nickname to reset
//          $nick reset <user1> [user2] ... [user10]       — reset up to 10 at once
// Slash:   /nick set user:[user] nickname:[text]
//          /nick reset user:[user]
//
// Requires ManageNicknames for the invoker.
// Special case: when targeting the bot itself, uses the REST @me endpoint
// so the bot can always change its own nickname regardless of role hierarchy.

import { PermissionFlagsBits, REST, Routes } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { buildModLogNick } from '../../components/moderation/modlog.js';
import { sendModLog } from '../../utils/modlogHelper.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { sendInvokeResponse } from '../../helpers/invoke.js';

export const options = {
  name:        'nick',
  aliases:     ['nickname'] as string[],
  description: "Change or reset a member's server nickname.",
  usage: `nick <@user|ID|username> [new nickname]
nick reset <user1> [user2] ... [user10]`,
  category: 'moderation',
  owner:    false,
  cooldown: 3,
};

const MAX_NICK = 32;

/** Change the bot's own nickname via the @me REST endpoint. */
async function setBotSelfNick(
  guildId: string,
  nick:    string | null,
  token:   string,
): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.patch(Routes.guildMember(guildId, '@me'), { body: { nick } });
}

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx   = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.ManageNicknames)) {
    return sendError(ctx, 'You need the **Manage Nicknames** permission to change nicknames.');
  }

  if (!args.length) {
    return sendError(ctx, `Usage:\n\`\`\`\n${options.usage}\n\`\`\``);
  }

  // ── Reset mode: nick <user> or nick reset <user1> ... ───────────────────
  if (args[0]?.toLowerCase() === 'reset' || args.length === 1) {
    const rawTargets = args[0]?.toLowerCase() === 'reset'
      ? args.slice(1, 11) // cap at 10
      : args.slice(0, 1);
    if (!rawTargets.length) {
      return sendError(ctx, `Provide at least one user to reset.\nUsage: \`nick reset <user1> [user2] ... [user10]\``);
    }

    const botMember = guild.members.me;
    if (botMember && !botMember.permissions.has(PermissionFlagsBits.ManageNicknames)) {
      return sendError(ctx, 'I need the **Manage Nicknames** permission to change nicknames.');
    }

    const succeeded: string[] = [];
    const failed:    string[] = [];

    for (const raw of rawTargets) {
      const targetUser = await resolveUser(client, guild, raw);
      if (!targetUser) { failed.push(`\`${raw}\` (not found)`); continue; }

      const member = await guild.members.fetch(targetUser.id).catch((): null => null);
      if (!member) { failed.push(`**${targetUser.username}** (not in server)`); continue; }

      if (member.id === guild.ownerId) {
        failed.push(`**${targetUser.username}** (server owner)`);
        continue;
      }

      // Special case: bot itself
      if (member.id === client.user?.id) {
        const token = client.config.botToken;
        if (!token) { failed.push(`**${targetUser.username}** (no token)`); continue; }
        const oldNick = member.nickname as string | null;
        const ok = await setBotSelfNick(guild.id, null, token).then(() => true).catch(() => false);
        if (ok) {
          succeeded.push(`**${targetUser.username}**`);
          sendModLog(client, guild.id, buildModLogNick(targetUser, oldNick, null, message.author.username));
        } else {
          failed.push(`**${targetUser.username}**`);
        }
        continue;
      }

      if (!member.manageable) {
        failed.push(`**${targetUser.username}** (role too high)`);
        continue;
      }

      const oldNick = member.nickname as string | null;
      const ok = await member
        .setNickname(null, `Nickname reset by ${message.author.username}`)
        .then(() => true)
        .catch(() => false);

      if (ok) {
        succeeded.push(`**${targetUser.username}**`);
        sendModLog(client, guild.id, buildModLogNick(targetUser, oldNick, null, message.author.username));
      } else {
        failed.push(`**${targetUser.username}**`);
      }
    }

    const lines: string[] = [];
    if (succeeded.length) lines.push(`Reset: ${succeeded.join(', ')}`);
    if (failed.length)    lines.push(`Failed: ${failed.join(', ')}`);
    return sendSuccess(ctx, lines.join('\n') || 'Nothing to do.');
  }

  // ── Set mode: nick <user> <new nickname> ────────────────────────────────
  const targetUser = await resolveUser(client, guild, args[0]);
  if (!targetUser) return sendError(ctx, 'User not found. Try a mention, user ID, or username.');

  const member = await guild.members.fetch(targetUser.id).catch((): null => null);
  if (!member) return sendError(ctx, 'That user is not a member of this server.');

  const newNick = args.slice(1).join(' ').trim();
  if (!newNick) return sendError(ctx, 'Nickname cannot be empty.');
  if (newNick.length > MAX_NICK) {
    return sendError(ctx, `Nickname is too long (**${newNick.length}** chars). Maximum is **${MAX_NICK}** characters.`);
  }

  // ── Special case: bot changing its own nickname ──────────────────────────
  if (member.id === client.user?.id) {
    const token = client.config.botToken;
    if (!token) return sendError(ctx, 'Bot token is not configured.');
    const oldNick = member.nickname as string | null;
    try {
      await setBotSelfNick(guild.id, newNick, token);
    } catch (err: any) {
      return sendError(ctx, `Failed to change my nickname: ${err.message}`);
    }
    sendModLog(client, guild.id, buildModLogNick(targetUser, oldNick, newNick, message.author.username));
    if (await sendInvokeResponse(ctx, client, 'nick', { targetUser, reason: `Changed nickname to ${newNick}` })) return;
    return sendSuccess(ctx, `Changed my server nickname to **${newNick}**.`);
  }

  // ── Normal member flow ───────────────────────────────────────────────────
  const botMember = guild.members.me;
  if (botMember && !botMember.permissions.has(PermissionFlagsBits.ManageNicknames)) {
    return sendError(ctx, 'I need the **Manage Nicknames** permission to change nicknames.');
  }
  if (member.id === guild.ownerId) {
    return sendError(ctx, "I can't change the server owner's nickname.");
  }
  if (!member.manageable) {
    return sendError(ctx, "I can't change that member's nickname — they have a higher or equal role to me.");
  }

  const oldNick = member.nickname as string | null;
  await member.setNickname(newNick, `Nickname change requested by ${message.author.username}`);
  sendModLog(client, guild.id, buildModLogNick(targetUser, oldNick, newNick, message.author.username));
  if (await sendInvokeResponse(ctx, client, 'nick', { targetUser, reason: `Changed nickname to ${newNick}` })) return;
  return sendSuccess(ctx, `Set **${targetUser.username}**'s nickname to **${newNick}**.`);
}

export async function slashExecute(
  interaction: any,
  client:      CassieClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx   = { interaction };
  const guild = interaction.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.ManageNicknames)) {
    return sendError(ctx, 'You need the **Manage Nicknames** permission to change nicknames.');
  }

  const sub        = interaction.options.getSubcommand() as string;
  const targetUser = interaction.options.getUser('user', true);

  const member = await guild.members.fetch(targetUser.id).catch((): null => null);
  if (!member) return sendError(ctx, 'That user is not a member of this server.');

  // ── Special case: bot changing its own nickname ──────────────────────────
  if (member.id === client.user?.id) {
    const token = client.config.botToken;
    if (!token) return sendError(ctx, 'Bot token is not configured.');
    const oldNick = member.nickname as string | null;

    if (sub === 'reset') {
      try {
        await setBotSelfNick(guild.id, null, token);
      } catch (err: any) {
        return sendError(ctx, `Failed to reset my nickname: ${err.message}`);
      }
      sendModLog(client, guild.id, buildModLogNick(targetUser, oldNick, null, interaction.user.username));
        if (await sendInvokeResponse(ctx, client, 'nick', { targetUser, reason: 'Reset nickname' })) return;
      return sendSuccess(ctx, 'Reset my server nickname.');
    }

    const newNick: string = interaction.options.getString('nickname', true).trim();
    if (newNick.length > MAX_NICK) {
      return sendError(ctx, `Nickname is too long (**${newNick.length}** chars). Maximum is **${MAX_NICK}** characters.`);
    }
    try {
      await setBotSelfNick(guild.id, newNick, token);
    } catch (err: any) {
      return sendError(ctx, `Failed to change my nickname: ${err.message}`);
    }
    sendModLog(client, guild.id, buildModLogNick(targetUser, oldNick, newNick, interaction.user.username));
    if (await sendInvokeResponse(ctx, client, 'nick', { targetUser, reason: `Changed nickname to ${newNick}` })) return;
    return sendSuccess(ctx, `Changed my server nickname to **${newNick}**.`);
  }

  // ── Normal member flow ───────────────────────────────────────────────────
  const botMember = guild.members.me;
  if (botMember && !botMember.permissions.has(PermissionFlagsBits.ManageNicknames)) {
    return sendError(ctx, 'I need the **Manage Nicknames** permission to change nicknames.');
  }
  if (member.id === guild.ownerId) {
    return sendError(ctx, "I can't change the server owner's nickname.");
  }
  if (!member.manageable) {
    return sendError(ctx, "I can't change that member's nickname — they have a higher or equal role to me.");
  }

  if (sub === 'reset') {
    const oldNickReset = member.nickname as string | null;
    await member.setNickname(null, `Nickname reset by ${interaction.user.username}`);
    sendModLog(client, guild.id, buildModLogNick(targetUser, oldNickReset, null, interaction.user.username));
    if (await sendInvokeResponse(ctx, client, 'nick', { targetUser, reason: 'Reset nickname' })) return;
    return sendSuccess(ctx, `Reset **${targetUser.username}**'s nickname.`);
  }

  const newNick: string = interaction.options.getString('nickname', true).trim();
  if (newNick.length > MAX_NICK) {
    return sendError(ctx, `Nickname is too long (**${newNick.length}** chars). Maximum is **${MAX_NICK}** characters.`);
  }

  const oldNickSet = member.nickname as string | null;
  await member.setNickname(newNick, `Nickname change by ${interaction.user.username}`);
  sendModLog(client, guild.id, buildModLogNick(targetUser, oldNickSet, newNick, interaction.user.username));
  if (await sendInvokeResponse(ctx, client, 'nick', { targetUser, reason: `Changed nickname to ${newNick}` })) return;
  return sendSuccess(ctx, `Set **${targetUser.username}**'s nickname to **${newNick}**.`);
}
