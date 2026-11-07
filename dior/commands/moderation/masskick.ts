// xoxo/commands/moderation/masskick.ts
//
// Kick multiple members at once by providing IDs, mentions, or usernames.
//
// Prefix:  $masskick <user> <user> ...
// Slash:   /masskick users:<space-separated users>
//
// Maximum 50 users per invocation.
// Always asks for confirmation before kicking.
// Requires KickMembers for the bot. Only the server owner or a trusted administrator
// may start the operation.

import { PermissionFlagsBits } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import { checkGuildCommandAccess } from '../../helpers/trustedAdministrators.js';
import {
  buildActionConfirmPayload,
  buildActionTimedOutPayload,
  buildActionCancelledPayload,
} from '../../components/purgeConfirm.js';
import { parseUserInputs, resolveMembers } from '../../helpers/massModeration.js';

export const options = {
  name:        'masskick',
  aliases:     [] as string[],
  description: 'Kick multiple members at once (max 50). Server owner or trusted administrator only.',
  usage:       'masskick <user> <user> ...',
  category:    'moderation',
  owner:       false,
  trustedAdministrator: true,
  cooldown:    10,
};

const MAX_TARGETS  = 50;
const CONFIRM_TITLE = 'Confirm Mass Kick';

// ─────────────────────────────────────────────────────────────────────────────
// Confirmation helper
// ─────────────────────────────────────────────────────────────────────────────

