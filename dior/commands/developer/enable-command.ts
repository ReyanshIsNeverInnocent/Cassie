import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';
import { resolveCommand } from './disable-command.js';

export const options = {
  name: 'enable-command',
  aliases: [] as string[],
  description: 'Enable a previously disabled command.',
  usage: 'enable-command <command name, alias, or category>',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  if (!client.db) return sendError({ message }, 'Database is unavailable.');
  const input = args[0]?.trim();
  if (!input) return sendError({ message }, 'Please provide a command name or default alias.');

  const resolved = resolveCommand(client, input);
  if (resolved) {
    const enabled = await client.db.enableCommand(resolved.name);
    if (!enabled) return sendInfo({ message }, `**${resolved.command.options.name}** is already enabled.`);
    return sendSuccess({ message }, `**${resolved.command.options.name}** has been enabled.`);
  }

  const category = [...client.commands.values(), ...client.slashCommands.values()]
    .map((command: any) => command.options?.category)
    .find((name: unknown): name is string =>
      typeof name === 'string' && name.toLowerCase() === input.toLowerCase(),
    );
  if (!category) return sendError({ message }, `No command or category called \`${input}\` was found.`);

  const enabled = await client.db.enableCommand(`category:${category}`);
  if (!enabled) return sendInfo({ message }, `The **${category}** category is already enabled.`);
  return sendSuccess({ message }, `The **${category}** category has been enabled.`);
}