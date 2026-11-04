import type { CassieClient } from '../../structures/CassieClient.js';
import { buildDeveloperOutput } from '../../components/developer/devToolkit.js';
import { evaluateCode, limitOutput, rawCommandInput } from '../../helpers/devToolkit.js';

export const options = {
  name: 'eval',
  aliases: ['e'] as string[],
  description: 'Evaluate a JavaScript expression or async snippet.',
  usage: `eval <expression>
  eval <JavaScript statements>`,
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  const code = rawCommandInput(message, args);
  if (!code) {
    return message.channel.send(
      buildDeveloperOutput('Evaluation usage', 'Provide JavaScript code: `eval <expression or statements>`.', false),
    );
  }

  try {
    const output = await evaluateCode(message, code, args, client);
    return message.channel.send(buildDeveloperOutput('Evaluation complete', output));
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.stack ?? error.message : String(error);
    return message.channel.send(
      buildDeveloperOutput('Evaluation failed', limitOutput(detail), false),
    );
  }
}
