// xoxo/handlers/commandRegister.ts
//
// Reads every `data` export (SlashCommandBuilder) from
// `dist/dior/slashCommands/**/*.js` and registers them with Discord globally
// via REST PUT /applications/:id/commands.
//
// This is intentionally separate from slashLoader.ts:
//   • slashLoader  — maps command names → execute functions (in-memory)
//   • commandRegister — pushes builders to Discord's API (network call)
//
// Slash builder file contract (in `dior/slashCommands/<category>/foo.ts`):
//   export const data = new SlashCommandBuilder()
//     .setName('foo')
//     .setDescription('Does foo things.');

import { readdirSync } from 'fs';
import { join }        from 'path';
import { pathToFileURL } from 'url';
import { REST, Routes }  from 'discord.js';
import type { CassieClient } from '../structures/CassieClient.js';

// Discord permits at most 100 top-level global chat-input commands per
// application. These low-value informational commands remain available via
// prefix commands, but are intentionally not registered globally so every
// moderation, music, security, and utility slash command can fit.
const PREFIX_ONLY_SLASH_COMMANDS = new Set([
  'placeholder-help',
  'developer',
  'invite',
  'uptime',
  // Keep the global payload within Discord's 100-command limit. These
  // informational commands remain fully available through the prefix help
  // system, while newer media lookup commands keep their slash registrations.
  'host',
  'node-status',
  'firstmessage',
  // Keep the global command payload below Discord's 100-command limit.
  // These low-priority rating commands remain available as prefix commands.
  'howautistic',
  'howcute',
  'howgay',
  'howsimp',
]);

const MAX_GLOBAL_SLASH_COMMANDS = 100;

/** Default permission masks are enforced by the interaction router instead of Discord,
 * so configured bot developers can invoke otherwise-restricted slash commands. */
export const slashCommandPermissionRequirements = new Map<string, string>();

// ── Public API ───────────────────────────────────────────────────────────────

export async function registerSlashCommands(client: CassieClient): Promise<void> {
  const token    = client.config.botToken;
  const clientId = client.config.clientId;

  if (!token || !clientId) {
    console.warn('[SLASH REG] Missing DISCORD_TOKEN or DISCORD_CLIENT_ID — skipping registration.');
    return;
  }

  const dir      = join(process.cwd(), 'dist', 'dior', 'slashCommands');
  const builders: any[] = [];

  try {
    await collectBuilders(dir, builders);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('[SLASH REG] slashCommands directory not found — skipping.');
      return;
    }
    throw err;
  }

  if (builders.length === 0) {
    console.info('[SLASH REG] No slash command builders found.');
    return;
  }

  if (builders.length > MAX_GLOBAL_SLASH_COMMANDS) {
    const overflow = builders.splice(MAX_GLOBAL_SLASH_COMMANDS);
    console.warn(
      `[SLASH REG] Found ${builders.length + overflow.length} commands; registering the first ${MAX_GLOBAL_SLASH_COMMANDS}. ` +
      `Prefix-only overflow: ${overflow.map((builder) => builder.toJSON()?.name).join(', ')}`,
    );
  }

  slashCommandPermissionRequirements.clear();
  for (const builder of builders) {
    const json = builder.toJSON() as Record<string, any>;
    if (json.default_member_permissions !== null && json.default_member_permissions !== undefined) {
      slashCommandPermissionRequirements.set(
        json.name,
        String(json.default_member_permissions),
      );
    }
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    await rest.put(Routes.applicationCommands(clientId), {
      body: builders.map((b) => {
        const json = b.toJSON() as Record<string, any>;
        // If the builder didn't call setIntegrationTypes(), Discord (for apps
        // with user-install enabled) may surface the command to user-install
        // users in every server, even ones the bot isn't in.  Stamp it
        // explicitly as GuildInstall-only (0) so it only appears where the bot
        // is a guild member.
        if (!Array.isArray(json.integration_types)) {
          json.integration_types = [0];
          json.contexts          = [0]; // Guild context only
        }
        if (json.default_member_permissions !== undefined) {
          json.default_member_permissions = null;
        }
        return json;
      }),
    });
    console.log(`[SLASH REG] Registered ${builders.length} slash command(s) globally.`);
    (client as any).slashCommandsSynced = true;
  } catch (err: unknown) {
    console.error('[SLASH REG] Failed to register slash commands with Discord:', err);
  }
}

// ── Internals ────────────────────────────────────────────────────────────────

async function collectBuilders(dir: string, builders: any[]): Promise<void> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      await collectBuilders(full, builders);
      continue;
    }

    if (!entry.name.endsWith('.js')) continue;

    try {
      const raw  = await import(pathToFileURL(full).href);
      // Support both: `export const data = ...` and `export default { data }`
      const exported = raw.data ?? raw.default?.data;
      const dataList = Array.isArray(exported) ? exported : [exported];

      for (const data of dataList) {
        if (!data || typeof data.toJSON !== 'function') continue;
        const name = data.toJSON()?.name;
        if (PREFIX_ONLY_SLASH_COMMANDS.has(name)) {
          console.info(`[SLASH REG] Keeping /${name} prefix-only to stay within Discord's 100-command limit.`);
          continue;
        }
        builders.push(data);
      }
    } catch (err: unknown) {
      console.error(`[SLASH REG] Failed to read builder from ${entry.name}:`, err);
    }
  }
}
