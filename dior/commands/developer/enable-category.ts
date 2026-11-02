import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';
import { sendWrongUsage } from '../../components/wrongUsage.js';

export const options = {
  name: 'enable-category',
  aliases: [] as string[],
  description: 'Enable a previously disabled command category.',
  usage: 'enable-category <category>',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  if (!client.db) return sendError({ message }, 'Database is unavailable.');

  const input = args[0]?.trim();
  if (!input) return sendWrongUsage({ message, client }, options.name, options.usage);

  const category = [...client.commands.values(), ...client.slashCommands.values()]
    .map((command: any) => command.options?.category)
    .find((name: unknown): name is string =>
      typeof name === 'string' && name.toLowerCase() === input.toLowerCase(),
    );
  if (!category) return sendError({ message }, `No command category called \`${input}\` was found.`);

  const enabled = await client.db.enableCommand(`category:${category}`);
  if (!enabled) return sendInfo({ message }, `The **${category}** category is already enabled.`);
  return sendSuccess({ message }, `The **${category}** category has been enabled.`);
}
