import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import {
  buildGiveawayEditPrompt,
  buildGiveawayListPayload,
  buildGiveawayParticipantsPayload,
  scheduleGiveawayEditPromptExpiry,
} from '../../components/features/giveaway.js';
import {
  endGiveaway,
  MAX_GIVEAWAY_WINNERS,
  parseGiveawayDuration,
  rerollGiveaway,
  startGiveaway,
} from '../../helpers/giveawayManager.js';

export const options = {
  name: 'giveaway',
  aliases: ['gstart', 'gedit', 'gend', 'greroll', 'gcancel', 'glist', 'gparticipants', 'gentries'] as string[],
  description: 'Start, edit, end, cancel, reroll, list, or inspect giveaway entries.',
  usage: 'giveaway start <duration> <winners> <prize>\ngiveaway list\ngiveaway participants <message ID> (or reply to the giveaway)\ngiveaway entries <message ID> (or reply to the giveaway)\ngiveaway edit <message ID> (or reply to the giveaway)\ngiveaway end <message ID> (or reply to the giveaway)\ngiveaway cancel <message ID> (or reply to the giveaway)\ngiveaway reroll <message ID> (or reply to the giveaway)',
  category: 'features',
  owner: false,
  cooldown: { default: 3, subcommands: { start: 3, edit: 3, end: 3, cancel: 3, reroll: 3, list: 3, participants: 3, entries: 3 } },
};

function hasGiveawayPermission(member: any): boolean {
  return !!member?.permissions?.has?.(PermissionFlagsBits.Administrator)
    || !!member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);
}

function parseTargetMessageId(raw: string | undefined, message?: any): string | null {
  if (message?.reference?.messageId) return message.reference.messageId;
  const value = raw?.trim();
  if (!value) return null;
  return value.match(/(?:\/channels\/\d+\/\d+\/)(\d{17,20})/)?.[1]
    ?? value.match(/^<?(\d{17,20})>?$/)?.[1]
    ?? null;
}

async function resolveGiveaway(client: CassieClient, guildId: string, raw: string | undefined, message?: any) {
  if (!client.db) return null;
  const messageId = parseTargetMessageId(raw, message);
  return messageId ? client.db.getGiveawayByMessage(messageId, guildId) : null;
}

function usage(action: string, client: CassieClient): string {
  return `Usage: \`${client.config.prefix}giveaway ${action} …\`\n${options.usage}`;
}

