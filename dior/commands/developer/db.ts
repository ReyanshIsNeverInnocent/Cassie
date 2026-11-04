import { buildDeveloperPanel } from '../../components/developer/devToolkit.js';
import type { CassieClient } from '../../structures/CassieClient.js';

export const options = {
  name: 'db',
  aliases: ['db-stats'] as string[],
  description: 'Show read-only database connectivity and aggregate diagnostics.',
  usage: 'db',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, _args: string[], client: CassieClient) {
  if (!client.db) {
    return message.channel.send(buildDeveloperPanel('Database diagnostics', [
      { heading: 'Database', body: 'Not initialized in this process.' },
    ], false));
  }

  try {
    const diagnostics = await client.db.getDeveloperDiagnostics();
    return message.channel.send(buildDeveloperPanel('Database diagnostics · read only', [
      { heading: 'PostgreSQL', body: `Connected · ${diagnostics.pingMs} ms` },
      { heading: 'Global commands executed', body: diagnostics.commandsExecuted.toLocaleString() },
      { heading: 'No-prefix grants', body: diagnostics.noPrefixGrants.toLocaleString() },
      { heading: 'Blacklisted users', body: diagnostics.blacklistedUsers.toLocaleString() },
      { heading: 'Blacklisted servers', body: diagnostics.blacklistedServers.toLocaleString() },
    ]));
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return message.channel.send(buildDeveloperPanel('Database diagnostics', [
      { heading: 'Query failed', body: detail },
    ], false));
  }
}
