// xoxo/handlers/helperLoader.ts
//
// Scans `dist/dior/helpers/*.js` (top-level only, not recursive) and loads
// every file whose default export is a factory function. The factory receives
// the client and returns whatever the helper exposes. The returned value is
// stored on `client.helpers[helperName]`.
//
// Helper file contract:
//   export default function(client: CassieClient): SomeHelperType { ... }
//   // or async:
//   export default async function(client: CassieClient): Promise<SomeHelperType> { ... }
//
// Access helpers as: client.helpers.purgeHelper, client.helpers.userResolver, etc.

import { readdirSync } from 'fs';
import { join, basename } from 'path';
import { pathToFileURL }  from 'url';
import type { CassieClient } from '../structures/CassieClient.js';

// ── Public API ───────────────────────────────────────────────────────────────

export async function loadHelpers(client: CassieClient): Promise<Record<string, any>> {
  const dir     = join(process.cwd(), 'dist', 'dior', 'helpers');
  const helpers: Record<string, any> = {};
  let loaded = 0;
  let moduleCount = 0;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
      moduleCount++;

      try {
        const full = join(dir, entry.name);
        const raw  = await import(pathToFileURL(full).href);

        const factory = raw.default;
        if (typeof factory !== 'function') continue;

        const key          = basename(entry.name, '.js');
        helpers[key]       = await factory(client);
        loaded++;
      } catch (err: unknown) {
        console.error(`[HELPERS LOADER] Failed to load ${entry.name}:`, err);
      }
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[HELPERS LOADER] Error reading helpers directory:', err);
    }
  }

  console.log(
    `[HELPERS LOADER] Registered ${loaded} client.helpers factory(ies) from ${moduleCount} helper modules (other modules are imported directly where needed)`,
  );
  return helpers;
}
