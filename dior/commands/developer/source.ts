import type { CassieClient } from '../../structures/CassieClient.js';
import { buildDeveloperOutput } from '../../components/developer/devToolkit.js';
import { rawCommandInput, readSource } from '../../helpers/devToolkit.js';

export const options = {
  name: 'source',
  description: 'Read a workspace source file, excluding secrets and build output.',
  usage: 'source <workspace-relative-file>',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, args: string[], _client: CassieClient) {
  const result = readSource(rawCommandInput(message, args));
  return message.channel.send(buildDeveloperOutput('Source viewer', result.output, result.success));
}
