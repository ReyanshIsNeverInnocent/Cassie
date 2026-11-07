import { config } from '../config.js';
// xoxo/components/wrongUsage.ts
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
  type Message,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { CassieClient } from '../structures/CassieClient.js';
import { emojis } from '../emojis.js';

interface WrongUsageContext {
  interaction?: ChatInputCommandInteraction;
  message?: Message;
  existingMessage?: Message;
  client?: CassieClient;
}

export async function sendWrongUsage(
  context: WrongUsageContext,
  commandName: string,
  usage: string,
): Promise<Message | void> {
  const commandPrefix = context.client?.config.prefix
    ?? (context.message as (Message & { commandPrefix?: string }) | undefined)?.commandPrefix
    ?? config.prefix;
  const footer = `-# Use "${commandPrefix}help ${commandName}" to view more info.`;

  const usageLines = usage.split('\n').map(l => l.trim()).filter(l => l);
  const bulletLines = usageLines.map(l => `- ${l}`).join('\n');

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Wrong usage ${emojis.pixelatedWrong}`))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### Correct usage of \`${commandName}\` is:`),
      new TextDisplayBuilder().setContent(bulletLines),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer));

  const payload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  } as any;

  if (context.interaction) {
    const interaction = context.interaction;
    if (interaction.deferred || interaction.replied) {
      return (await interaction.editReply(payload)) as Message;
    } else {
      return (await interaction.reply({ ...payload, fetchReply: true })) as unknown as Message;
    }
  }

  if (context.message) {
    const target = context.existingMessage || context.message;
    if (target.editable) {
      return await target.edit(payload);
    } else {
      return await (context.message.channel as any).send(payload);
    }
  }

  throw new Error('Invalid context');
}
