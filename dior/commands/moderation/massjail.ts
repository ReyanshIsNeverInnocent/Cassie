import { PermissionFlagsBits } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import { checkGuildCommandAccess } from '../../helpers/trustedAdministrators.js';
import { parseUserInputs, resolveMembers } from '../../helpers/massModeration.js';
import {
  buildActionConfirmPayload,
  buildActionTimedOutPayload,
  buildActionCancelledPayload,
} from '../../components/purgeConfirm.js';
import {
  getGuildBotMember,
  jailRoleMention,
  validateJailTarget,
} from '../../helpers/jail.js';

export const options = {
  name:        'massjail',
  aliases:     [] as string[],
  description: 'Jail multiple members at once (max 50). Server owner or trusted administrator only.',
  usage:       'massjail <user> <user> ...',
  category:    'moderation',
  owner:       false,
  trustedAdministrator: true,
  cooldown:    10,
};

const MAX_TARGETS = 50;
const CONFIRM_TITLE = 'Confirm Mass Jail';

async function getMassJailRole(
  guild: any,
  client: CassieClient,
): Promise<{ role: any } | { error: string }> {
  if (!client.db) return { error: 'The database is unavailable right now.' };

  let config: any;
  try {
    config = await client.db.getJailConfig(guild.id);
  } catch (err: any) {
    console.error(`[massjail] failed to load jail configuration in ${guild.id}: ${err?.message ?? err}`);
    return { error: 'I could not load the jail configuration because the database request failed.' };
  }
  if (!config) return { error: 'Jail is not configured. Use `jail setup` first.' };

  const role =
    guild.roles.cache.get(config.role_id) ??
    await guild.roles.fetch(config.role_id).catch((err: any): null => {
      console.error(`[massjail] failed to fetch jail role ${config.role_id}: ${err?.message ?? err}`);
      return null;
    });
  if (!role) return { error: 'The configured jail role no longer exists. Run `jail setup` again.' };
  return { role };
}

async function getEligibleMembers(
  guild: any,
  invokerMember: any,
  botMember: any,
  role: any,
  members: any[],
  client: CassieClient,
): Promise<{ eligible: any[]; skipped: number }> {
  const eligible: any[] = [];
  let skipped = 0;

  for (const member of members) {
    if (member.roles.cache.has(role.id)) {
      skipped++;
      continue;
    }

    const result = await validateJailTarget({
      guild,
      targetUser: member.user,
      invokerMember,
      botMember,
      developers: client.config.developers,
      action: 'jail',
      ownerHierarchyOverride: true,
    });
    if ('error' in result) {
      skipped++;
      continue;
    }
    eligible.push(result.member);
  }
  return { eligible, skipped };
}

async function runMassJail(
  ctx: { message?: any; interaction?: any; channel?: any },
  guild: any,
  members: any[],
  invokerMember: any,
  invoker: string,
  client: CassieClient,
  confirmedRoleId: string,
): Promise<void> {
  const jailRole = await getMassJailRole(guild, client);
  if ('error' in jailRole) {
    await sendError(ctx, jailRole.error);
    return;
  }
  if (jailRole.role.id !== confirmedRoleId) {
    await sendError(ctx, 'The jail role changed while confirmation was pending. Run the command again to review the current targets.');
    return;
  }

  const botMember = getGuildBotMember(guild) ??
    await guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
    await sendError(ctx, 'I need the **Manage Roles** permission to jail members.');
    return;
  }

  if (jailRole.role.position >= (botMember.roles?.highest?.position ?? 0)) {
    await sendError(ctx, `I cannot manage the ${jailRoleMention(jailRole.role)} role because it is at or above my highest role.`);
    return;
  }

  let jailed = 0;
  let skipped = 0;
  let failed = 0;

  for (const selectedMember of members) {
    const targetUser = selectedMember.user;
    const result = await validateJailTarget({
      guild,
      targetUser,
      invokerMember,
      botMember,
      developers: client.config.developers,
      action: 'jail',
      ownerHierarchyOverride: true,
    });
    if ('error' in result || result.member.roles.cache.has(jailRole.role.id)) {
      skipped++;
      continue;
    }

    const added = await result.member.roles
      .add(jailRole.role, `Massjail by ${invoker}`)
      .then(() => true)
      .catch((err: any) => {
        console.error(`[massjail] failed to jail ${targetUser.id}: ${err?.message ?? err}`);
        return false;
      });
    if (added) jailed++;
    else failed++;
  }

  let summary = `Jailed **${jailed}** member${jailed !== 1 ? 's' : ''} with ${jailRoleMention(jailRole.role)}.`;
  if (skipped > 0) summary += ` Skipped **${skipped}** (already jailed, not found, or ineligible).`;
  if (failed > 0) summary += ` Failed to jail **${failed}** member${failed !== 1 ? 's' : ''}.`;
  await sendSuccess(ctx, summary);
}

function buildDescription(members: any[], notFound: string[], skipped: number, role: any): string {
  const list = members
    .map((member) => `• **${member.user.username}** (\`${member.id}\`)`)
    .join('\n');
  const preview = list.length > 800 ? `${list.slice(0, 800)}\n…` : list;
  let description =
    `**Warning:** Adding ${jailRoleMention(role)} may restrict these members' access to server channels. ` +
    `You can reverse this with \`unjail\`.\n\n` +
    `Are you sure you want to jail these **${members.length}** members?\n${preview}`;
  if (skipped > 0) description += `\n\n-# **${skipped}** member(s) already jailed or ineligible will be skipped.`;
  if (notFound.length > 0) {
    description += `\n-# **${notFound.length}** user(s) not found or not in this server will be ignored.`;
  }
  return description;
}