async function askConfirm(
  message:   any,
  desc:      string,
  onConfirm: () => Promise<void>,
): Promise<void> {
  const confirmId = `mk:confirm:${message.id}`;
  const cancelId  = `mk:cancel:${message.id}`;

  const confirmMsg = await message.channel
    .send(buildActionConfirmPayload(confirmId, cancelId, CONFIRM_TITLE, desc))
    .catch((): null => null);
  if (!confirmMsg) return;

  const collector = confirmMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
        i, message.author.id,
        (cid) => cid === confirmId || cid === cancelId,
      ),
    max:  1,
    time: 30_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    if (i.customId === confirmId) {
      await confirmMsg.delete().catch((): null => null);
      await onConfirm();
    } else {
      await confirmMsg
        .edit(buildActionCancelledPayload(confirmId, cancelId, CONFIRM_TITLE, desc))
        .catch((): null => null);
      setTimeout(async () => {
        await confirmMsg.delete().catch((): null => null);
        await message.delete().catch((): null => null);
      }, 3_000);
    }
  });

  collector.on('end', (_: any, reason: string) => {
    if (reason !== 'time') return;
    confirmMsg
      .edit(buildActionTimedOutPayload(confirmId, cancelId, CONFIRM_TITLE, desc))
      .catch((): null => null);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Core kick logic
// ─────────────────────────────────────────────────────────────────────────────

async function runMassKick(
  ctx:      { message?: any; interaction?: any; channel?: any },
  guild:    any,
  members:  any[],
  invoker:  string,
): Promise<void> {
  let kicked   = 0;
  let failed   = 0;

  for (const member of members) {
    if (!member.kickable) { failed++; continue; }
    const ok = await member
      .kick(`Masskick by ${invoker}`)
      .then(() => true)
      .catch((err: any) => {
        console.error(`[masskick] failed to kick ${member.id}: ${err?.message ?? err}`);
        return false;
      });
    if (ok) kicked++;
    else    failed++;
  }

  let result = `Kicked **${kicked}** member${kicked !== 1 ? 's' : ''}.`;
  if (failed > 0) result += ` Failed to kick **${failed}** member${failed !== 1 ? 's' : ''} (role too high or already left).`;
  await sendSuccess(ctx, result);
}

// ─────────────────────────────────────────────────────────────────────────────
// Prefix execute
// ─────────────────────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  _client: CassieClient,
): Promise<any> {
  const ctx   = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');
  const access = await checkGuildCommandAccess(options, guild, message.author.id, _client);
  if ('error' in access) return sendError(ctx, access.error);

  const botMember = guild.members.me;
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.KickMembers)) {
    return sendError(ctx, 'I need the **Kick Members** permission to kick members.');
  }

  const userInputs = parseUserInputs(message.commandRawArgs ?? args.join(' '));
  if (userInputs.length === 0) {
    return sendError(ctx, `Provide at least one user. Usage: \`${options.usage}\``);
  }
  if (userInputs.length > MAX_TARGETS) {
    return sendError(ctx, `You can kick at most **${MAX_TARGETS}** users at once. You provided **${userInputs.length}**.`);
  }

  const { members, notFound } = await resolveMembers(
    userInputs, guild, _client, [message.author.id, guild.ownerId],
  );

  if (members.length === 0) {
    return sendError(ctx, 'None of the provided users are eligible members of this server.');
  }

  const listLines = members
    .map((m) => `• **${m.user.username}** (\`${m.id}\`)`)
    .join('\n');
  const listPreview = listLines.length > 800
    ? listLines.slice(0, 800) + '\n…'
    : listLines;

  let desc = `**Warning:** This will remove these members from the server and cannot be undone automatically.\n\n` +
    `Are you sure you want to kick these **${members.length}** member${members.length !== 1 ? 's' : ''}?\n${listPreview}`;
  if (notFound.length > 0) {
    desc += `\n\n-# **${notFound.length}** user${notFound.length !== 1 ? 's' : ''} not found, not in server, or skipped (will be ignored).`;
  }

  return askConfirm(message, desc, async () => {
    const confirmedAccess = await checkGuildCommandAccess(options, guild, message.author.id, _client);
    if ('error' in confirmedAccess) {
      await sendError(ctx, confirmedAccess.error);
      return;
    }
    await runMassKick(ctx, guild, members, message.author.username);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Slash execute
// ─────────────────────────────────────────────────────────────────────────────

export async function slashExecute(
  interaction: any,
  _client:     CassieClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx   = { interaction };
  const guild = interaction.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');
  const access = await checkGuildCommandAccess(options, guild, interaction.user.id, _client);
  if ('error' in access) return sendError(ctx, access.error);

  const botMember = guild.members.me;
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.KickMembers)) {
    return sendError(ctx, 'I need the **Kick Members** permission to kick members.');
  }

  const rawInput: string = interaction.options.getString('users', true);
  const userInputs = parseUserInputs(rawInput);

  if (userInputs.length === 0) {
    return sendError(ctx, 'Provide at least one user.');
  }
  if (userInputs.length > MAX_TARGETS) {
    return sendError(ctx, `You can kick at most **${MAX_TARGETS}** users at once.`);
  }

  const { members, notFound } = await resolveMembers(
    userInputs, guild, _client, [interaction.user.id, guild.ownerId],
  );

  if (members.length === 0) {
    return sendError(ctx, 'None of the provided users are eligible members of this server.');
  }

  // ── Confirmation ──────────────────────────────────────────────────────────
  const listLines = members
    .map((m) => `• **${m.user.username}** (\`${m.id}\`)`)
    .join('\n');
  const listPreview = listLines.length > 800
    ? listLines.slice(0, 800) + '\n…'
    : listLines;

  let desc = `**Warning:** This will remove these members from the server and cannot be undone automatically.\n\n` +
    `Are you sure you want to kick these **${members.length}** member${members.length !== 1 ? 's' : ''}?\n${listPreview}`;
  if (notFound.length > 0) {
    desc += `\n\n-# **${notFound.length}** user${notFound.length !== 1 ? 's' : ''} not found, not in server, or skipped (will be ignored).`;
  }

  const confirmId = `mk:confirm:${interaction.id}`;
  const cancelId  = `mk:cancel:${interaction.id}`;

  await interaction.editReply(
    buildActionConfirmPayload(confirmId, cancelId, CONFIRM_TITLE, desc),
  );
  const confirmMsg = await interaction.fetchReply().catch((): null => null);
  if (!confirmMsg) return;

  // After confirmation the result is sent to the channel directly —
  // the interaction reply is deleted on confirm / after 3 s on cancel.
  const channelCtx = { channel: interaction.channel };

  const collector = confirmMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
        i, interaction.user.id,
        (cid) => cid === confirmId || cid === cancelId,
      ),
    max:  1,
    time: 30_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    if (i.customId === confirmId) {
      await interaction.deleteReply().catch((): null => null);
      const confirmedAccess = await checkGuildCommandAccess(options, guild, interaction.user.id, _client);
      if ('error' in confirmedAccess) {
        await sendError(channelCtx, confirmedAccess.error);
        return;
      }
      await runMassKick(channelCtx, guild, members, interaction.user.username);
    } else {
      await i
        .editReply(buildActionCancelledPayload(confirmId, cancelId, CONFIRM_TITLE, desc))
        .catch((): null => null);
      setTimeout(() => interaction.deleteReply().catch((): null => null), 3_000);
    }
  });

  collector.on('end', (_: any, reason: string) => {
    if (reason !== 'time') return;
    confirmMsg
      .edit(buildActionTimedOutPayload(confirmId, cancelId, CONFIRM_TITLE, desc))
      .catch((): null => null);
  });
}
