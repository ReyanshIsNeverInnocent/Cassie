import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { resolveEmoji } from '../../helpers/emojiResolver.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import {
  buildStealBulkPreviewPayload,
  buildStealCancelledPayload,
  buildStealDestinationPromptPayload,
  buildStealFailedPayload,
  buildStealImageTypeSelectPayload,
  buildStealTimedOutPayload,
  type StealAssetType,
  type StealBulkTarget,
} from '../../components/developer/steal.js';

export const options = {
  name:        'developer-steal',
  aliases:     ['devsteal'] as string[],
  description: 'Choose emoji or sticker, then send the destination server name or ID.',
  usage:       'developer-steal <emoji | emoji-id | emoji-name | sticker-name | sticker-id | image-url>\nAttach an image or reply to a message containing an emoji or sticker.',
  category:    'developer',
  owner:       true,
  cooldown:    0,
};

function isUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

async function resolveSticker(client: CassieClient, identifier: string): Promise<any | null> {
  const isId = /^\d{17,20}$/.test(identifier);
  const lower = identifier.toLowerCase();

  for (const guild of client.guilds.cache.values()) {
    try {
      if (isId) {
        const sticker = await guild.stickers.fetch(identifier).catch((): null => null);
        if (sticker) return sticker;
      } else {
        const stickers = await guild.stickers.fetch().catch((): null => null);
        const sticker = stickers?.find((candidate: any) => candidate.name.toLowerCase() === lower);
        if (sticker) return sticker;
      }
    } catch {
      // Continue searching other servers when one is inaccessible.
    }
  }
  return null;
}

type ResolvedTarget =
  | { kind: 'emoji'; name: string; imageUrl: string; animated: boolean; sourceGuild: string }
  | { kind: 'sticker'; name: string; imageUrl: string; tags: string; sourceGuild: string }
  | { kind: 'image'; url: string };

const CUSTOM_EMOJI_PATTERN = /<a?:[A-Za-z0-9_]+:\d+>/g;

async function resolveTarget(
  input: string,
  client: CassieClient,
  guild?: any,
): Promise<ResolvedTarget | null> {
  if (isUrl(input)) return { kind: 'image', url: input };

  const emoji = await resolveEmoji(client, input, guild);
  if (emoji) {
    const imageUrl = emoji.imageURL?.({
      size: 128,
      extension: emoji.animated ? 'gif' : 'png',
    }) ?? emoji.url;
    return {
      kind: 'emoji',
      name: emoji.name ?? 'unknown',
      imageUrl,
      animated: emoji.animated ?? false,
      sourceGuild: (emoji.guild as any)?.name ?? 'Unknown',
    };
  }

  const sticker = await resolveSticker(client, input);
  if (sticker) {
    return {
      kind: 'sticker',
      name: sticker.name,
      imageUrl: sticker.url,
      tags: sticker.tags ?? '🎨',
      sourceGuild: sticker.guild?.name ?? 'Unknown',
    };
  }

  return null;
}

async function resolveReplyTarget(message: any, client: CassieClient): Promise<ResolvedTarget | null> {
  const referenceId = message.reference?.messageId;
  if (!referenceId) return null;

  const replied = await message.channel.messages.fetch(referenceId).catch((): null => null);
  if (!replied) return null;

  const sticker = replied.stickers?.first();
  if (sticker) {
    return {
      kind: 'sticker',
      name: sticker.name,
      imageUrl: sticker.url,
      tags: sticker.tags ?? '🎨',
      sourceGuild: sticker.guild?.name ?? 'Unknown',
    };
  }

  const emojiToken = replied.content?.match(CUSTOM_EMOJI_PATTERN)?.[0];
  if (emojiToken) return resolveTarget(emojiToken, client, message.guild);

  return null;
}

async function addEmoji(guild: any, imageUrl: string, name: string): Promise<string | null> {
  try {
    await guild.emojis.create({ attachment: imageUrl, name, reason: 'steal command (developer)' });
    return null;
  } catch (error: any) {
    const message: string = error?.message ?? String(error);
    if (message.includes('Missing Permissions')) return 'Missing Manage Expressions permission';
    if (message.includes('Maximum number')) return 'Server emoji limit reached';
    if (message.includes('File cannot be larger')) return 'Image too large for emoji';
    return message.split('\n')[0]?.slice(0, 80) ?? 'Unknown error';
  }
}