export async function runGiveawayPrefixAction(
  action: 'start' | 'edit' | 'end' | 'cancel' | 'reroll' | 'list' | 'participants' | 'entries',
  message: any,
  args: string[],
  client: CassieClient,
): Promise<any> {
  const ctx = { message, reply: false };
  if (!message.guild) return sendError(ctx, 'Giveaways can only be managed in a server.');
  if (!hasGiveawayPermission(message.member)) return sendError(ctx, 'You need **Administrator** or **Manage Server** permission to manage giveaways.');
  if (!client.db) return sendError(ctx, 'Database is unavailable right now.');

  if (action === 'list') {
    const giveaways = await client.db.listActiveGiveawaysByGuild(message.guild.id, 10);
    return message.channel.send(buildGiveawayListPayload(giveaways, 10));
  }

  if (action === 'participants' || action === 'entries') {
    const giveaway = await resolveGiveaway(client, message.guild.id, args[0], message);
    if (!giveaway) return sendError(ctx, `No giveaway found. Reply to a giveaway message or provide its message ID.\n${usage(action, client)}`);
    const entries = await client.db.listGiveawayEntries(giveaway.id).catch((): any[] => []);
    return message.channel.send(buildGiveawayParticipantsPayload(giveaway, entries.map((entry) => entry.user_id), 0, 15));
  }

  if (action === 'start') {
    const duration = parseGiveawayDuration(args[0]);
    const winnerCount = Number(args[1]);
    const prize = args.slice(2).join(' ').trim();
    if (!duration) return sendError(ctx, `Invalid duration. Use \`30s\`, \`10m\`, \`1h\`, or \`2d\` (maximum 365 days).\n${usage(action, client)}`);
    if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > MAX_GIVEAWAY_WINNERS) {
      return sendError(ctx, `Winner count must be a whole number from 1 to ${MAX_GIVEAWAY_WINNERS}.`);
    }
    if (!prize || prize.length > 256) return sendError(ctx, 'Provide a prize of 1–256 characters.');
    try {
      const giveaway = await startGiveaway(client, message.channel, message.guild.id, message.author.id, duration, winnerCount, prize);
      return giveaway;
    } catch (error: any) {
      return sendError(ctx, `Could not start the giveaway: ${error?.message ?? 'unknown error'}`);
    }
  }

  const giveaway = await resolveGiveaway(client, message.guild.id, args[0], message);
  if (!giveaway) return sendError(ctx, `No giveaway found. Reply to a giveaway message or provide its message ID.\n${usage(action, client)}`);

  if (action === 'edit') {
    if (giveaway.status !== 'active' || giveaway.end_at <= Date.now()) return sendError(ctx, 'Only an ongoing giveaway can be edited.');
    const expiresAt = Date.now() + 5 * 60_000;
    const prompt = await message.channel.send(buildGiveawayEditPrompt(giveaway, expiresAt));
    scheduleGiveawayEditPromptExpiry(prompt, giveaway, expiresAt);
    return prompt;
  }

  if (action === 'end' || action === 'cancel') {
    try {
      const result = await endGiveaway(client, giveaway.id, { force: true, cancel: action === 'cancel' });
      if (result === 'already-ended') return sendError(ctx, 'That giveaway has already ended.');
      if (result === 'busy') return sendError(ctx, 'That giveaway is already being ended. Try again shortly.');
      if (result !== 'ended') return sendError(ctx, 'Could not end that giveaway.');
      return;
    } catch (error: any) {
      return sendError(ctx, `Could not end the giveaway: ${error?.message ?? 'unknown error'}`);
    }
  }

  if (giveaway.status !== 'ended') return sendError(ctx, 'That giveaway has not ended yet.');
  try {
    const winnerIds = await rerollGiveaway(client, giveaway);
    return winnerIds;
  } catch (error: any) {
    return sendError(ctx, error?.message ?? 'Could not reroll the giveaway.');
  }
}

