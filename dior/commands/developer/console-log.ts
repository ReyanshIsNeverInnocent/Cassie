// xoxo/commands/developer/console-log.ts
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendSuccess } from '../../components/statusMessages.js';
import { sendWrongUsage } from '../../components/wrongUsage.js';

export const options = {
  name: 'console-log',
  aliases: [] as string[],
  description: 'Log text to the console.',
  usage: 'console-log <text>',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  if (!args.length) return sendWrongUsage({ message, client }, options.name, options.usage);

  const firstWsMatch = message.content.match(/^\S+\s+/);
  const rawText = firstWsMatch ? message.content.slice(firstWsMatch[0].length) : args.join(' ');

  const lines: string[] = rawText
    .replace(/\\n/g, '\n')
    .split('\n')
    .map((l: string) => l.trim())
    .filter(Boolean);

  if (!lines.length) return sendWrongUsage({ message, client }, options.name, options.usage);

  for (const line of lines) {
    console.log(`[DEV LOG] ${line}`);
  }

  const quoted = lines.map((l: string) => `> ${l}`).join('\n');
  await sendSuccess({ message }, `Logged to console:\n${quoted}`);
}
