// xoxo/commands/info/developer.ts
//
// $developer — Show info about the developer behind this bot.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { config }              from '../../config.js';
import { developerPanelConfig as dev } from '../../config/developer/developerPanel.js';
import {
  getResourceAttachment,
  getResourceAttachmentUrl,
} from '../../helpers/resourceAttachments.js';

export const options = {
  name:        'developer',
  aliases:     [] as string[],
  description: 'Shows info about the developer behind this bot.',
  usage:       'developer',
  category:    'info',
  owner:       false,
  cooldown:    5,
};

function buildPayload(requestedBy: string): object {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16));

  // Optional banner image at the top
  if (dev.bannerImage) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(getResourceAttachmentUrl(dev.bannerImage)),
      ),
    );
    container.addSeparatorComponents(
      new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }),
    );
  }

  // Developer identity section with avatar thumbnail
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## $! ${dev.name}\n` +
          `-# Creator and Owner of ${config.botName} • <@${dev.userId}>\n` +
          `__**About:**__ ${dev.about}`,
        ),
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(getResourceAttachmentUrl(dev.avatarImage)),
      ),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }),
  );

  // Bot project info
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### __**${config.botName}**__\n` +
      `- **Project:** ${dev.project}\n` +
      `- **Year:** ${dev.year}\n` +
      `- **Status:** ${dev.status}\n` +
      `- **Reason:** ${dev.reason}`,
    ),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }),
  );

  // Connect buttons
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('### __**Connect**__'),
  );
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Add Friend')
        .setStyle(ButtonStyle.Link)
        .setURL(dev.addFriendUrl),
      new ButtonBuilder()
        .setLabel('Support Server')
        .setStyle(ButtonStyle.Link)
        .setURL(config.supportServer),
    ),
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# Requested by ${requestedBy} • Thank you for your support!`,
    ),
  );

  return {
    components:      [container],
    files:            [
      ...(dev.bannerImage ? [getResourceAttachment(dev.bannerImage)] : []),
      getResourceAttachment(dev.avatarImage),
    ],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export async function prefixExecute(
  message: any,
  _args:   string[],
  _client: CassieClient,
): Promise<any> {
  return message.channel.send(buildPayload(`@${message.author.username}`));
}

export async function slashExecute(
  interaction: any,
  _client:     CassieClient,
): Promise<any> {
  return interaction.reply(buildPayload(`@${interaction.user.username}`));
}
