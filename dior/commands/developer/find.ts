import type { CassieClient } from '../../structures/CassieClient.js';
import { buildDeveloperPanel } from '../../components/developer/devToolkit.js';
import { rawCommandInput } from '../../helpers/devToolkit.js';

export const options = {
  name: 'find',
  aliases: ['find-command'] as string[],
  description: 'Search loaded prefix commands by name, alias, description, or category.',
  usage: 'find <search terms>',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  const query = rawCommandInput(message, args).toLowerCase();
  if (!query) {
    return message.channel.send(buildDeveloperPanel('Command search', [
      { heading: 'Usage', body: 'Use `find <name, alias, description, or category>`.' },
    ], false));
  }

  const matches = [...client.commands.values()]
    .filter((command) => {
      const options = command.options ?? {};
      const haystack = [
        options.name,
        options.description,
        options.category,
        ...(options.aliases ?? []),
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => (a.options?.name ?? '').localeCompare(b.options?.name ?? ''));
  const results = matches.slice(0, 18);

  const sections = results.map((command) => {
    const options = command.options ?? {};
    const aliases = options.aliases?.length ? `\nAliases: \`${options.aliases.join('`, `')}\`` : '';
    return {
      heading: `${options.name ?? 'unknown'} · ${options.category ?? 'uncategorized'}`,
      body: `${options.description ?? 'No description'}${aliases}`,
    };
  });
  if (!sections.length) {
    sections.push({ heading: 'No matches', body: `No loaded prefix commands matched \`${query}\`.` });
  }

  const messagePayload = buildDeveloperPanel(
    `Command search · showing ${results.length} of ${matches.length}`,
    sections,
  );
  return message.channel.send(messagePayload);
}
