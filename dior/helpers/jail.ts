// xoxo/helpers/jail.ts
//
// Shared jail configuration, channel-overwrite, role, and target helpers.
//
// Setup:
//   • Creates or repairs a non-hoisted, non-mentionable white "Jailed" role.
//   • Denies ViewChannel and SendMessages for that role in every editable
//     guild channel.
//   • Optionally allows those permissions in one configured channel.
//
// The helper only edits the Jailed role's two requested permission bits. It
// never deletes existing overwrites, removes a member's other roles, or changes
// @everyone permissions.

import { PermissionFlagsBits } from 'discord.js';
import type { CassieClient } from '../structures/CassieClient.js';

export const JAIL_ROLE_NAME = 'Jailed';

const JAIL_DENY = {
  ViewChannel: false,
  SendMessages: false,
} as const;

const JAIL_ALLOW = {
  ViewChannel: true,
  SendMessages: true,
} as const;

export type JailContext = { message?: any; interaction?: any };

export function hasJailSetupPermissions(member: any): boolean {
  return Boolean(
    member?.permissions?.has?.(PermissionFlagsBits.ManageRoles) &&
    member?.permissions?.has?.(PermissionFlagsBits.ManageChannels),
  );
}

export function hasJailMemberPermission(member: any): boolean {
  return Boolean(member?.permissions?.has?.(PermissionFlagsBits.ManageRoles));
}

export function getGuildBotMember(guild: any): any | null {
  return guild?.members?.me ?? null;
}

export async function getConfiguredJailRole(
  guild: any,
  client: CassieClient,
): Promise<{ config: any; role: any } | null> {
  if (!client.db || !guild) return null;

  const config = await client.db.getJailConfig(guild.id).catch((): null => null);
  if (!config) return null;

  const role =
    guild.roles.cache.get(config.role_id) ??
    await guild.roles.fetch(config.role_id).catch((): null => null);
  if (!role) return null;

  return { config, role };
}

/**
 * Return the members that currently have the configured Jailed role.
 *
 * Fetching the guild first makes `jail list` useful after a restart too,
 * instead of depending only on whichever members Discord has cached.
 */
export async function getJailedMembers(guild: any, role: any): Promise<any[]> {
  const fetched = await guild?.members?.fetch?.().catch((): null => null);
  const members = fetched
    ? [...fetched.values()]
    : [...(role?.members?.values?.() ?? [])];

  return members
    .filter((member: any) => member?.roles?.cache?.has?.(role?.id))
    .sort((a: any, b: any) =>
      (a.displayName ?? a.user?.username ?? '').localeCompare(
        b.displayName ?? b.user?.username ?? '',
        undefined,
        { sensitivity: 'base' },
      ),
    );
}

export async function applyJailOverwrite(
  channel: any,
  role: any,
  allowed: boolean,
  reason: string,
): Promise<boolean> {
  if (!channel?.guild || channel.isThread?.() || typeof channel.permissionOverwrites?.edit !== 'function') {
    return false;
  }

  await channel.permissionOverwrites.edit(
    role,
    allowed ? JAIL_ALLOW : JAIL_DENY,
    { reason },
  );
  return true;
}

async function fetchGuildChannels(guild: any): Promise<any[]> {
  const fetched = await guild.channels.fetch().catch((): null => null);
  if (fetched) return [...fetched.values()];
  return [...(guild.channels.cache?.values?.() ?? [])];
}

async function findOrCreateJailRole(
  guild: any,
  client: CassieClient,
  botMember: any,
  reason: string,
): Promise<any | { error: string }> {
  const existingConfig = client.db
    ? await client.db.getJailConfig(guild.id).catch((): null => null)
    : null;

  let role =
    (existingConfig?.role_id
      ? guild.roles.cache.get(existingConfig.role_id) ??
        await guild.roles.fetch(existingConfig.role_id).catch((): null => null)
      : null) ??
    guild.roles.cache.find(
      (candidate: any) =>
        candidate.name.toLowerCase() === JAIL_ROLE_NAME.toLowerCase() &&
        !candidate.managed,
    ) ??
    null;

  if (role && role.position >= (botMember?.roles?.highest?.position ?? 0)) {
    return { error: `I cannot manage the **${JAIL_ROLE_NAME}** role because it is at or above my highest role.` };
  }

  if (!role) {
    role = await guild.roles.create({
      name: JAIL_ROLE_NAME,
      color: 0xffffff,
      hoist: false,
      mentionable: false,
      reason,
    }).catch((err: any): null => {
      console.error(`[jail] failed to create role in ${guild.id}: ${err?.message ?? err}`);
      return null;
    });
    if (!role) return { error: `I could not create the **${JAIL_ROLE_NAME}** role.` };
  } else {
    const edited = await role.edit({
      name: JAIL_ROLE_NAME,
      color: 0xffffff,
      hoist: false,
      mentionable: false,
      reason,
    }).catch((err: any): null => {
      console.error(`[jail] failed to repair role ${role.id}: ${err?.message ?? err}`);
      return null;
    });
    if (!edited) return { error: `I could not update the **${JAIL_ROLE_NAME}** role.` };
    role = edited;
  }

  return role;
}

