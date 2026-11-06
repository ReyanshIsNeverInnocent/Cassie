import type { CassieClient } from '../structures/CassieClient.js';
import { resolveUser } from './userResolver.js';

export function parseUserInputs(input: string): string[] {
  return [...input.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)]
    .map((match) => match[1] ?? match[2] ?? match[3])
    .filter((value): value is string => !!value);
}

export async function resolveMembers(
  input: string[],
  guild: any,
  client: CassieClient,
  excludedIds: string[],
): Promise<{ members: any[]; notFound: string[] }> {
  const members: any[] = [];
  const notFound: string[] = [];
  const seen = new Set<string>(excludedIds);

  for (const raw of input) {
    const user = await resolveUser(client, guild, raw);
    if (!user || seen.has(user.id)) {
      notFound.push(raw);
      continue;
    }

    seen.add(user.id);
    const member = await guild.members.fetch(user.id).catch((): null => null);
    if (member) members.push(member);
    else notFound.push(raw);
  }

  return { members, notFound };
}
