import { config } from '../../config.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';

export type StealAssetType = 'emoji' | 'sticker';

export type StealBulkTarget = {
  kind: 'emoji' | 'sticker';
  name: string;
  imageUrl: string;
  animated?: boolean;
  tags?: string;
};

function wrap(container: ContainerBuilder): any {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function gallery(imageUrl: string) {
  return new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder().setURL(imageUrl),
  );
}

function container(): ContainerBuilder {
  return new ContainerBuilder().setAccentColor(
    parseInt(config.defaultAccentColor.replace('#', ''), 16),
  );
}

export function buildStealImageTypeSelectPayload(opts: {
  imageUrl?: string;
  token: string;
  name?: string;
  sourceType?: StealAssetType;
  sourceGuild?: string;
}): any {
  const { imageUrl, token, name, sourceType, sourceGuild } = opts;
  const sourceLabel = sourceType ?? 'image';
  const title = sourceType
    ? sourceType[0]!.toUpperCase() + sourceType.slice(1)
    : 'Image URL';

  const panel = container()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Steal — ${title}`),
    );

  if (imageUrl) panel.addMediaGalleryComponents(gallery(imageUrl));

  panel
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Save this ${sourceLabel} as an **emoji** or a **sticker**?` +
        (name ? `\n**Name:** \`${name}\`` : '') +
        (sourceGuild ? `\n**From:** ${sourceGuild}` : ''),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`steal:as-emoji:${token}`)
          .setLabel('Emoji')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`steal:as-sticker:${token}`)
          .setLabel('Sticker')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`steal:cancel:${token}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger),
      ),
    );

  return wrap(panel);
}

export function buildStealDestinationPromptPayload(opts: {
  description: string;
  imageUrl?: string;
  error?: string;
}): any {
  const panel = container().addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## Steal — Choose Server'),
  );

  if (opts.imageUrl) panel.addMediaGalleryComponents(gallery(opts.imageUrl));

  panel
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${opts.description}\n\nSend the server name or ID in your next message.` +
        (opts.error ? `\n\n${opts.error}` : ''),
      ),
    );

  return wrap(panel);
}

export function buildStealFailedPayload(error: string): any {
  return wrap(
    container().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Steal Failed\n${error}`),
    ),
  );
}

export function buildStealBulkPreviewPayload(opts: {
  targets: StealBulkTarget[];
  token: string;
}): any {
  const { targets, token } = opts;
  const emojiCount = targets.filter((target) => target.kind === 'emoji').length;
  const stickerCount = targets.filter((target) => target.kind === 'sticker').length;
  const parts: string[] = [];

  if (emojiCount) parts.push(`${emojiCount} emoji${emojiCount !== 1 ? 's' : ''}`);
  if (stickerCount) parts.push(`${stickerCount} sticker${stickerCount !== 1 ? 's' : ''}`);

  const lines = targets.map((target) => `- \`${target.name}\` (${target.kind})`);
  const panel = container()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Steal — ${parts.join(' + ')}`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `All items will be added using their **original names**.\n\n${lines.join('\n')}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`steal:continue:${token}`)
          .setLabel('Continue')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`steal:cancel:${token}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger),
      ),
    );

  return wrap(panel);
}

export function buildStealCancelledPayload(): any {
  return wrap(
    container().addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Steal cancelled.'),
    ),
  );
}

export function buildStealTimedOutPayload(): any {
  return wrap(
    container().addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Steal timed out — no response received.'),
    ),
  );
}
