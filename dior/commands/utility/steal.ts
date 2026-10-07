import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { sendWrongUsage } from '../../components/wrongUsage.js';
import { resolveEmoji } from '../../helpers/emojiResolver.js';

export const options = {
  name: 'steal',
  aliases: [] as string[],
  description: 'Copy custom emojis into this server.',
  usage: 'steal <emoji | emoji ID | emoji markdown | emoji name> <emoji> <emoji> ...\nAttach image files or reply to a message containing emojis/files',
  category: 'utility',
  owner: false,
  userPerms: ['ManageGuildExpressions'] as string[],
  cooldown: 3,
};

const CUSTOM_EMOJI_PATTERN = /<a?:([A-Za-z0-9_]+):(\d+)>/g;
const CUSTOM_EMOJI_TOKEN_PATTERN = /^<(a?):([A-Za-z0-9_]+):(\d+)>$/;
const EMOJI_NAME_PATTERN = /^[A-Za-z0-9_]{2,32}$/;
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'jfif', 'png', 'gif', 'webp', 'avif']);

interface StealSource {
  identifier?: string;
  attachment?: any;
  imageUrl?: string;
}

type StealMode = 'emoji' | 'sticker';

function canManageExpressions(member: any): boolean {
  const permissions = member?.permissions;
  return Boolean(
    permissions?.has?.(PermissionFlagsBits.Administrator)
      || permissions?.has?.(PermissionFlagsBits.ManageGuildExpressions)
      || permissions?.has?.(PermissionFlagsBits.ManageEmojisAndStickers),
  );
}

function emojiUrl(emoji: any): string {
  return emoji.imageURL?.({ extension: emoji.animated ? 'gif' : 'png' })
    ?? `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}`;
}

function originalImageUrl(value: string): string {
  try {
    const url = new URL(value);
    url.searchParams.delete('size');
    url.searchParams.delete('width');
    url.searchParams.delete('height');
    return url.toString();
  } catch {
    return value;
  }
}

async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(originalImageUrl(url), {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Image request failed with status ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

async function stickerBuffer(image: Buffer): Promise<Buffer> {
  const loaded = await loadImage(image);
  const scale = Math.min(1, 320 / Math.max(loaded.width, loaded.height));
  const width = Math.max(1, Math.round(loaded.width * scale));
  const height = Math.max(1, Math.round(loaded.height * scale));
  const canvas = createCanvas(width, height);
  canvas.getContext('2d').drawImage(loaded as any, 0, 0, width, height);
  return canvas.toBuffer('image/png') as unknown as Buffer;
}

function sourceIdentifiers(content: string): string[] {
  return content
    .split(/\s+/)
    .filter((token) => CUSTOM_EMOJI_TOKEN_PATTERN.test(token) || isImageUrl(token));
}

function imageAttachments(attachments: any): any[] {
  return [...(attachments?.values?.() ?? [])].filter((attachment: any) => {
    const extension = String(attachment.name ?? '').toLowerCase().split('.').pop();
    return attachment.contentType?.startsWith('image/') || IMAGE_EXTENSIONS.has(extension);
  });
}


function isImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const extension = url.pathname.toLowerCase().split('.').pop() ?? '';
    return IMAGE_EXTENSIONS.has(extension);
  } catch {
    return false;
  }
}

function sourceFromToken(identifier: string): StealSource {
  return isImageUrl(identifier) ? { imageUrl: identifier } : { identifier };
}

async function getSources(message: any, args: string[]): Promise<StealSource[] | null> {
  const input = message.commandRawArgs?.trim() || args.join(' ').trim();
  const sources: StealSource[] = input
    ? input.split(/\s+/).map((identifier: string) => sourceFromToken(identifier))
    : [];

  if (!input && message.reference?.messageId) {
    const replied = await message.channel.messages
      .fetch(message.reference.messageId)
      .catch((): null => null);
    if (!replied) return [];
    sources.push(...sourceIdentifiers(replied.content ?? '').map((identifier) => sourceFromToken(identifier)));
    sources.push(...imageAttachments(replied.attachments).map((attachment) => ({ attachment })));
  }

  sources.push(...imageAttachments(message.attachments).map((attachment) => ({ attachment })));
  return sources.length ? sources : null;
}

function randomFallbackName(usedNames: Set<string>): string {
  let name = '';
  do {
    name = `stolenemoji_${10000 + Math.floor(Math.random() * 90000)}`;
  } while (usedNames.has(name));
  usedNames.add(name);
  return name;
}

async function sourcePreviewUrl(source: StealSource, client: CassieClient, guild: any): Promise<string | null> {
  if (source.attachment?.url) return source.attachment.url;
  if (source.imageUrl) return originalImageUrl(source.imageUrl);

  const identifier = source.identifier ?? '';
  const markdownMatch = identifier.match(CUSTOM_EMOJI_TOKEN_PATTERN);
  const emoji = await resolveEmoji(client, identifier, guild);
  if (emoji && typeof emoji === 'object' && emoji.id) return originalImageUrl(emojiUrl(emoji));
  if (markdownMatch) {
    return `https://cdn.discordapp.com/emojis/${markdownMatch[3]}.${markdownMatch[1] ? 'gif' : 'png'}`;
  }
  return null;
}

