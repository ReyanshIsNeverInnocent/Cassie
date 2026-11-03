// xoxo/commands/developer/global-ar.ts
//
// Developer-only command to manage global autoresponders across all guilds.
// Opens an interactive panel listing every trigger across every guild,
// paginated, with multi-select to toggle global status.

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { runGlobalArPanel } from '../../components/developer/global-ar.js';

export const options = {
  name: 'global-ar',
  aliases: ['gar', 'globalar'] as string[],
  description: 'Manage global autoresponders across all guilds.',
  usage: 'global-ar',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, _args: string[], client: CassieClient): Promise<any> {
  const ctx = { message };
  if (!client.db) return sendError(ctx, 'Database is unavailable right now.');
  return runGlobalArPanel(message, client);
}