export async function prefixExecute(message: any, args: string[], client: CassieClient): Promise<any> {
  const aliasActions: Record<string, 'start' | 'edit' | 'end' | 'reroll' | 'cancel' | 'list' | 'participants' | 'entries'> = {
    gstart: 'start',
    gedit: 'edit',
    gend: 'end',
    greroll: 'reroll',
    gcancel: 'cancel',
    glist: 'list',
    gparticipants: 'participants',
    gentries: 'entries',
  };
  const invokedName = String(message.commandName ?? '').toLowerCase();
  const aliasAction = aliasActions[invokedName];
  const action = aliasAction ?? args[0]?.toLowerCase();
  if (action !== 'start' && action !== 'edit' && action !== 'end' && action !== 'cancel' && action !== 'reroll' && action !== 'list' && action !== 'participants' && action !== 'entries') {
    return sendError({ message, reply: false }, `Choose \`start\`, \`list\`, \`participants\`, \`entries\`, \`edit\`, \`end\`, \`cancel\`, or \`reroll\`.\n${options.usage}`);
  }
  return runGiveawayPrefixAction(action, message, aliasAction ? args : args.slice(1), client);
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  const ctx = { interaction };
  if (!interaction.guild) return sendError(ctx, 'Giveaways can only be managed in a server.');
  if (!hasGiveawayPermission(interaction.member)) return sendError(ctx, 'You need **Administrator** or **Manage Server** permission to manage giveaways.');
  if (!client.db) return sendError(ctx, 'Database is unavailable right now.');

  const action = interaction.options.getSubcommand() as 'start' | 'edit' | 'end' | 'cancel' | 'reroll' | 'list' | 'participants' | 'entries';
  if (action === 'list') {
    const giveaways = await client.db.listActiveGiveawaysByGuild(interaction.guildId, 10);
    await interaction.reply(buildGiveawayListPayload(giveaways, 10));
    return;
  }

  if (action === 'participants' || action === 'entries') {
    const rawMessageId = interaction.options.getString('message_id', true);
    const messageId = rawMessageId.match(/(?:\/channels\/\d+\/\d+\/)(\d{17,20})/)?.[1]
      ?? rawMessageId.match(/^<?(\d{17,20})>?$/)?.[1];
    const giveaway = messageId ? await client.db.getGiveawayByMessage(messageId, interaction.guildId) : null;
    if (!giveaway) return sendError(ctx, 'No giveaway found for that message ID in this server.');
    const entries = await client.db.listGiveawayEntries(giveaway.id).catch((): any[] => []);
    await interaction.reply(buildGiveawayParticipantsPayload(giveaway, entries.map((entry) => entry.user_id), 0, 15));
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (action === 'start') {
    const duration = parseGiveawayDuration(interaction.options.getString('duration', true));
    const winnerCount = interaction.options.getInteger('winners', true);
    const prize = interaction.options.getString('prize', true).trim();
    if (!duration) return sendError(ctx, 'Invalid duration. Use `30s`, `10m`, `1h`, or `2d` (maximum 365 days).');
    if (winnerCount < 1 || winnerCount > MAX_GIVEAWAY_WINNERS) return sendError(ctx, `Winner count must be from 1 to ${MAX_GIVEAWAY_WINNERS}.`);
    if (!prize || prize.length > 256) return sendError(ctx, 'Provide a prize of 1–256 characters.');
    try {
      const giveaway = await startGiveaway(client, interaction.channel, interaction.guildId, interaction.user.id, duration, winnerCount, prize);
      await interaction.deleteReply().catch((): null => null);
      return giveaway;
    } catch (error: any) {
      return sendError(ctx, `Could not start the giveaway: ${error?.message ?? 'unknown error'}`);
    }
  }

  const rawMessageId = interaction.options.getString('message_id', true);
  const messageId = rawMessageId.match(/(?:\/channels\/\d+\/\d+\/)(\d{17,20})/)?.[1]
    ?? rawMessageId.match(/^<?(\d{17,20})>?$/)?.[1];
  const giveaway = messageId ? await client.db.getGiveawayByMessage(messageId, interaction.guildId) : null;
  if (!giveaway) return sendError(ctx, 'No giveaway found for that message ID in this server.');

  if (action === 'edit') {
    if (giveaway.status !== 'active' || giveaway.end_at <= Date.now()) return sendError(ctx, 'Only an ongoing giveaway can be edited.');
    const expiresAt = Date.now() + 5 * 60_000;
    const prompt = await interaction.editReply(buildGiveawayEditPrompt(giveaway, expiresAt));
    scheduleGiveawayEditPromptExpiry(prompt, giveaway, expiresAt);
    return prompt;
  }

  if (action === 'end' || action === 'cancel') {
    try {
      const result = await endGiveaway(client, giveaway.id, { force: true, cancel: action === 'cancel' });
      if (result === 'already-ended') return sendError(ctx, 'That giveaway has already ended.');
      if (result === 'busy') return sendError(ctx, 'That giveaway is already being ended. Try again shortly.');
      if (result !== 'ended') return sendError(ctx, 'Could not end that giveaway.');
      await interaction.deleteReply().catch((): null => null);
      return;
    } catch (error: any) {
      return sendError(ctx, `Could not end the giveaway: ${error?.message ?? 'unknown error'}`);
    }
  }

  if (giveaway.status !== 'ended') return sendError(ctx, 'That giveaway has not ended yet.');
  try {
    const winnerIds = await rerollGiveaway(client, giveaway);
    await interaction.deleteReply().catch((): null => null);
    return winnerIds;
  } catch (error: any) {
    return sendError(ctx, error?.message ?? 'Could not reroll the giveaway.');
  }
}