function modePromptPayload(messageId: string, previewUrls: string[], content: string, buttons = true): any {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

  if (previewUrls.length) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        ...previewUrls.slice(0, 10).map((url) => new MediaGalleryItemBuilder().setURL(url)),
      ),
    );
  }

  if (buttons) {
    container.addSeparatorComponents(new SeparatorBuilder({ divider: true }))
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`steal:emoji:${messageId}`)
            .setLabel('Emoji')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`steal:sticker:${messageId}`)
            .setLabel('Sticker')
            .setStyle(ButtonStyle.Secondary),
        ),
      );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

async function chooseMode(message: any, sources: StealSource[], client: CassieClient): Promise<StealMode | null> {
  const previewUrls = (await Promise.all(
    sources.map((source) => sourcePreviewUrl(source, client, message.guild)),
  )).filter((url): url is string => Boolean(url));
  const prompt = await message.channel
    .send(modePromptPayload(message.id, previewUrls, 'What should I steal these as?'))
    .catch((): null => null);
  if (!prompt) return null;

  let interaction: any;
  try {
    interaction = await prompt.awaitMessageComponent({
      filter: (candidate: any) => candidate.user?.id === message.author.id,
      time: 30_000,
    });
  } catch {
    await prompt.edit(modePromptPayload(message.id, previewUrls, 'Steal cancelled: no choice was made in time.', false)).catch(() => {});
    return null;
  }

  const mode: StealMode = interaction.customId.includes(':sticker:') ? 'sticker' : 'emoji';
  await interaction.deferUpdate();
  await prompt.delete();
  return mode;
}

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  if (!message.guild) return sendError({ message }, 'This command can only be used in a server.');

  if (!canManageExpressions(message.member)) {
    return sendError(
      { message },
      'You need **Manage Expressions** or **Administrator** permission to use this command.',
    );
  }

  const botMember = message.guild.members.me
    ?? await message.guild.members.fetchMe().catch((): null => null);
  if (!canManageExpressions(botMember)) {
    return sendError(
      { message },
      'I need **Manage Expressions** permission to add emojis to this server.',
    );
  }

  const sources = await getSources(message, args);
  if (sources === null) return sendWrongUsage({ message, client }, options.name, options.usage);
  const mode = await chooseMode(message, sources, client);
  if (!mode) return;

  const stolen: any[] = [];
  const invalid: string[] = [];
  const failed: string[] = [];
  const usedNames = new Set<string>();

  for (const source of sources) {
    let attachment: Buffer | null = null;
    let name: string;
    let label: string;

    if (source.attachment || source.imageUrl) {
      const sourceUrl = source.attachment?.url ?? source.imageUrl!;
      attachment = await downloadImage(sourceUrl).catch((): null => null);
      if (!attachment) {
        failed.push(source.attachment?.name ?? sourceUrl);
        continue;
      }
      name = randomFallbackName(usedNames);
      label = source.attachment?.name ?? sourceUrl;
    } else {
      const identifier = source.identifier!;
      const markdownMatch = identifier.match(CUSTOM_EMOJI_TOKEN_PATTERN);
      const resolvedEmoji = await resolveEmoji(client, identifier, message.guild);
      // Replied markdown can be copied directly even when its source server is not mutual.
      const emoji = resolvedEmoji ?? (markdownMatch
        ? {
            animated: Boolean(markdownMatch[1]),
            name: markdownMatch[2],
            id: markdownMatch[3],
          }
        : null);
      if (!emoji || typeof emoji !== 'object' || !emoji.id) {
        invalid.push(identifier);
        continue;
      }

      attachment = await downloadImage(emojiUrl(emoji)).catch((): null => null);
      if (!attachment) {
        failed.push(identifier);
        continue;
      }
      name = resolvedEmoji && EMOJI_NAME_PATTERN.test(resolvedEmoji.name ?? '')
        ? resolvedEmoji.name
        : randomFallbackName(usedNames);
      label = identifier;
    }

    try {
      const uploadData = mode === 'sticker' ? await stickerBuffer(attachment) : attachment;
      const created = mode === 'emoji'
        ? await message.guild.emojis.create({
            attachment: uploadData,
            name,
            reason: `Emoji stolen by ${message.author.tag}.`,
          })
        : await message.guild.stickers.create({
          file: uploadData,
            name: name.slice(0, 30),
            tags: name.slice(0, 32),
            reason: `Sticker stolen by ${message.author.tag}.`,
          });
      stolen.push(created);
    } catch {
      failed.push(label);
    }
  }

  if (!stolen.length) {
    if (invalid.length && !failed.length) return sendError({ message }, 'None of the provided emojis were valid custom emojis.');
    return sendError({ message }, 'I could not steal any of those emojis. Check the emoji limit and my permissions.');
  }

  const result = await sendSuccess(
    { message },
    `Successfully stole ${stolen.length} ${mode}${stolen.length === 1 ? '' : 's'}.`,
  );
  const problems = [...invalid, ...failed];
  if (problems.length) {
    await sendError(
      { channel: message.channel },
      `Could not steal: ${problems.map((identifier) => `\`${identifier}\``).join(', ')}`,
    );
  }
  return result;
}
