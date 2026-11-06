// xoxo/events/discord/messageUpdate.ts
//
// Logging: fires when a message's content is edited. Ignores bot messages,
// DMs, and updates where the text content didn't actually change (e.g. an
// embed loading in after a link is posted).

import type { CassieClient } from '../../structures/CassieClient.js';
import { dispatchLog } from '../../helpers/logDispatcher.js';
import { buildMessageUpdatePayload } from '../../components/logging/logMessages.js';
import { getStarboardSettingsForReaction, syncStarboardReaction } from '../../helpers/starboard.js';
import { enforceImageRestriction } from '../../helpers/memberRestrictions.js';
import { enforceMediaChannel } from '../../helpers/mediaChannel.js';
import { processTextMessageLock } from '../../helpers/textMessageLocks.js';

export const name = 'messageUpdate';
export const once = false;

export async function execute(oldMessage: any, newMessage: any, client: CassieClient): Promise<void> {
  if (!newMessage.guild) return;
  if (newMessage.author?.bot) return;
  if (oldMessage.content !== newMessage.content && await processTextMessageLock(newMessage, client)) return;
  if (await enforceMediaChannel(newMessage, client)) return;
  if (await enforceImageRestriction(newMessage, client)) return;

  const settings = await client.db.getStarboardSettings(newMessage.guild.id).catch((): null => null);
  const post = await client.db.getStarboardPost(newMessage.guild.id, newMessage.id).catch((): null => null);
  if (settings && post?.active) {
    for (const [, reaction] of (newMessage.reactions?.cache ?? new Map())) {
      const matchingSettings = await getStarboardSettingsForReaction(reaction, client);
      if (matchingSettings) {
        await syncStarboardReaction(reaction, newMessage.author, client).catch((): null => null);
        break;
      }
    }
  }

  if (oldMessage.content === newMessage.content) return;

  const channelId = newMessage.channelId ?? newMessage.channel?.id;
  if (!channelId) return;

  const payload = buildMessageUpdatePayload(oldMessage, newMessage);
  await dispatchLog(client, newMessage.guild.id, 'message', [channelId], payload);
}
