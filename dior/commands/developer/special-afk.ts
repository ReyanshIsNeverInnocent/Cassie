import { config } from '../../config.js';
// xoxo/commands/developer/special-afk.ts
//
// Developer-only AFK with a custom Since/Till time as the FIRST argument.
//
//   special-afk <time> <reason...> [image URL or attachment]
//
// `<time>` is a single whitespace-bounded token parsed by
// `parseTimeExpression` (see `xoxo/helpers/devTimeTweak.ts`). Any time
// format the parser accepts works — Discord timestamps, bare unix
// integers (s or ms), signed relative durations (`-5h`, `+1d12h`,
// `-2y`, `1y2mo3w4d5h6m7s`, `500ms`), or ISO 8601 dates.
//
// Past time → stored as `since_at` (when AFK started).
// Future time → stored as `till_at` (when AFK should end).

import {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildAfkConfirmationPayload, type AfkScope } from '../../components/utility/afk.js';
import { emojis } from '../../emojis.js';
import { parseSayText } from '../../helpers/emojiParser.js';
import { resolveEmoji } from '../../helpers/emojiResolver.js';
import { parseTimeExpression } from '../../helpers/devTimeTweak.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';

export const options = {
  name: 'special-afk',
  aliases: ['specialafk', 'devafk'] as string[],
  description: 'Set an AFK with a custom Since/Till time.',
  usage: `special-afk <time> <reason>
  special-afk <time> <reason> <image URL>
  special-afk <time> <reason> [attach an image]`,
  category: 'developer',
  owner: true,
  cooldown: 0,
};

interface ParsedSpecialAfk {
  reason: string;
  imageUrl: string | null;
  sinceAt: Date;
  tillAt: Date | null;
}

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  const rawInput = typeof message.commandRawArgs === 'string' ? message.commandRawArgs : args.join(' ');
  const attachment =
    message.attachments.first?.() ?? message.attachments.first?.call(message.attachments) ?? null;

  const parsed = await parseSpecialAfkInput(rawInput, attachment?.url ?? null, client, message.guild);
  if (parsed === 'no-args') {
    return sendError(
      { message },
      'Usage: `special-afk <time> <reason> [image]`\nExample: `special-afk -2h Was at lunch`',
    );
  }
  if (parsed === 'bad-time') {
    return sendError(
      { message },
      'I could not parse the first argument as a time.\nAccepted: relative durations (`-2h`, `+1d12h`, `-100y`), Discord timestamps (`<t:1735689600>`), unix integers, ISO dates (`2025-12-31`).',
    );
  }
  if (parsed === 'bad-emoji') {
    return sendError({ message }, 'Some emoji identifiers in your AFK reason were invalid.');
  }

  return sendSpecialAfkConfirmation({
    client,
    message,
    userId: message.author.id,
    guildId: message.guildId,
    parsed,
  });
}

async function parseSpecialAfkInput(
  rawInput: string,
  attachmentUrl: string | null,
  client: CassieClient,
  guild: any,
): Promise<ParsedSpecialAfk | 'no-args' | 'bad-time' | 'bad-emoji'> {
  const trimmed = rawInput.trim();
  if (!trimmed) return 'no-args';

  const firstWs = trimmed.search(/\s/);
  const timeToken = firstWs === -1 ? trimmed : trimmed.slice(0, firstWs);
  let rest = firstWs === -1 ? '' : trimmed.slice(firstWs + 1).trim();

  const now = new Date();
  const date = parseTimeExpression(timeToken, now);
  if (!date) return 'bad-time';

  let sinceAt: Date = now;
  let tillAt: Date | null = null;
  if (date.getTime() <= now.getTime()) sinceAt = date;
  else tillAt = date;

  let imageUrl = attachmentUrl;
  if (!imageUrl && rest) {
    const parts = rest.split(/\s+/);
    const last = parts[parts.length - 1];
    if (/^https?:\/\/\S+$/i.test(last ?? '')) {
      imageUrl = last;
      parts.pop();
      rest = parts.join(' ').trim();
    }
  }

  const normalized = rest
    .replace(/\\\\n/g, '\u0000')
    .replace(/\\n/g, '\n')
    .replace(/\u0000/g, '\\n');

  const { text: parsedReason, invalid } = await parseSayText(normalized, (id) =>
    resolveEmoji(client, id, guild),
  );
  if (invalid.length) return 'bad-emoji';

  return {
    reason: parsedReason.trim() || 'Reason not provided.',
    imageUrl,
    sinceAt,
    tillAt,
  };
}

function buildStatusPayload(icon: string, content: string) {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`${icon} ${content}`),
  );
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] as any[] },
  };
}

async function sendSpecialAfkConfirmation({
  client,
  message,
  userId,
  guildId,
  parsed,
}: {
  client: CassieClient;
  message: any;
  userId: string;
  guildId: string | null;
  parsed: ParsedSpecialAfk;
}) {
  const sessionId = `${userId}:${Date.now()}`;
  const payload = buildAfkConfirmationPayload({
    reason: parsed.reason,
    imageUrl: parsed.imageUrl,
    sessionId,
  });
  const prompt = await message.reply({
    ...payload,
    allowedMentions: { parse: [], repliedUser: false },
  });

  const collector = prompt.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(i, userId, (cid) => cid.startsWith(`afk:${sessionId}:`)),
    time: 60_000,
    max: 1,
  });

  collector.on('collect', async (i: any) => {
    const action = i.customId.split(':').pop() as AfkScope | 'cancel';

    if (action === 'cancel') {
      await i.update(buildStatusPayload(emojis.redcross, 'AFK confirmation cancelled by the user.'))
        .catch((): null => null);
      return;
    }

    if (action === 'server' && !guildId) {
      await i.update(buildStatusPayload(emojis.redcross, 'Server AFK can only be used inside a server.'))
        .catch((): null => null);
      return;
    }

    await i.deferUpdate().catch((): null => null);

    await client.db.setAFK({
      userId,
      guildId: action === 'server' ? guildId : null,
      scope: action,
      reason: parsed.reason,
      imageUrl: parsed.imageUrl,
      sinceAt: parsed.sinceAt,
      tillAt: parsed.tillAt,
    });

    await i.editReply(
      buildStatusPayload(
        emojis.blacktick,
        action === 'server'
          ? 'Your AFK has been set for this server.'
          : 'Your AFK has been set for all mutual servers.',
      ),
    ).catch((): null => null);
  });

  collector.on('end', async (_: any, reason: string) => {
    if (reason !== 'time') return;
    await prompt.edit(buildAfkConfirmationPayload({
      reason: parsed.reason,
      imageUrl: parsed.imageUrl,
      sessionId,
      disabled: true,
      footer: '-# Confirmation timed out',
    })).catch((): null => null);
  });
}
