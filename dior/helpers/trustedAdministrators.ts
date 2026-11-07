import type { CassieClient } from '../structures/CassieClient.js';
import type { CommandOptions } from '../handlers/commandLoader.js';
import { isBotDeveloper } from './developerPermissionBypass.js';

export type GuildCommandAccess =
  | { allowed: true }
  | { allowed: false; error: string };

export async function checkGuildCommandAccess(
  options: Pick<CommandOptions, 'serverOwnerOnly' | 'trustedAdministrator'>,
  guild: any,
  userId: string,
  client: CassieClient,
): Promise<GuildCommandAccess> {
  if (isBotDeveloper(client, userId)) return { allowed: true };
  if (!options.serverOwnerOnly && !options.trustedAdministrator) return { allowed: true };
  if (userId === guild?.ownerId) return { allowed: true };
  if (options.serverOwnerOnly) {
    return { allowed: false, error: 'Only the actual server owner can use this command.' };
  }
  if (!client.db) {
    return {
      allowed: false,
      error: 'I cannot verify trusted administrator access because the database is unavailable.',
    };
  }

  try {
    if (await client.db.isGuildTrustedAdministrator(guild.id, userId)) return { allowed: true };
  } catch (err: any) {
    console.error(`[trustedadmin] failed to verify access in ${guild.id}: ${err?.message ?? err}`);
    return {
      allowed: false,
      error: 'I could not verify trusted administrator access because the database request failed.',
    };
  }

  return {
    allowed: false,
    error: 'Only the server owner or a trusted administrator can use this command.',
  };
}
