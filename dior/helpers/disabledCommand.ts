import type { Database, DisabledCommandDoc } from '../database/database.js';

export type DisabledCommandStatus =
  | { scope: 'command'; reason: string }
  | { scope: 'category'; category: string; reason: string };

const COMMAND_MANAGEMENT_COMMANDS = new Set([
  'disable-command',
  'disable-category',
  'enable-command',
]);

export async function getDisabledCommandStatus(
  db: Pick<Database, 'getDisabledCommand' | 'getDisabledCategory'>,
  commandName: string,
  category?: string,
  aliases: string[] = [],
): Promise<DisabledCommandStatus | null> {
  const normalizedName = commandName.toLowerCase();
  if (COMMAND_MANAGEMENT_COMMANDS.has(normalizedName)) return null;

  const disabledCommand = await db.getDisabledCommand(normalizedName);
  if (disabledCommand) return { scope: 'command', reason: disabledCommand.reason };
  if (!category) return null;

  const disabledCategory: DisabledCommandDoc | null = await db.getDisabledCategory(category);
  if (!disabledCategory) return null;

  const exceptions = new Set((disabledCategory.exceptions ?? []).map((name) => name.toLowerCase()));
  if ([normalizedName, ...aliases.map((alias) => alias.toLowerCase())].some((name) => exceptions.has(name))) {
    return null;
  }

  return {
    scope: 'category',
    category,
    reason: disabledCategory.reason,
  };
}
