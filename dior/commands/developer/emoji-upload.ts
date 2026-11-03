import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { config } from '../../config.js';
import { sendError } from '../../components/statusMessages.js';
import {
  getResourceAttachment,
  getResourceAttachmentUrl,
} from '../../helpers/resourceAttachments.js';

export const options = {
  name: 'emoji-upload',
  aliases: ['emu'] as string[],
  description: 'Upload an attached image to one of the emoji servers (developer only).',
  usage: 'emoji-upload <image attachment>',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'jfif', 'png', 'gif', 'webp', 'avif']);
const EMOJI_SERVER_THUMBNAIL = 'emoji-upload.png';
const PROMPT_TIMEOUT = 5 * 60_000;

export const emojiUploadSessions = new Map<string, string>();

function getExtension(name: string): string {
  return name.toLowerCase().split('.').pop() ?? '';
}

function emojiLimit(guild: any): number {
  const tier = String(guild.premiumTier ?? '').toLowerCase();
  if (tier.includes('tier_3') || tier.includes('tier 3')) return 250;
  if (tier.includes('tier_2') || tier.includes('tier 2')) return 150;
  if (tier.includes('tier_1') || tier.includes('tier 1')) return 100;
  return 50;
}

async function getServerDetails(guild: any): Promise<{ guild: any; staticSlots: number; animatedSlots: number }> {
  await guild.emojis.fetch().catch(() => {});
  const staticCount = guild.emojis.cache.filter((emoji: any) => !emoji.animated).size;
  const animatedCount = guild.emojis.cache.filter((emoji: any) => emoji.animated).size;
  const limit = emojiLimit(guild);

  return {
    guild,
    staticSlots: Math.max(0, limit - staticCount),
    animatedSlots: Math.max(0, limit - animatedCount),
  };
}

function promptPayload(content: string): any {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function serverListPayload(servers: { guild: any; staticSlots: number; animatedSlots: number }[]): any {
  const lines = servers.map((server, index) =>
    `${index + 1}. **${server.guild.name}** (Free slots: **${server.staticSlots}** static, **${server.animatedSlots}** animated)`,
  );
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Emoji servers'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(getResourceAttachmentUrl(EMOJI_SERVER_THUMBNAIL))),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Enter the server number.'));

  return {
    components: [container],
    files: [getResourceAttachment(EMOJI_SERVER_THUMBNAIL)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

async function collectMessage(channel: any, authorId: string): Promise<any | null> {
  try {
    const collected = await channel.awaitMessages({
      filter: (candidate: any) => candidate.author?.id === authorId,
      max: 1,
      time: PROMPT_TIMEOUT,
      errors: ['time'],
    });
    return collected.first() ?? null;
  } catch {
    return null;
  }
}

function successPayload(emoji: any, name: string): any {
  const markdown = emoji.animated
    ? `<a:${name}:${emoji.id}>`
    : `<:${name}:${emoji.id}>`;
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Emoji uploaded ${emoji}\nMarkdown: \`${markdown}\``),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export async function prefixExecute(message: any, _args: string[], client: CassieClient): Promise<any> {
  const attachment = message.attachments?.first?.();
  if (!attachment) {
    return sendError({ message }, 'Please attach an emoji image.');
  }

  const extension = getExtension(attachment.name ?? '');
  if (!IMAGE_EXTENSIONS.has(extension)) {
    return sendError(
      { message },
      'Supported emoji files: `.jpg`, `.jpeg`, `.jfif`, `.png`, `.gif`, `.webp`, `.avif`.',
    );
  }

  if (config.emojiServerIds.some((id) => !id)) {
    return sendError({ message }, 'Emoji server IDs are not configured.');
  }

  const sessionKey = `${message.author.id}:${message.channel.id}`;
  emojiUploadSessions.set(sessionKey, message.channel.id);

  try {
    const servers: { guild: any; staticSlots: number; animatedSlots: number }[] = [];
    for (const id of config.emojiServerIds) {
      const guild = client.guilds.cache.get(id) ?? await client.guilds.fetch(id).catch((): null => null);
      if (!guild) return sendError({ message }, `I could not access configured emoji server **${id}**.`);
      servers.push(await getServerDetails(guild));
    }

    const initialMessage = await message.channel.send(serverListPayload(servers)).catch((): null => null);
    if (!initialMessage) return sendError({ message }, 'Failed to send the emoji server list.');

    const serverReply = await collectMessage(message.channel, message.author.id);
    if (!serverReply) {
    await initialMessage.edit(promptPayload('Timed out waiting for a server number. Upload cancelled.')).catch(() => {});
    return;
    }
    const serverNumber = Number(serverReply.content?.trim());
    if (!Number.isInteger(serverNumber) || serverNumber < 1 || serverNumber > servers.length) {
    return sendError({ channel: message.channel }, 'Invalid server number. Upload cancelled.');
    }

    const selected = servers[serverNumber - 1]!;
    const isAnimated = extension === 'gif' || attachment.contentType === 'image/gif';
    const availableSlots = isAnimated ? selected.animatedSlots : selected.staticSlots;
    if (availableSlots < 1) {
    return sendError({ channel: message.channel }, `**${selected.guild.name}** has no free ${isAnimated ? 'animated' : 'static'} emoji slots.`);
    }

    const namePrompt = await message.channel.send(
    promptPayload('What should the emoji be named? Reply with 2-32 letters, numbers, or underscores.'),
  ).catch((): null => null);
    if (!namePrompt) return sendError({ channel: message.channel }, 'Failed to send the name prompt.');

    const nameReply = await collectMessage(message.channel, message.author.id);
    if (!nameReply) {
    await namePrompt.edit(promptPayload('Timed out waiting for an emoji name. Upload cancelled.')).catch(() => {});
    return;
    }
    const name = nameReply.content?.trim() ?? '';
    if (!/^[A-Za-z0-9_]{2,32}$/.test(name)) {
    return sendError({ channel: message.channel }, 'Invalid emoji name. Use 2-32 letters, numbers, or underscores.');
    }

    try {
      const emoji = await selected.guild.emojis.create({
        attachment: attachment.url,
        name,
        reason: 'emoji-upload command (developer)',
      });
      await message.channel.send(successPayload(emoji, name));
    } catch (error: any) {
      const detail = error?.message?.split('\n')[0]?.slice(0, 120) ?? 'Unknown Discord error';
      await message.channel.send(promptPayload(`Emoji upload failed: ${detail}`)).catch(() => {});
    }
  } finally {
    emojiUploadSessions.delete(sessionKey);
  }
}
