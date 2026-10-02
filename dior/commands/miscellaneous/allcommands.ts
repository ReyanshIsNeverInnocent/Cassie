import { config } from '../../config.js';
import {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';

export const options = {
  name: 'allcommands',
  aliases: [] as string[],
  description: 'Show all commands available to the bot.',
  usage: 'allcommands',
  category: 'miscellaneous',
  owner: false,
  cooldown: 3,
};

export async function prefixExecute(
  message: any,
  _args: string[],
  client: CassieClient,
): Promise<any> {
  const names = new Set<string>();
  for (const command of [...client.commands.values(), ...client.slashCommands.values()]) {
    const name = command.options?.name;
    if (name) names.add(name.toLowerCase());
  }

  const commandList = [...names].sort((a, b) => a.localeCompare(b));
  const content = `## All Commands\n${commandList.map((name) => `\`${name}\``).join(', ')}`;
  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

  return message.channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}