async function confirmPrefix(
  message: any,
  description: string,
  onConfirm: () => Promise<void>,
): Promise<void> {
  const confirmId = `mj:confirm:${message.id}`;
  const cancelId = `mj:cancel:${message.id}`;
  const confirmMessage = await message.channel
    .send(buildActionConfirmPayload(confirmId, cancelId, CONFIRM_TITLE, description))
    .catch((): null => null);
  if (!confirmMessage) return;

  const collector = confirmMessage.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
      i, message.author.id, (id) => id === confirmId || id === cancelId,
    ),
    max: 1,
    time: 30_000,
  });
  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    if (i.customId === confirmId) {
      await confirmMessage.delete().catch((): null => null);
      await onConfirm();
      return;
    }
    await confirmMessage
      .edit(buildActionCancelledPayload(confirmId, cancelId, CONFIRM_TITLE, description))
      .catch((): null => null);
  });
  collector.on('end', (_: any, reason: string) => {
    if (reason !== 'time') return;
    confirmMessage
      .edit(buildActionTimedOutPayload(confirmId, cancelId, CONFIRM_TITLE, description))
      .catch((): null => null);
  });
}

async function confirmSlash(
  interaction: any,
  description: string,
  onConfirm: () => Promise<void>,
): Promise<void> {
  const confirmId = `mj:confirm:${interaction.id}`;
  const cancelId = `mj:cancel:${interaction.id}`;
  await interaction.editReply(buildActionConfirmPayload(confirmId, cancelId, CONFIRM_TITLE, description));
  const confirmMessage = await interaction.fetchReply().catch((): null => null);
  if (!confirmMessage) return;

  const collector = confirmMessage.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
      i, interaction.user.id, (id) => id === confirmId || id === cancelId,
    ),
    max: 1,
    time: 30_000,
  });
  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    if (i.customId === confirmId) {
      await interaction.deleteReply().catch((): null => null);
      await onConfirm();
      return;
    }
    await i
      .editReply(buildActionCancelledPayload(confirmId, cancelId, CONFIRM_TITLE, description))
      .catch((): null => null);
  });
  collector.on('end', (_: any, reason: string) => {
    if (reason !== 'time') return;
    confirmMessage
      .edit(buildActionTimedOutPayload(confirmId, cancelId, CONFIRM_TITLE, description))
      .catch((): null => null);
  });
}

async function executeMassJail(
  context: { message?: any; interaction?: any },
  client: CassieClient,
  rawInput: string,
): Promise<any> {
  const message = context.message;
  const interaction = context.interaction;
  const guild = message?.guild ?? interaction?.guild;
  const actor = message?.author ?? interaction?.user;
  const invokerMember = message?.member ?? interaction?.member;
  const ctx = message ? { message } : { interaction };

  if (!guild) return sendError(ctx, 'This command can only be used in a server.');
  const access = await checkGuildCommandAccess(options, guild, actor.id, client);
  if ('error' in access) return sendError(ctx, access.error);

  const botMember = getGuildBotMember(guild) ??
    await guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
    return sendError(ctx, 'I need the **Manage Roles** permission to jail members.');
  }

  const jailRole = await getMassJailRole(guild, client);
  if ('error' in jailRole) return sendError(ctx, jailRole.error);
  if (jailRole.role.position >= (botMember.roles?.highest?.position ?? 0)) {
    return sendError(ctx, `I cannot manage the ${jailRoleMention(jailRole.role)} role because it is at or above my highest role.`);
  }

  const userInputs = parseUserInputs(rawInput);
  if (!userInputs.length) return sendError(ctx, `Provide at least one user. Usage: \`${options.usage}\``);
  if (userInputs.length > MAX_TARGETS) {
    return sendError(ctx, `You can jail at most **${MAX_TARGETS}** users at once.`);
  }

  const { members, notFound } = await resolveMembers(
    userInputs, guild, client, [actor.id, guild.ownerId],
  );
  if (!members.length) return sendError(ctx, 'None of the provided users are eligible members of this server.');

  const { eligible, skipped } = await getEligibleMembers(
    guild, invokerMember, botMember, jailRole.role, members, client,
  );
  if (!eligible.length) {
    return sendError(ctx, 'None of the provided users can be jailed; they may already be jailed or ineligible.');
  }

  const description = buildDescription(eligible, notFound, skipped, jailRole.role);
  const onConfirm = async (): Promise<void> => {
    const confirmedAccess = await checkGuildCommandAccess(options, guild, actor.id, client);
    if ('error' in confirmedAccess) {
      await sendError(message ? { message } : { channel: interaction.channel }, confirmedAccess.error);
      return;
    }
    await runMassJail(
      message ? { message } : { channel: interaction.channel },
      guild,
      eligible,
      invokerMember,
      actor.username,
      client,
      jailRole.role.id,
    );
  };

  if (message) return confirmPrefix(message, description, onConfirm);
  return confirmSlash(interaction, description, onConfirm);
}

export async function prefixExecute(
  message: any,
  args: string[],
  client: CassieClient,
): Promise<any> {
  return executeMassJail({ message }, client, message.commandRawArgs ?? args.join(' '));
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  await interaction.deferReply();
  return executeMassJail(
    { interaction },
    client,
    interaction.options.getString('users', true),
  );
}
