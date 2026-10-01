// xoxo/commands/moderation/role.ts
//
// $role — manage one member's roles.
//
// Usage:
//   $role add <@user|ID|username> [@role|ID|name]
//   $role remove <@user|ID|username> [@role|ID|name]
//   $role <@user|ID|username>
//
// When no role is supplied, all three forms open the combined role picker.

import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { resolveRole } from '../../helpers/roleResolver.js';
import { sendRolePickerPanel } from '../../components/moderation/roleSelect.js';
import {
  buildRoleAllTargetPanel,
  buildRoleAllProgressPayload,
  buildRoleAllResultPayload,
  buildRoleAllTimedOutPayload,
  buildRoleAllCancelledPayload,
  type RoleAllTargetType,
} from '../../components/moderation/roleAll.js';

export const options = {
  name:        'role',
  aliases:     [] as string[],
  description: 'Add or remove a role from a member, or open the combined role manager.',
  usage: `role add <user> [role]
role remove <user> [role]
role all <role>
role all remove <role>
role hoist <role> [on|off]
role rename <role> <name>
role delete <role>
role mentionable <role> [on|off]
role create <name>
role color <role> <#hex>
role <user>`,
  category:    'moderation',
  owner:       false,
  cooldown: {
    default: 0,
    subcommands: {
      all: 30,
      'all-remove': 30,
      hoist: 3,
      rename: 3,
      delete: 5,
      mentionable: 3,
      create: 5,
      color: 3,
      add: 0,
      remove: 0,
    },
  },
};

function validateRole(guild: any, role: any, invokerMember?: any): string | null {
  if (!role) return 'Role not found. Use a mention, role ID, or the exact role name.';
  if (role.managed) return 'That role is managed by an integration and cannot be assigned manually.';
  if (role.id === guild.id) return 'The @everyone role cannot be assigned.';
  const botMember = guild.members.me;
  if (botMember && role.position >= botMember.roles.highest.position)
    return "I can't manage a role that is at or above my highest role.";
  // Server owners implicitly outrank every role — skip the hierarchy check for them.
  const invokerIsOwner = invokerMember && invokerMember.id === guild.ownerId;
  if (!invokerIsOwner && invokerMember && role.position >= invokerMember.roles.highest.position)
    return "You can't assign a role that is at or above your own highest role.";
  return null;
}

const ROLE_ALL_BATCH_SIZE = 10;
const ROLE_ALL_BATCH_DELAY_MS = 1000;

function parseToggle(value: string | undefined, current: boolean): boolean | null {
  if (!value) return !current;
  if (value.toLowerCase() === 'on') return true;
  if (value.toLowerCase() === 'off') return false;
  return null;
}

function resolveRoleTarget(guild: any, args: string[]): { role: any | null; remainder: string[] } {
  for (let end = args.length; end >= 1; end--) {
    const candidate = args.slice(0, end).join(' ');
    const role = resolveRole(guild, candidate);
    if (role) return { role, remainder: args.slice(end) };
  }

  const fallback = resolveRole(guild, args.join(' '));
  return { role: fallback, remainder: [] };
}

function roleTarget(guild: any, args: string[], start = 1): any | null {
  return resolveRoleTarget(guild, args.slice(start)).role;
}

async function removeRoleFromEveryone(
  message: any,
  guild: any,
  role: any,
): Promise<any> {
  let members: Map<string, any>;
  try {
    members = await guild.members.fetch();
  } catch {
    members = guild.members.cache;
  }

  const eligible = [...members.values()].filter((member: any) => member.roles.cache.has(role.id));
  let removed = 0;
  let failed = 0;
  for (let index = 0; index < eligible.length; index += ROLE_ALL_BATCH_SIZE) {
    const batch = eligible.slice(index, index + ROLE_ALL_BATCH_SIZE);
    await Promise.all(batch.map((member: any) =>
      member.roles.remove(role, `role all remove by ${message.author.username}`)
        .then(() => { removed++; }).catch(() => { failed++; }),
    ));
    if (index + ROLE_ALL_BATCH_SIZE < eligible.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, ROLE_ALL_BATCH_DELAY_MS));
    }
  }
  return sendSuccess({ message }, `Removed <@&${role.id}> from **${removed}** member${removed !== 1 ? 's' : ''}${failed ? `; **${failed}** failed.` : '.'}`);
}

