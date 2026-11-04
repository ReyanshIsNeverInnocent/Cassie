// xoxo/commands/settings/autonick.ts
//
// Configure nickname text applied automatically to new human members and bots.

import { PermissionFlagsBits } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';
import { buildAutonickStatusPayload } from '../../components/utility/autonickStatus.js';

export const options = {
  name: 'autonick',
  aliases: ['automaticnick'] as string[],
  description: 'Configure text prepended or appended to new members and bots.',
  usage: `autonick [member | bot] prepend <text>
autonick [member | bot] append <text>
autonick reset [member | bot | all] [prepend | append | all]
autonick status`,
  category: 'features',
  owner: false,
  cooldown: 5,
};

const MAX_NICK = 32;

type Mode = 'prepend' | 'append';
type Target = 'member' | 'bot';

async function run(
  ctx: { message?: any; interaction?: any },
  args: string[],
  client: CassieClient,
): Promise<any> {
  const guild = ctx.message?.guild ?? ctx.interaction?.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');
  const member = ctx.message?.member ?? ctx.interaction?.member;
  if (!member?.permissions?.has?.(PermissionFlagsBits.ManageNicknames)) {
    return sendError(ctx, 'You need the **Manage Nicknames** permission to configure autonick.');
  }
  if (!client.db) return sendError(ctx, 'Database is not connected. Please try again later.');

  const action = args[0]?.toLowerCase();
  const current = await client.db.getAutonickConfig(guild.id).catch((): null => null);

  if (action === 'status' || !action) {
    const payload = buildAutonickStatusPayload(current);
    if (ctx.interaction) return ctx.interaction.editReply(payload);
    return ctx.message.channel.send(payload);
  }

  if (action === 'reset' || action === 'disable' || action === 'remove') {
    const target = (args[1]?.toLowerCase() ?? 'all') as Target | 'all';
    const mode = (args[2]?.toLowerCase() ?? 'all') as Mode | 'all';
    if (!['member', 'bot', 'all'].includes(target) || !['prepend', 'append', 'all'].includes(mode)) {
      return sendError(ctx, 'Use `autonick reset [member | bot | all] [prepend | append | all]`.');
    }
    const data: Record<string, string | null> = {};
    const targets: Target[] = target === 'all' ? ['member', 'bot'] : [target];
    const modes: Mode[] = mode === 'all' ? ['prepend', 'append'] : [mode];
    for (const selectedTarget of targets) {
      for (const selectedMode of modes) data[`${selectedTarget}_${selectedMode}`] = null;
    }
    await client.db.setAutonickConfig(guild.id, data);
    return sendSuccess(ctx, `Autonick reset for **${target}** ${mode}.`);
  }

  const target: Target = action === 'member' || action === 'bot' ? action : 'member';
  const mode: Mode | undefined = (target === 'member' ? action : args[1]?.toLowerCase()) as Mode | undefined;
  const textStart = target === 'member' ? 1 : 2;
  if (mode !== 'prepend' && mode !== 'append') {
    return sendError(ctx, `Usage:\n\`\`\`\n${options.usage}\n\`\`\``);
  }

  const text = args.slice(textStart).join(' ').trim();
  if (!text) return sendError(ctx, `Provide text to ${mode} to new member nicknames.`);
  if (text.length >= MAX_NICK) {
    return sendError(ctx, `That text is too long. Leave room for the member name; maximum is **${MAX_NICK - 1}** characters.`);
  }

  await client.db.setAutonickConfig(guild.id, { [`${target}_${mode}`]: text });
  return sendSuccess(ctx, `Autonick ${mode} for **${target}s** set to **${text}**.`);
}

export async function prefixExecute(message: any, args: string[], client: CassieClient): Promise<any> {
  return run({ message }, args, client);
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  const action = interaction.options.getSubcommand();
  const text = interaction.options.getString('text');
  const target = interaction.options.getString('target');
  const args = action === 'reset'
    ? [action, target ?? 'all', interaction.options.getString('mode') ?? 'all']
    : action === 'status'
      ? [action]
      : [interaction.options.getString('type') ?? 'member', action, ...(text ? [text] : [])];
  await interaction.deferReply();
  return run({ interaction }, args, client);
}
