// xoxo/commands/developer/say-embed.ts
//
// Send a raw embed JSON payload as the bot. Developer-only.
//
// Accepts three JSON shapes:
//   • A single embed object   → { title, description, ... }
//   • An array of embeds      → [{ ... }, { ... }]
//   • A full message object   → { content, embeds: [...] }
//
// The JSON body can be provided:
//   a) inline after the command name
//   b) as a text file attachment (useful for payloads > 2000 chars)
//
// The command message is always deleted after sending.
// If used as a reply, the bot replies to that message.

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';

export const options = {
  name: 'say-embed',
  aliases: ['say-em'] as string[],
  description: 'Send a raw embed JSON payload as the bot.',
  usage: `say-embed <json>
  say-embed (with a .json/.txt attachment)`,
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, args: string[], _client: CassieClient) {
  let rawJson: string =
    typeof message.commandRawArgs === 'string' ? message.commandRawArgs.trim() : args.join(' ').trim();

  if (!rawJson && message.attachments?.size) {
    const attachment = message.attachments.first();
    const MAX_BYTES = 1_000_000;
    if (attachment.size > MAX_BYTES) {
      return sendError({ message }, `Attachment is too large (max ${MAX_BYTES.toLocaleString()} bytes).`);
    }
    try {
      const res = await fetch(attachment.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      rawJson = (await res.text()).trim();
    } catch (err: any) {
      return sendError({ message }, `Failed to read attachment: \`${err.message}\``);
    }
    if (!rawJson) return sendError({ message }, 'The attached file is empty.');
  }

  if (!rawJson) {
    return sendError({ message }, 'Provide an embed JSON payload, or attach a file.');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err: any) {
    return sendError({ message }, `Invalid JSON:\n\`${err.message}\``);
  }

  let sendPayload: any;
  if (Array.isArray(parsed)) {
    sendPayload = { embeds: parsed, allowedMentions: { parse: [] } };
  } else if (parsed && typeof parsed === 'object' && 'embeds' in parsed) {
    sendPayload = {
      content: parsed.content ?? null,
      embeds: parsed.embeds ?? [],
      allowedMentions: { parse: [] },
    };
  } else {
    sendPayload = { embeds: [parsed], allowedMentions: { parse: [] } };
  }

  await message.delete().catch((): null => null);

  if (message.reference?.messageId) {
    const replied = await message.channel.messages
      .fetch(message.reference.messageId)
      .catch((): null => null);
    if (replied) {
      await replied.reply(sendPayload).catch((): Promise<any> => message.channel.send(sendPayload));
      return;
    }
  }

  const sent = await message.channel.send(sendPayload).catch((): null => null);
  if (!sent) {
    const errMsg = await sendError(
      { channel: message.channel },
      'Discord rejected the embed payload. Check your JSON structure.',
    );
    if (errMsg) setTimeout(() => (errMsg as any).delete().catch((): null => null), 8000);
  }
}
