import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { config } from '../../config.js';
import { emojis } from '../../emojis.js';
import {
  getResourceAttachment,
  getResourceAttachmentUrl,
} from '../../helpers/resourceAttachments.js';
import type { CassieClient } from '../../structures/CassieClient.js';

export const options = {
  name: 'developer-help',
  aliases: ['dev-help'],
  description: 'Show the developer commands.',
  usage: 'developer-help',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

const DEVELOPER_HELP_IMAGE = 'developer-help.jpg';
const MAX_SECTION_LENGTH = 3_500;

export async function prefixExecute(message: any, _args: string[], client: CassieClient) {
  const commands = [...client.commands.values()]
    .filter((command) => command.options?.owner === true || command.options?.isDeveloper === true)
    .sort((a, b) => (a.options?.name ?? '').localeCompare(b.options?.name ?? ''));

  const lines = commands.map((command) => {
    const name = command.options?.name ?? 'unknown';
    const description = command.options?.description?.replace(/\s+/g, ' ').trim();
    return `${emojis.redGlowPoint} **${name}:** ${description ?? 'No description'}`;
  });
  if (!lines.length) lines.push(`${emojis.redGlowPoint} No developer-only commands found.`);

  const sections: string[] = [];
  let section = '';
  for (const line of lines) {
    if (section && section.length + line.length + 1 > MAX_SECTION_LENGTH) {
      sections.push(section);
      section = '';
    }
    section += `${section ? '\n' : ''}${line}`;
  }
  if (section) sections.push(section);

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.lollipop} Developer Commands`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  const [firstSection, ...remainingSections] = sections;
  if (firstSection) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(firstSection))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(getResourceAttachmentUrl(DEVELOPER_HELP_IMAGE))),
    );
  }
  for (const commandsSection of remainingSections) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(commandsSection));
  }
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  await message.channel.send({
    components: [container],
    files: [getResourceAttachment(DEVELOPER_HELP_IMAGE)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}
