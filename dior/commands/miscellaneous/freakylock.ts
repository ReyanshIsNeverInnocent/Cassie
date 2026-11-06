import type { CassieClient } from '../../structures/CassieClient.js';
import { executeTextLockCommand } from '../../helpers/textMessageLocks.js';

export const options = {
  name: 'freakylock',
  aliases: [] as string[],
  description: 'Toggle a server-wide fancy-script text lock for a member.',
  usage: 'freakylock <user>',
  category: 'miscellaneous',
  owner: false,
  cooldown: 3,
};

export async function prefixExecute(
  message: any,
  args: string[],
  client: CassieClient,
): Promise<any> {
  return executeTextLockCommand({ message }, client, 'freaky', args[0] ?? '');
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  await interaction.deferReply();
  return executeTextLockCommand({ interaction }, client, 'freaky');
}
