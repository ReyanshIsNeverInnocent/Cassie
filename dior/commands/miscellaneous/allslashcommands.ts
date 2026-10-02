import { readdirSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { config } from '../../config.js';
import {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';

export const options = {
  name: 'allslashcommands',
  aliases: [] as string[],
  description: 'Show all slash commands available to the bot.',
  usage: 'allslashcommands',
  category: 'miscellaneous',
  owner: false,
  cooldown: 3,
};

async function collectSlashCommandNames(): Promise<string[]> {
  const directories = [
    join(process.cwd(), 'dist', 'dior', 'slashCommands'),
    join(process.cwd(), 'dior', 'slashCommands'),
  ];

  const names = new Set<string>();

  for (const dir of directories) {
    let exists = false;

    try {
      exists = readdirSync(dir, { withFileTypes: true }).length > 0;
    } catch {
      continue;
    }

    if (!exists) continue;

    const scanDir = async (currentDir: string): Promise<void> => {
      for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
        const fullPath = join(currentDir, entry.name);

        if (entry.isDirectory()) {
          await scanDir(fullPath);
          continue;
        }

        if (!entry.name.endsWith('.js')) continue;

        try {
          const raw = await import(pathToFileURL(fullPath).href);
          const exported = raw.data ?? raw.default?.data;
          const dataList = Array.isArray(exported) ? exported : [exported];

          for (const data of dataList) {
            if (!data || typeof data.toJSON !== 'function') continue;
            const name = data.toJSON()?.name;
            if (name) names.add(String(name).toLowerCase());
          }
        } catch {
          // Ignore unreadable or non-command files while scanning the slash command tree.
        }
      }
    };

    try {
      await scanDir(dir);
    } catch {
      // Ignore missing directories and continue to the next fallback path.
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

export async function prefixExecute(
  message: any,
  _args: string[],
  _client: CassieClient,
): Promise<any> {
  const commandList = await collectSlashCommandNames();
  const content = `## Slash Commands\n${commandList.length > 0 ? commandList.map((name) => `\`${name}\``).join(', ') : 'No slash commands found.'}`;

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

  return message.channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}
