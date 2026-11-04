import type { CassieClient } from '../../structures/CassieClient.js';
import { buildDeveloperOutput } from '../../components/developer/devToolkit.js';
import { rawCommandInput, reloadPrefixCommand } from '../../helpers/devToolkit.js';

export const options = {
  name: 'reload',
  description: 'Reload a compiled prefix command without restarting the bot.',
  usage: 'reload <command name or alias>',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  const result = await reloadPrefixCommand(client, rawCommandInput(message, args));
  return message.channel.send(buildDeveloperOutput('Command reload', result.output, result.success));
}
