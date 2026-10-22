import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { sendWrongUsage } from '../../components/wrongUsage.js';

export const options = {
  name: 'disable-category',
  aliases: [] as string[],
  description: 'Disable every command in a category, with optional command exceptions.',
  usage: 'disable-category <category> [reason] [command1, command2]',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

const MANAGEMENT_COMMANDS = new Set(['disable-command', 'disable-category', 'enable-command']);

function resolveCategoryCommand(client: CassieClient, input: string): { name: string; command: any } | null {
  const name = input.toLowerCase();
  const canonical = client.commands.has(name) ? name : client.aliases.get(name);
  if (canonical) {
    const command = client.commands.get(canonical);
    if (command) return { name: canonical, command };
  }

  for (const [commandName, command] of client.slashCommands) {
    if (
      commandName === name ||
      command.options?.aliases?.some((alias: string) => alias.toLowerCase() === name)
    ) {
      return { name: commandName, command };
    }
  }
  return null;
}

function parseReasonAndExceptions(args: string[]): { reason: string; exceptions: string[] } {
  let reason = args.slice(1).join(' ').trim();
  let exceptions: string[] = [];
  const exceptionList = reason.match(/\s+\[([^\]]*)\]\s*$/);

  if (exceptionList) {
    exceptions = exceptionList[1]
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    reason = reason.slice(0, exceptionList.index).trim();
  }

  if (
    (reason.startsWith('"') && reason.endsWith('"')) ||
    (reason.startsWith("'") && reason.endsWith("'"))
  ) {
    reason = reason.slice(1, -1).trim();
  }

  return { reason: reason || 'No reason provided.', exceptions };
}

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  if (!client.db) return sendError({ message }, 'Database is unavailable.');

  const categoryInput = args[0]?.trim();
  if (!categoryInput) return sendWrongUsage({ message, client }, options.name, options.usage);

  const commands = [...client.commands.values(), ...client.slashCommands.values()];
  const category = commands
    .map((command: any) => command.options?.category)
    .find((name: unknown): name is string =>
      typeof name === 'string' && name.toLowerCase() === categoryInput.toLowerCase(),
    );
  if (!category) return sendError({ message }, `No command category called \`${categoryInput}\` was found.`);

  const { reason, exceptions: exceptionInputs } = parseReasonAndExceptions(args);
  const exceptions = new Set<string>(MANAGEMENT_COMMANDS);

  for (const input of exceptionInputs) {
    const resolved = resolveCategoryCommand(client, input);
    if (!resolved) return sendError({ message }, `No command or alias called \`${input}\` was found.`);
    if (resolved.command.options?.category?.toLowerCase() !== category.toLowerCase()) {
      return sendError({ message }, `\`${input}\` is not in the \`${category}\` category.`);
    }
    exceptions.add(resolved.name);
  }

  await client.db.disableCategory(category, reason, message.author.id, [...exceptions]);
  const exceptionSummary = exceptionInputs.length
    ? ` Exceptions: ${[...exceptions].filter((name) => !MANAGEMENT_COMMANDS.has(name)).map((name) => `\`${name}\``).join(', ')}.`
    : '';
  return sendSuccess(
    { message },
    `The **${category}** category has been disabled. Reason: ${reason}.${exceptionSummary}`,
  );
}
