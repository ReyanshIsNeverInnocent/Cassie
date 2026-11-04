import type { CassieClient } from '../../structures/CassieClient.js';
import { buildDeveloperOutput } from '../../components/developer/devToolkit.js';
import { executeSafeCommand, rawCommandInput } from '../../helpers/devToolkit.js';

export const options = {
  name: 'exec',
  description: 'Run an allowlisted project maintenance command.',
  usage: `exec <pwd|ls [directory]|git status|git branch|git log|git diff --stat>
  exec <node --version|npm run build|npm run check:command-parity>`,
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, args: string[], _client: CassieClient) {
  const result = await executeSafeCommand(rawCommandInput(message, args));
  return message.channel.send(buildDeveloperOutput('Command output', result.output, result.success));
}