export async function configureJail(
  guild: any,
  client: CassieClient,
  allowedChannelId: string | null,
  reason: string,
): Promise<
  | { role: any; channelCount: number; failedChannels: string[] }
  | { error: string }
> {
  if (!client.db) return { error: 'Database is unavailable right now.' };

  const botMember = getGuildBotMember(guild) ??
    await guild.members.fetchMe().catch((): null => null);
  if (!botMember) return { error: 'I could not resolve my server member.' };

  const roleResult = await findOrCreateJailRole(guild, client, botMember, reason);
  if ('error' in roleResult) return roleResult;

  await client.db.setJailConfig(guild.id, roleResult.id, allowedChannelId);

  const failedChannels: string[] = [];
  const channels = await fetchGuildChannels(guild);
  let channelCount = 0;

  for (const channel of channels) {
    if (!channel?.guild || channel.isThread?.() || typeof channel.permissionOverwrites?.edit !== 'function') {
      continue;
    }

    try {
      await applyJailOverwrite(
        channel,
        roleResult,
        channel.id === allowedChannelId,
        `Jail setup: ${channel.id === allowedChannelId ? 'allowed channel' : 'restrict jailed members'}`,
      );
      channelCount++;
    } catch (err: any) {
      failedChannels.push(channel.name ? `#${channel.name}` : channel.id);
      console.error(`[jail] failed to configure channel ${channel.id}: ${err?.message ?? err}`);
    }
  }

  return { role: roleResult, channelCount, failedChannels };
}

export async function removeJailSetup(
  guild: any,
  client: CassieClient,
  reason: string,
): Promise<
  | { role: any | null; removedOverwrites: number; failedChannels: string[] }
  | { error: string }
> {
  if (!client.db) return { error: 'Database is unavailable right now.' };

  const config = await client.db.getJailConfig(guild.id).catch((): null => null);
  if (!config) return { error: 'Jail is not configured.' };

  const role =
    guild.roles.cache.get(config.role_id) ??
    await guild.roles.fetch(config.role_id).catch((): null => null);

  const failedChannels: string[] = [];
  let removedOverwrites = 0;

  // Explicitly remove the role overwrites before deleting the role. Discord
  // also removes them when the role is deleted, but doing this first gives us
  // useful cleanup accounting and handles permissions as soon as possible.
  if (role) {
    const channels = await fetchGuildChannels(guild);
    for (const channel of channels) {
      if (
        !channel?.guild ||
        channel.isThread?.() ||
        typeof channel.permissionOverwrites?.delete !== 'function'
      ) {
        continue;
      }

      const overwrite = channel.permissionOverwrites.cache?.get?.(role.id);
      if (!overwrite) continue;

      try {
        await channel.permissionOverwrites.delete(role.id, reason);
        removedOverwrites++;
      } catch (err: any) {
        failedChannels.push(channel.name ? `#${channel.name}` : channel.id);
        console.error(`[jail] failed to remove overwrite from ${channel.id}: ${err?.message ?? err}`);
      }
    }

    const deleted = await role.delete(reason).catch((err: any): null => {
      console.error(`[jail] failed to delete role ${role.id}: ${err?.message ?? err}`);
      return null;
    });
    if (!deleted) {
      return { error: `I could not delete the ${jailRoleMention(role)} role. The jail setup is still active.` };
    }
  }

  await client.db.deleteJailConfig(guild.id);
  return { role, removedOverwrites, failedChannels };
}

export async function validateJailTarget(opts: {
  guild: any;
  targetUser: any;
  invokerMember: any;
  botMember: any;
  developers: [string, string][];
  action: 'jail' | 'unjail';
  ownerHierarchyOverride?: boolean;
}): Promise<{ member: any } | { error: string }> {
  const {
    guild,
    targetUser,
    invokerMember,
    botMember,
    developers,
    action,
    ownerHierarchyOverride = false,
  } = opts;
  const verb = action === 'jail' ? 'jail' : 'unjail';

  if (targetUser.id === invokerMember?.id) return { error: `You cannot ${verb} yourself.` };
  if (targetUser.id === guild.ownerId) return { error: `You cannot ${verb} the server owner.` };
  if (targetUser.id === botMember?.user?.id) return { error: `I cannot ${verb} myself.` };
  if (developers.some(([, id]) => id === targetUser.id)) {
    return { error: `You cannot ${verb} a bot developer.` };
  }

  const member = await guild.members.fetch(targetUser.id).catch((): null => null);
  if (!member) return { error: `**${targetUser.username}** is not in this server.` };

  const invokerIsOwner = invokerMember?.id === guild.ownerId || ownerHierarchyOverride;
  const invokerTop = invokerMember?.roles?.highest?.position ?? 0;
  const targetTop = member.roles?.highest?.position ?? 0;
  const botTop = botMember?.roles?.highest?.position ?? 0;

  if (!invokerIsOwner && targetTop >= invokerTop) {
    return { error: `You cannot ${verb} **${targetUser.username}** — they have an equal or higher role than you.` };
  }
  if (targetTop >= botTop) {
    return { error: `I cannot ${verb} **${targetUser.username}** — their role is equal to or higher than mine.` };
  }

  return { member };
}

export function jailRoleMention(role: any): string {
  return role?.id ? `<@&${role.id}>` : `**${JAIL_ROLE_NAME}**`;
}