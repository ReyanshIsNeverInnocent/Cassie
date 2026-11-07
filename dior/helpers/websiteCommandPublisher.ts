import type {
  WebsiteCommandSnapshot,
  WebsiteCommandSnapshotEntry,
} from '../database/database.js';
import type { CassieClient } from '../structures/CassieClient.js';

function readCooldown(value: unknown): WebsiteCommandSnapshotEntry['cooldown'] {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;

  const cooldown = value as { default?: unknown; subcommands?: unknown };
  const defaultValue =
    typeof cooldown.default === 'number' && Number.isFinite(cooldown.default)
      ? Math.max(0, cooldown.default)
      : 0;
  const subcommands =
    cooldown.subcommands && typeof cooldown.subcommands === 'object' && !Array.isArray(cooldown.subcommands)
      ? Object.fromEntries(
          Object.entries(cooldown.subcommands).flatMap(([name, seconds]) =>
            typeof seconds === 'number' && Number.isFinite(seconds)
              ? [[name, Math.max(0, seconds)]]
              : [],
          ),
        )
      : undefined;

  return subcommands ? { default: defaultValue, subcommands } : { default: defaultValue };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toCommandEntry(
  name: string,
  options: Record<string, any>,
  prefixModule: any,
  slashCommand: Record<string, unknown> | undefined,
): WebsiteCommandSnapshotEntry {
  const canonicalName = String(options.name ?? name).replace(/^[$/]+/, '').toLowerCase();
  const aliases = stringList(options.aliases);
  const description =
    typeof options.description === 'string'
      ? options.description
      : typeof slashCommand?.description === 'string'
        ? slashCommand.description
        : '';
  const usage =
    typeof options.usage === 'string'
      ? options.usage
      : `${prefixModule ? '$' : '/'}${canonicalName}`;
  const category = typeof options.category === 'string' ? options.category : 'Other';
  const userPerms = stringList(options.userPerms);
  const botPerms = stringList(options.botPerms);
  const cooldown = readCooldown(options.cooldown);
  const ownerOnly = options.owner === true;
  const serverOwnerOnly = options.serverOwnerOnly === true;
  const trustedAdministrator = options.trustedAdministrator === true;

  const commandOptions = {
    name: canonicalName,
    description,
    category,
    usage,
    aliases,
    owner: ownerOnly,
    serverOwnerOnly,
    trustedAdministrator,
    userPerms,
    botPerms,
    cooldown,
  };

  return {
    name: `${prefixModule ? '$' : '/'}${canonicalName}`,
    category,
    description,
    usage: prefixModule ? `$${usage.replace(/^\$/, '')}` : usage,
    prefix: Boolean(prefixModule),
    slash: Boolean(slashCommand),
    aliases,
    permission: userPerms.length ? userPerms.join(', ') : null,
    cooldown,
    ownerOnly,
    serverOwnerOnly,
    trustedAdministrator,
    userPerms,
    botPerms,
    commandOptions,
    ...(slashCommand ? { slashCommand } : {}),
  };
}

export function buildWebsiteCommandSnapshot(client: CassieClient): WebsiteCommandSnapshot {
  const names = new Set([
    ...client.commands.keys(),
    ...client.websiteSlashCommands.keys(),
  ]);
  const commands: WebsiteCommandSnapshotEntry[] = [];

  for (const rawName of names) {
    const name = rawName.toLowerCase();
    const prefixModule = client.commands.get(name);
    const slashModule = client.slashCommands.get(name);
    const slashCommand = client.websiteSlashCommands.get(name);
    const options = prefixModule?.options ?? slashModule?.options ?? {};
    if (options.owner === true || (!prefixModule && !slashCommand)) continue;
    commands.push(toCommandEntry(name, options, prefixModule, slashCommand));
  }

  commands.sort(
    (left, right) =>
      left.category.localeCompare(right.category) || left.name.localeCompare(right.name),
  );
  return { updatedAt: Date.now(), commands };
}

export async function publishWebsiteCommandSnapshot(client: CassieClient): Promise<void> {
  if (!client.db) throw new Error('Database is not connected.');
  const snapshot = buildWebsiteCommandSnapshot(client);
  await client.db.updateWebsiteCommandSnapshot(snapshot);
  console.log(`[WEB COMMANDS] Published ${snapshot.commands.length} public command(s) to PostgreSQL.`);
}
