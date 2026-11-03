// xoxo/commands/developer/bias.ts
//
// $bias — developer tool to override the percentage a specific user gets on
// one of the rating commands ($howcute, $gay, $autistic, $intelligent, $simp, $rizz).
//
// Usage:
//   bias <cute|gay|autistic|intelligent|simp|rizz> <@user|ID|username> <amount|infinity>
//   bias <cute|gay|autistic|intelligent|simp|rizz> <@user|ID|username> remove
//
// The saved bias is used instead of the random roll the next time that user
// runs the command, until removed. Developer (Reyansh) always sees Infinite%
// regardless of any bias set.

import type { CassieClient } from '../../structures/CassieClient.js';
import type { RatingCommandName } from '../../database/database.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { sendWrongUsage } from '../../components/wrongUsage.js';
import { resolveUser } from '../../helpers/userResolver.js';

export const options = {
  name:        'bias',
  aliases:     [] as string[],
  description: 'Set a fixed rating percentage bias for a user.',
  usage:       'bias <cute|gay|autistic|intelligent|simp|rizz> <@user|ID|username> <amount|infinity|remove>',
  category:    'developer',
  owner:       true,
  cooldown:    0,
};

const VALID_COMMANDS: RatingCommandName[] = ['cute', 'gay', 'autistic', 'intelligent', 'simp', 'rizz'];

export async function prefixExecute(message: any, args: string[], client: CassieClient): Promise<any> {
  const ctx = { message };

  if (args.length < 3) return sendWrongUsage({ message, client }, options.name, options.usage);

  const commandArg = args[0]?.toLowerCase();
  if (!VALID_COMMANDS.includes(commandArg as RatingCommandName)) {
    return sendError(ctx, `Invalid command. Must be one of: \`${VALID_COMMANDS.join('`, `')}\`.`);
  }
  const command = commandArg as RatingCommandName;

  const amountArg = args[args.length - 1];
  const userArg = args.slice(1, args.length - 1).join(' ').trim();
  if (!userArg) return sendError(ctx, 'Please provide a valid user (mention, ID, or username).');

  const user = await resolveUser(client, message.guild, userArg);
  if (!user) return sendError(ctx, `Could not find a user matching \`${userArg}\`.`);

  const normalizedAmount = amountArg.toLowerCase();

  if (['remove', 'clear', 'none', 'reset'].includes(normalizedAmount)) {
    const removed = await client.db.removeRatingBias(command, user.id);
    if (!removed) return sendError(ctx, `<@${user.id}> has no bias set for \`${command}\`.`);
    return sendSuccess(ctx, `Removed the \`${command}\` bias for <@${user.id}>.`);
  }

  if (normalizedAmount === 'infinity' || normalizedAmount === 'inf' || normalizedAmount === '\u221e') {
    await client.db.setRatingBias(command, user.id, null, true, message.author.id);
    return sendSuccess(ctx, `<@${user.id}> will now always get **Infinite%** on \`${command}\`.`);
  }

  const amount = Number(amountArg);
  if (!Number.isFinite(amount)) {
    return sendError(ctx, 'Amount must be a number (can be negative), or `infinity`, or `remove`.');
  }

  await client.db.setRatingBias(command, user.id, amount, false, message.author.id);
  return sendSuccess(ctx, `<@${user.id}> will now always get **${amount}%** on \`${command}\`.`);
}
