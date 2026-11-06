import { PermissionFlagsBits } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import {
  buildActionConfirmPayload,
  buildActionTimedOutPayload,
  buildActionCancelledPayload,
} from '../../components/purgeConfirm.js';
import { parseUserInputs, resolveMembers } from '../../helpers/massModeration.js';

export const options = {
  name: 'massban',
  aliases: [] as string[],
  description: 'Ban multiple members at once (max 50). Server owner only.',
  usage: 'massban <user> <user> ...',
  category: 'moderation',
  owner: false,
  cooldown: 10,
};

const MAX_TARGETS = 50;
const CONFIRM_TITLE = 'Confirm Mass Ban';

async function runMassBan(
  ctx: { message?: any; interaction?: any; channel?: any },
  guild: any,
  members: any[],
  invoker: string,
): Promise<void> {
  let banned = 0;
  let failed = 0;

  for (const member of members) {
    if (!member.bannable) {
      failed++;
      continue;
    }

    const success = await guild.members
      .ban(member.id, { reason: `Massban by ${invoker}`, deleteMessageSeconds: 0 })
      .then(() => true)
      .catch((err: any) => {
        console.error(`[massban] failed to ban ${member.id}: ${err?.message ?? err}`);
        return false;
      });

    if (success) banned++;
    else failed++;
  }

  let result = `Banned **${banned}** member${banned !== 1 ? 's' : ''}.`;
  if (failed > 0) {
    result += ` Failed to ban **${failed}** member${failed !== 1 ? 's' : ''} (role too high or already left).`;
  }
  await sendSuccess(ctx, result);
}

async function confirmPrefix(
  message: any,
  description: string,
  onConfirm: () => Promise<void>,
): Promise<void> {
  const confirmId = `mb:confirm:${message.id}`;
  const cancelId = `mb:cancel:${message.id}`;
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
    setTimeout(async () => {
      await confirmMessage.delete().catch((): null => null);
      await message.delete().catch((): null => null);
    }, 3_000);
  });

  collector.on('end', (_: any, reason: string) => {
    if (reason === 'time') {
      confirmMessage
        .edit(buildActionTimedOutPayload(confirmId, cancelId, CONFIRM_TITLE, description))
        .catch((): null => null);
    }
  });
}

async function confirmSlash(
  interaction: any,
  description: string,
  onConfirm: () => Promise<void>,
): Promise<void> {
  const confirmId = `mb:confirm:${interaction.id}`;
  const cancelId = `mb:cancel:${interaction.id}`;
  await interaction.editReply(
    buildActionConfirmPayload(confirmId, cancelId, CONFIRM_TITLE, description),
  );
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
    setTimeout(() => interaction.deleteReply().catch((): null => null), 3_000);
  });

  collector.on('end', (_: any, reason: string) => {
    if (reason === 'time') {
      confirmMessage
        .edit(buildActionTimedOutPayload(confirmId, cancelId, CONFIRM_TITLE, description))
        .catch((): null => null);
    }
  });
}

function buildDescription(members: any[], notFound: string[]): string {
  const lines = members
    .map((member) => `• **${member.user.username}** (\`${member.id}\`)`)
    .join('\n');
  const preview = lines.length > 800 ? `${lines.slice(0, 800)}\n…` : lines;
  let description = `Are you sure you want to ban these **${members.length}** member${members.length !== 1 ? 's' : ''}?\n${preview}`;
  if (notFound.length > 0) {
    description += `\n\n-# **${notFound.length}** user${notFound.length !== 1 ? 's' : ''} not found, not in server, or skipped (will be ignored).`;
  }
  return description;
}

export async function prefixExecute(
  message: any,
  args: string[],
  client: CassieClient,
): Promise<any> {
  const ctx = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');
  if (message.author.id !== guild.ownerId) {
    return sendError(ctx, 'Only the server owner can use this command.');
  }
  if (!message.channel.permissionsFor?.(message.member)?.has?.(PermissionFlagsBits.BanMembers)) {
    return sendError(ctx, 'You need the **Ban Members** permission to use this command.');
  }
  const botMember = await guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.BanMembers)) {
    return sendError(ctx, 'I need the **Ban Members** permission to ban members.');
  }

  const userInputs = parseUserInputs(message.commandRawArgs ?? args.join(' '));
  if (userInputs.length === 0) return sendError(ctx, `Provide at least one user. Usage: \`${options.usage}\``);
  if (userInputs.length > MAX_TARGETS) {
    return sendError(ctx, `You can ban at most **${MAX_TARGETS}** users at once. You provided **${userInputs.length}**.`);
  }

  const { members, notFound } = await resolveMembers(
    userInputs, guild, client, [message.author.id, guild.ownerId],
  );
  if (members.length === 0) {
    return sendError(ctx, 'None of the provided users are eligible members of this server.');
  }

  return confirmPrefix(message, buildDescription(members, notFound), () =>
    runMassBan(ctx, guild, members, message.author.username),
  );
}

export async function slashExecute(
  interaction: any,
  client: CassieClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx = { interaction };
  const guild = interaction.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');
  if (interaction.user.id !== guild.ownerId) {
    return sendError(ctx, 'Only the server owner can use this command.');
  }
  if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.BanMembers)) {
    return sendError(ctx, 'You need the **Ban Members** permission to use this command.');
  }
  const botMember = await guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.BanMembers)) {
    return sendError(ctx, 'I need the **Ban Members** permission to ban members.');
  }

  const userInputs = parseUserInputs(interaction.options.getString('users', true));
  if (userInputs.length === 0) return sendError(ctx, 'Provide at least one user.');
  if (userInputs.length > MAX_TARGETS) {
    return sendError(ctx, `You can ban at most **${MAX_TARGETS}** users at once.`);
  }
  const { members, notFound } = await resolveMembers(
    userInputs, guild, client, [interaction.user.id, guild.ownerId],
  );
  if (members.length === 0) {
    return sendError(ctx, 'None of the provided users are eligible members of this server.');
  }

  return confirmSlash(interaction, buildDescription(members, notFound), () =>
    runMassBan({ channel: interaction.channel }, guild, members, interaction.user.username),
  );
}
