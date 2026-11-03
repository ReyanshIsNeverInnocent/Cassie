import type { CassieClient } from '../../structures/CassieClient.js';
import { buildDeveloperOutput } from '../../components/developer/devToolkit.js';
import { evaluateCode, rawCommandInput } from '../../helpers/devToolkit.js';

export const options = {
  name: 'eval',
  aliases: ['e'],
  description: 'Evaluate JavaScript in a time-limited context.',
  usage: 'eval <javascript>',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  try {
    const output = await evaluateCode(message, rawCommandInput(message, args), args, client);
    return message.channel.send(buildDeveloperOutput('Eval', output));
  } catch (error: any) {
    return message.channel.send(buildDeveloperOutput('Eval failed', error?.stack ?? String(error), false));
  }
}