async function handleRoleManagement(message: any, args: string[], guild: any, invokerMember: any): Promise<any | undefined> {
  const action = args[0].toLowerCase();
  if (!['hoist', 'rename', 'delete', 'mentionable', 'create', 'color', 'all'].includes(action)) return undefined;
  if (action === 'all' && args[1]?.toLowerCase() !== 'remove') return undefined;

  if (action === 'create') {
    const name = args.slice(1).join(' ').trim();
    if (!name) return sendError({ message }, 'Usage: `role create <name>`');
    if (name.length > 100) return sendError({ message }, 'Role name cannot exceed 100 characters.');
    try {
      const role = await guild.roles.create({ name, reason: `Role created by ${message.author.username}` });
      return sendSuccess({ message }, `Created <@&${role.id}>.`);
    } catch {
      return sendError({ message }, 'I could not create that role.');
    }
  }

  if (action === 'all' && args[1]?.toLowerCase() === 'remove') {
    const { role } = resolveRoleTarget(guild, args.slice(2));
    const roleErr = validateRole(guild, role, invokerMember);
    if (roleErr) return sendError({ message }, roleErr);
    return removeRoleFromEveryone(message, guild, role);
  }

  if (action === 'hoist' || action === 'mentionable') {
    const property = action === 'hoist' ? 'hoist' : 'mentionable';
    const stateArg = args[args.length - 1]?.toLowerCase();
    const hasState = ['on', 'off'].includes(stateArg);
    const selectorArgs = hasState ? args.slice(1, -1) : args.slice(1);
    const { role: targetRole } = resolveRoleTarget(guild, selectorArgs);
    const targetRoleErr = validateRole(guild, targetRole, invokerMember);
    if (targetRoleErr) return sendError({ message }, targetRoleErr);
    const value = parseToggle(hasState ? stateArg : undefined, targetRole[property]);
    if (value === null) return sendError({ message }, `Use \`${action} <role> [on|off]\`.`);
    if (value === targetRole[property]) {
      return sendInfo({ message }, `${action === 'hoist' ? 'Hoisting' : 'Mentionability'} is already **${value ? 'on' : 'off'}** for <@&${targetRole.id}>.`);
    }
    await targetRole.edit({ [property]: value }, `Role ${property} changed by ${message.author.username}`);
    return sendSuccess({ message }, `${action === 'hoist' ? 'Hoisting' : 'Mentionability'} for <@&${targetRole.id}> is now **${value ? 'on' : 'off'}**.`);
  }

  const { role, remainder } = resolveRoleTarget(guild, args.slice(1));
  const roleErr = validateRole(guild, role, invokerMember);
  if (roleErr) return sendError({ message }, roleErr);
  if (action === 'rename') {
    const name = remainder.join(' ').trim();
    if (!name) return sendError({ message }, 'Usage: `role rename <role> <name>`');
    if (name.length > 100) return sendError({ message }, 'Role name cannot exceed 100 characters.');
    const oldName = role.name;
    await role.setName(name, `Role renamed by ${message.author.username}`);
    return sendSuccess({ message }, `Renamed **${oldName}** to **${name}**.`);
  }
  if (action === 'delete') {
    const oldName = role.name;
    await role.delete(`Role deleted by ${message.author.username}`);
    return sendSuccess({ message }, `Deleted role **${oldName}**.`);
  }
  if (action === 'color') {
    const color = remainder.join(' ').replace(/^#/, '').trim();
    if (!color || !/^[0-9a-f]{6}$/i.test(color)) return sendError({ message }, 'Provide a valid 6-digit hex color, such as `#5865F2`.');
    await role.setColor(`#${color}`, `Role color changed by ${message.author.username}`);
    return sendSuccess({ message }, `Set <@&${role.id}> color to **#${color.toUpperCase()}**.`);
  }
  return undefined;
}

async function runRoleAll(
  panel: any,
  guild: any,
  role: any,
  targetType: RoleAllTargetType,
  invoker: string,
): Promise<void> {
  await panel.edit(buildRoleAllProgressPayload(role.name, targetType)).catch((): null => null);

  let members: Map<string, any>;
  let usingCache = false;
  try {
    members = await guild.members.fetch();
  } catch {
    members = guild.members.cache;
    usingCache = true;
  }

  const eligible = [...members.values()].filter((member: any) => {
    if (targetType === 'humans' && member.user.bot) return false;
    if (targetType === 'bots' && !member.user.bot) return false;
    return !member.roles.cache.has(role.id);
  });
  const skipped = [...members.values()].filter((member: any) => {
    if (targetType === 'humans' && member.user.bot) return false;
    if (targetType === 'bots' && !member.user.bot) return false;
    return member.roles.cache.has(role.id);
  }).length;

  let added = 0;
  let failed = 0;
  const reason = `role (all ${targetType}) by ${invoker}`;

  for (let index = 0; index < eligible.length; index += ROLE_ALL_BATCH_SIZE) {
    const batch = eligible.slice(index, index + ROLE_ALL_BATCH_SIZE);
    await Promise.all(batch.map((member: any) =>
      member.roles.add(role, reason).then(() => { added++; }).catch(() => { failed++; }),
    ));
    if (index + ROLE_ALL_BATCH_SIZE < eligible.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, ROLE_ALL_BATCH_DELAY_MS));
    }
  }

  await panel.edit(
    buildRoleAllResultPayload(role.name, role.id, targetType, added, skipped, failed, usingCache),
  ).catch((): null => null);
}

