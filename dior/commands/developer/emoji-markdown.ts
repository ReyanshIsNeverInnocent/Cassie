import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { resolveEmoji } from '../../helpers/emojiResolver.js';

export const options = {
  name: 'emoji-markdown',
  aliases: ['emmd', 'emoji-md'] as string[],
  description: 'Get the markdown for one or more custom emojis.',
  usage: `emoji-markdown <emoji id or name or emoji>
  emoji-markdown <emoji1> <emoji2>
  emoji-markdown <emoji1>|$|<emoji2>`,
  category: 'developer',
  owner: true,
  cooldown: 2,
};

const NO_SPACE_SEP = '|$|';

function parseInput(input: string): string[] {
  return input
    .split(/\s+/)
    .flatMap((token) => token.split(NO_SPACE_SEP))
    .filter(Boolean);
}

function toMarkdown(emoji: any): string {
  if (!emoji || !emoji.id) return '';
  return emoji.animated
    ? `<a:${emoji.name}:${emoji.id}>`
    : `<:${emoji.name}:${emoji.id}>`;
}

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  const input = args.join(' ').trim();
  if (!input) {
    return sendError({ message }, 'Please provide emoji identifiers.');
  }

  const ids = parseInput(input);
  const markdowns: string[] = [];
  const invalid: string[] = [];

  for (const ident of ids) {
    const emoji = await resolveEmoji(client, ident, message.guild);
    if (!emoji || !emoji.id) {
      invalid.push(ident);
      continue;
    }

    const currentEmoji = typeof emoji.fetch === 'function'
      ? await emoji.fetch().catch(() => emoji)
      : emoji;
    const markdown = toMarkdown(currentEmoji);
    if (markdown) markdowns.push(`\`${markdown}\``);
  }

  if (!markdowns.length) {
    return sendError({ message }, 'None of the provided emoji identifiers were valid.');
  }

  await message.delete().catch(() => {});

  const response = markdowns.join('\n');

  if (message.reference?.messageId) {
    const replied = await message.channel.messages.fetch(message.reference.messageId).catch((): null => null);
    if (replied) {
      await replied.reply(response).catch(() => message.channel.send(response));
    } else {
      await message.channel.send(response);
    }
  } else {
    await message.channel.send(response);
  }

  if (invalid.length) {
    const errMsg = await sendError(
      { channel: message.channel },
      `Some emoji identifiers were invalid:\n${invalid.map((id) => `• \`${id}\``).join('\n')}`,
    );
    if (errMsg) setTimeout(() => (errMsg as any).delete().catch(() => {}), 6000);
  }
}
