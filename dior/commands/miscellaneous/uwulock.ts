import type { CassieClient } from '../../structures/CassieClient.js';
import { executeTextLockCommand } from '../../helpers/textMessageLocks.js';

export const options = {
  name: 'uwulock',
  aliases: [] as string[],
  description: 'Toggle a server-wide UwU text lock for a member.',
  usage: 'uwulock <user>',
  category: 'miscellaneous',
  owner: false,
  cooldown: 3,
};

export async function prefixExecute(
  message: any,
  args: string[],
  client: CassieClient,
): Promise<any> {
  return executeTextLockCommand({ message }, client, 'uwu', args[0] ?? '');
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  await interaction.deferReply();
  return executeTextLockCommand({ interaction }, client, 'uwu');
}