async function resolveTargetMember(
  message: any,
  args: string[],
  client: CassieClient,
): Promise<{ targetUser: any; member: any } | null> {
  const targetUser = await resolveUser(client, message.guild, args[0]);
  if (!targetUser) {
    await sendError(
      { message },
      'User not found. Try a mention, user ID, or username.',
    );
    return null;
  }

  const member = await message.guild.members.fetch(targetUser.id).catch((): null => null);
  if (!member) {
    await sendError({ message }, 'That user is not a member of this server.');
    return null;
  }

  return { targetUser, member };
}

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx   = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerMember = message.member;
  if (!message.channel.permissionsFor?.(invokerMember)?.has?.(PermissionFlagsBits.ManageRoles))
    return sendError(ctx, 'You need the **Manage Roles** permission to use this command.');

  if (!guild.members.me?.permissions?.has?.(PermissionFlagsBits.ManageRoles))
    return sendError(ctx, 'I need the **Manage Roles** permission.');

  if (!args[0]) return sendError(ctx, `Usage: \`${options.usage}\``);

  const managementResult = await handleRoleManagement(message, args, guild, invokerMember);
  if (managementResult !== undefined) return managementResult;

  if (args[0].toLowerCase() === 'all') {
    if (!args[1]) return sendError(ctx, 'Usage: `role all <@role|ID|name>`');

    const role = resolveRole(guild, args.slice(1).join(' '));
    const roleErr = validateRole(guild, role, invokerMember);
    if (roleErr) return sendError(ctx, roleErr);

    const token = `${message.id}-${Date.now()}`;
    const panel = await message.channel.send(
      buildRoleAllTargetPanel(role.name, role.id, guild.memberCount, token),
    ).catch((): null => null);
    if (!panel) return;

    const collector = panel.createMessageComponentCollector({
      filter: (interaction: any) => {
        if (!interaction.customId.startsWith('roleall:') || !interaction.customId.endsWith(`:${token}`)) return false;
        if (interaction.user.id !== message.author.id) {
          interaction.reply({
            content: 'Only the person who ran this command can use this.',
            flags: MessageFlags.Ephemeral,
          }).catch((): null => null);
          return false;
        }
        return true;
      },
      max: 1,
      time: 30_000,
    });

    collector.on('collect', async (interaction: any) => {
      await interaction.deferUpdate().catch((): null => null);
      const action = interaction.customId.split(':')[1] as string;
      if (action === 'cancel') {
        await panel.edit(buildRoleAllCancelledPayload()).catch((): null => null);
        return;
      }
      await runRoleAll(panel, guild, role, action as RoleAllTargetType, message.author.username);
    });

    collector.on('end', async (_collected: any, reason: string) => {
      if (reason === 'time') await panel.edit(buildRoleAllTimedOutPayload()).catch((): null => null);
    });
    return;
  }

  const action = args[0].toLowerCase();
  const hasAction = action === 'add' || action === 'remove';
  const targetArg = hasAction ? args[1] : args[0];
  const roleArg = hasAction ? args.slice(2).join(' ') : undefined;

  if (!targetArg || (!hasAction && args.length > 1)) {
    return sendError(ctx, `Usage: \`${options.usage}\``);
  }

  const resolved = await resolveTargetMember(message, [targetArg], client);
  if (!resolved) return;
  const { targetUser, member } = resolved;

  // No role given — every prefix form uses the same combined picker.
  if (!roleArg) {
    return sendRolePickerPanel({ channel: message.channel }, guild, member, message.author.id, invokerMember);
  }

  const role = resolveRole(guild, roleArg);
  const roleErr = validateRole(guild, role, invokerMember);
  if (roleErr) return sendError(ctx, roleErr);

  if (action === 'remove') {
    if (!member.roles.cache.has(role.id)) {
      return sendInfo(ctx, `**${targetUser.username}** doesn't have the <@&${role.id}> role.`);
    }
    await member.roles.remove(role, `Role remove by ${message.author.username}`);
    return sendSuccess(ctx, `Removed <@&${role.id}> from **${targetUser.username}**.`);
  }

  if (member.roles.cache.has(role.id)) {
    return sendInfo(ctx, `**${targetUser.username}** already has the <@&${role.id}> role.`);
  }
  await member.roles.add(role, `Role add by ${message.author.username}`);
  return sendSuccess(ctx, `Added <@&${role.id}> to **${targetUser.username}**.`);
}