async function addSticker(
  guild: any,
  imageUrl: string,
  name: string,
  tags: string,
): Promise<string | null> {
  try {
    await guild.stickers.create({
      file: imageUrl,
      name,
      tags,
      reason: 'steal command (developer)',
    });
    return null;
  } catch (error: any) {
    const message: string = error?.message ?? String(error);
    if (message.includes('Missing Permissions')) return 'Missing Manage Expressions permission';
    if (message.includes('Maximum number')) return 'Server sticker limit reached';
    if (message.includes('File cannot be larger')) return 'Image too large for sticker';
    return message.split('\n')[0]?.slice(0, 80) ?? 'Unknown error';
  }
}

function resolveDestinationGuild(client: CassieClient, input: string):
  | { guild: any; error?: never }
  | { guild?: never; error: string } {
  const value = input.trim().replace(/^(["'])(.*)\1$/, '$2').trim();
  if (!value) return { error: 'Send a server name or ID.' };

  const byId = client.guilds.cache.get(value);
  if (byId) return { guild: byId };

  const normalizedValue = value.toLowerCase();
  const exactMatch = client.guilds.cache.find(
    (guild: any) => guild.name.toLowerCase() === normalizedValue,
  );
  if (exactMatch) return { guild: exactMatch };

  const matches = client.guilds.cache.filter((guild: any) =>
    guild.name.toLowerCase().includes(normalizedValue),
  );
  if (matches.size === 1) return { guild: matches.first() };
  if (matches.size > 1) {
    return { error: 'More than one server has that name. Send the server ID instead.' };
  }
  return { error: 'I could not find a server with that name or ID that I am in.' };
}

async function waitForAuthorMessage(channel: any, authorId: string): Promise<any | null> {
  const messages = await channel.awaitMessages({
    filter: (candidate: any) => candidate.author?.id === authorId,
    max: 1,
    time: 60_000,
  });
  return messages.first() ?? null;
}

function assetName(name: string, type: StealAssetType): string {
  if (type === 'emoji') {
    const normalized = name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
    return normalized.length >= 2 ? normalized : 'stolen_emoji';
  }

  const normalized = name.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 30);
  return normalized.length >= 2 ? normalized : 'stolen sticker';
}

function logDeleteFailure(label: string, result: PromiseSettledResult<unknown>): void {
  if (result.status === 'rejected') {
    console.warn(`[developer-steal] Could not delete ${label}:`, result.reason);
  }
}

async function finishSuccess(
  message: any,
  panel: any,
  serverMessage: any,
  content: string,
): Promise<void> {
  const deletions = await Promise.allSettled([
    serverMessage.delete(),
    panel.delete(),
  ]);
  const cleanupNote = deletions.some((result) => result.status === 'rejected')
    ? '\n-# I could not delete one or more confirmation messages; check my Manage Messages permission.'
    : '';
  const successMessage = await sendSuccess(
    { channel: message.channel },
    `${content}${cleanupNote}`,
  );

  setTimeout(() => {
    const pending = [
      message.delete(),
      ...(successMessage ? [successMessage.delete()] : []),
    ];
    void Promise.allSettled(pending).then((results) => {
      results.forEach((result, index) => {
        logDeleteFailure(index === 0 ? 'the devsteal command' : 'the success message', result);
      });
    });
  }, 5_000);
}

async function chooseAssetType(
  panel: any,
  authorId: string,
  token: string,
): Promise<StealAssetType | 'cancel' | 'timeout'> {
  return new Promise((resolve, reject) => {
    const collector = panel.createMessageComponentCollector({
      filter: (candidate: any) => authorOnlyFilter(
        candidate,
        authorId,
        (customId: string) => customId.endsWith(`:${token}`),
      ),
      time: 30_000,
    });

    collector.once('collect', (interaction: any) => {
      void interaction.deferUpdate().then(() => {
        collector.stop('responded');
        if (interaction.customId === `steal:as-emoji:${token}`) resolve('emoji');
        else if (interaction.customId === `steal:as-sticker:${token}`) resolve('sticker');
        else resolve('cancel');
      }).catch((error: unknown) => {
        collector.stop('error');
        reject(error);
      });
    });
    collector.once('end', (_: any, reason: string) => {
      if (reason === 'time') resolve('timeout');
    });
  });
}

async function confirmBulkPreview(
  panel: any,
  authorId: string,
  token: string,
): Promise<'continue' | 'cancel' | 'timeout'> {
  return new Promise((resolve, reject) => {
    const collector = panel.createMessageComponentCollector({
      filter: (candidate: any) => authorOnlyFilter(
        candidate,
        authorId,
        (customId: string) => customId.endsWith(`:${token}`),
      ),
      time: 30_000,
    });

    collector.once('collect', (interaction: any) => {
      void interaction.deferUpdate().then(() => {
        collector.stop('responded');
        resolve(interaction.customId === `steal:continue:${token}` ? 'continue' : 'cancel');
      }).catch((error: unknown) => {
        collector.stop('error');
        reject(error);
      });
    });
    collector.once('end', (_: any, reason: string) => {
      if (reason === 'time') resolve('timeout');
    });
  });
}

async function requestDestination(
  message: any,
  panel: any,
  client: CassieClient,
  description: string,
  imageUrl?: string,
): Promise<{ guild: any; serverMessage: any } | null> {
  let error: string | undefined;
  let response = waitForAuthorMessage(message.channel, message.author.id);
  await panel.edit(buildStealDestinationPromptPayload({ description, imageUrl }));

  for (let attempt = 0; attempt < 3; attempt++) {
    const serverMessage = await response;
    if (!serverMessage) {
      await panel.edit(buildStealTimedOutPayload());
      return null;
    }

    const destination = resolveDestinationGuild(client, serverMessage.content ?? '');
    if (destination.guild) return { guild: destination.guild, serverMessage };

    error = destination.error;
    if (attempt < 2) {
      response = waitForAuthorMessage(message.channel, message.author.id);
    }
    await panel.edit(buildStealDestinationPromptPayload({ description, imageUrl, error }));
  }

  await panel.edit(buildStealFailedPayload(error ?? 'A valid server was not provided.'));
  return null;
}

export async function prefixExecute(
  message: any,
  args: string[],
  client: CassieClient,
): Promise<any> {
  const input = args.join(' ').trim();
  const attachment = message.attachments?.first();
  const attachmentUrl: string | null =
    attachment &&
    (attachment.contentType?.startsWith('image/')
      || /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(attachment.url))
      ? attachment.url
      : null;

  const token = `${message.id}-${Date.now()}`;
  let targets: StealBulkTarget[] = [];
  let target: ResolvedTarget | null = null;
  const tokens = args.filter(Boolean);

  if (tokens.length >= 2) {
    if (tokens.length > 50) {
      return sendError({ message }, 'Too many items. Give up to **50** emojis or stickers at once.');
    }

    for (const value of tokens) {
      const resolved = await resolveTarget(value, client, message.guild);
      if (resolved && resolved.kind !== 'image') {
        targets.push({
          kind: resolved.kind,
          name: resolved.name,
          imageUrl: resolved.imageUrl,
          animated: resolved.kind === 'emoji' ? resolved.animated : undefined,
          tags: resolved.kind === 'sticker' ? resolved.tags : undefined,
        });
      }
    }

    if (targets.length >= 2) {
      const panel = await message.channel.send(buildStealBulkPreviewPayload({ targets, token }));
      const previewResult = await confirmBulkPreview(panel, message.author.id, token);
      if (previewResult === 'cancel') {
        await panel.edit(buildStealCancelledPayload());
        return;
      }
      if (previewResult === 'timeout') {
        await panel.edit(buildStealTimedOutPayload());
        return;
      }

      const destination = await requestDestination(
        message,
        panel,
        client,
        `Save **${targets.length}** items to one server?`,
      );
      if (!destination) return;

      const added: string[] = [];
      const failed: string[] = [];
      for (const item of targets) {
        const name = assetName(item.name, item.kind);
        const error = item.kind === 'emoji'
          ? await addEmoji(destination.guild, item.imageUrl, name)
          : await addSticker(destination.guild, item.imageUrl, name, item.tags ?? '🎨');
        if (error) failed.push(`\`${item.name}\`: ${error}`);
        else added.push(`\`${name}\``);
      }

      if (!added.length) {
        await panel.edit(buildStealFailedPayload(failed.join('\n')));
        return;
      }

      const failureDetails = failed.slice(0, 8).join('\n');
      const summary =
        `Added ${added.length} item${added.length === 1 ? '' : 's'} to **${destination.guild.name}**: ${added.join(', ')}.` +
        (failed.length
          ? `\n\nCould not add:\n${failureDetails}${failed.length > 8 ? `\n…and ${failed.length - 8} more.` : ''}`
          : '');
      await finishSuccess(message, panel, destination.serverMessage, summary);
      return;
    }

    if (targets.length === 1) {
      const onlyTarget = targets[0]!;
      target = onlyTarget.kind === 'emoji'
        ? {
          kind: 'emoji',
          name: onlyTarget.name,
          imageUrl: onlyTarget.imageUrl,
          animated: onlyTarget.animated ?? false,
          sourceGuild: 'Resolved from input',
        }
        : {
          kind: 'sticker',
          name: onlyTarget.name,
          imageUrl: onlyTarget.imageUrl,
          tags: onlyTarget.tags ?? '🎨',
          sourceGuild: 'Resolved from input',
        };
    }
  }

  if (!target) {
    target = input ? await resolveTarget(input, client, message.guild) : null;
    if (!target && attachmentUrl) target = { kind: 'image', url: attachmentUrl };
    if (!target && !input && message.reference?.messageId) {
      target = await resolveReplyTarget(message, client);
    }
    if (!target) {
      return sendError(
        { message },
        input
          ? `Could not find an emoji, sticker, or valid image URL matching \`${input}\`.`
          : `Could not find an emoji or sticker in the replied-to message. Provide an emoji, sticker name/ID, image URL, or attach an image.\n-# Usage: \`${client.config.prefix}${options.usage}\``,
      );
    }
  }

  const sourceType = target.kind === 'image' ? undefined : target.kind;
  const imageUrl = target.kind === 'image' ? target.url : target.imageUrl;
  const originalName = target.kind === 'image' ? 'image' : target.name;
  const previewUrl = /\.json(?:$|[?#])/i.test(imageUrl) ? undefined : imageUrl;
  const panel = await message.channel.send(
    buildStealImageTypeSelectPayload({
      imageUrl: previewUrl,
      token,
      name: sourceType ? originalName : undefined,
      sourceType,
      sourceGuild: target.kind === 'image' ? undefined : target.sourceGuild,
    }),
  );

  const assetType = await chooseAssetType(panel, message.author.id, token);
  if (assetType === 'cancel') {
    await panel.edit(buildStealCancelledPayload());
    return;
  }
  if (assetType === 'timeout') {
    await panel.edit(buildStealTimedOutPayload());
    return;
  }
  if (assetType === 'emoji' && /\.json(?:$|[?#])/i.test(imageUrl)) {
    await panel.edit(buildStealFailedPayload('Lottie stickers can only be saved as stickers.'));
    return;
  }

  const name = assetName(originalName, assetType);
  const destination = await requestDestination(
    message,
    panel,
    client,
    `Save \`${name}\` as a **${assetType}**?`,
    previewUrl,
  );
  if (!destination) return;

  const error = assetType === 'emoji'
    ? await addEmoji(destination.guild, imageUrl, name)
    : await addSticker(
      destination.guild,
      imageUrl,
      name,
      target.kind === 'sticker' ? target.tags : '🎨',
    );

  if (error) {
    await panel.edit(buildStealFailedPayload(`Could not save \`${name}\` to **${destination.guild.name}**: ${error}`));
    return;
  }

  await finishSuccess(
    message,
    panel,
    destination.serverMessage,
    `Added \`${name}\` as a **${assetType}** to **${destination.guild.name}**.`,
  );
}
