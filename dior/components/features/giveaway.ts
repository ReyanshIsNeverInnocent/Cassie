import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  ModalBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
} from 'discord.js';
import { config } from '../../config.js';
import type { GiveawayDoc } from '../../database/database.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { emojis } from '../../emojis.js';

function container(content: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

export function buildActiveGiveawayPayload(giveaway: GiveawayDoc, entriesCount = 0, serverIconUrl?: string | null): any {
  const winnerLabel = giveaway.winners === 1 ? 'Winner' : 'Winners';
  const giveawayText = [
    `## ${emojis.redGiftBox} Prize: ${giveaway.prize}`,
    `${emojis.redDash} ${winnerLabel}: ${giveaway.winners}`,
    `${emojis.redDash} Entries: ${entriesCount}`,
    `${emojis.redDash} Ends: <t:${Math.floor(giveaway.end_at / 1000)}:R>`,
    `${emojis.redDash} Hosted by <@${giveaway.host_id}>`,
  ].join('\n');
  const textDisplay = new TextDisplayBuilder().setContent(giveawayText);
  const panel = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16));

  if (serverIconUrl) {
    panel.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(textDisplay)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(serverIconUrl)),
    );
  } else {
    panel.addTextDisplayComponents(textDisplay);
  }

  panel.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`gway:enter:${giveaway.id}`)
        .setLabel('Enter Giveaway')
        .setStyle(ButtonStyle.Primary),
    ),
  ).addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  return {
    components: [panel],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export function buildGiveawayListPayload(giveaways: Array<Pick<GiveawayDoc, 'id' | 'prize' | 'host_id' | 'end_at'>>, limit = 10): any {
  const visibleGiveaways = giveaways.slice(0, limit);
  const listText = visibleGiveaways.length
    ? visibleGiveaways.map((giveaway, index) => `${index + 1}) **${giveaway.prize}** by <@${giveaway.host_id}> ending in <t:${Math.floor(giveaway.end_at / 1000)}:R>`).join('\n')
    : 'No active giveaways right now.';

  const panel = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${emojis.redGiftBox} Active Giveaways`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(listText));

  return {
    components: [panel],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export function buildGiveawayParticipantsPayload(
  giveaway: Pick<GiveawayDoc, 'id' | 'prize' | 'host_id' | 'end_at'>,
  userIds: string[],
  page = 0,
  pageSize = 15,
): any {
  const totalPages = Math.max(1, Math.ceil(userIds.length / pageSize));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const startIndex = safePage * pageSize;
  const visibleUsers = userIds.slice(startIndex, startIndex + pageSize);
  const lines = visibleUsers.length
    ? visibleUsers.map((id, offset) => `**${startIndex + offset + 1}.** <@${id}>`).join('\n')
    : 'No one has entered this giveaway yet.';

  const panel = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `## ${emojis.redGiftBox} Giveaway Participants`,
      `**Prize:** ${giveaway.prize}`,
      `Page ${safePage + 1}/${totalPages}`,
      '',
      lines,
    ].join('\n')));

  panel.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`gway:participants-prev:${giveaway.id}:${safePage}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage === 0),
      new ButtonBuilder()
        .setCustomId(`gway:participants-next:${giveaway.id}:${safePage}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages - 1),
    ),
  );

  return {
    components: [panel],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export function buildEndedGiveawayPayload(giveaway: GiveawayDoc, _entries: number, serverIconUrl?: string | null): any {
  const winners = giveaway.winner_ids ?? [];
  const pickedLine = winners.length
    ? `Picked: ${winners.slice(0, 3).map((id) => `<@${id}>`).join(' ')}${winners.length > 3 ? ' …' : ''}`
    : 'Picked: No valid entries';
  const textDisplay = new TextDisplayBuilder().setContent([
    `## ${emojis.redGiftBox} Prize: ${giveaway.prize}`,
    `${emojis.redDash} ${pickedLine}`,
    `${emojis.redDash} Ended: <t:${Math.floor((giveaway.ended_at ?? Date.now()) / 1000)}:R>`,
    `${emojis.redDash} Hosted by <@${giveaway.host_id}>`,
  ].join('\n'));
  const panel = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16));

  if (serverIconUrl) {
    panel.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(textDisplay)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(serverIconUrl)),
    );
  } else {
    panel.addTextDisplayComponents(textDisplay);
  }

  panel
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`gway:ended:${giveaway.id}`)
          .setLabel('Giveaway Ended')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  return {
    components: [panel],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

const GIVEAWAY_EDIT_PROMPT_TTL_MS = 5 * 60_000;

export function buildGiveawayEditPrompt(giveaway: GiveawayDoc, expiresAt: number, disabled = false): any {
  const winnerLabel = giveaway.winners === 1 ? 'Winner' : 'Winners';
  const panel = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '## Edit Giveaway',
      `Prize: ${giveaway.prize}`,
      `${winnerLabel}: ${giveaway.winners}`,
      `Ends <t:${Math.floor(giveaway.end_at / 1000)}:R>`,
    ].join('\n')))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`gway:edit:${giveaway.id}:${expiresAt}`)
          .setLabel('Edit Giveaway')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
      ),
    );

  return {
    components: [panel],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export function scheduleGiveawayEditPromptExpiry(message: any, giveaway: GiveawayDoc, expiresAt: number): void {
  const timer = setTimeout(() => {
    void message.edit(buildGiveawayEditPrompt(giveaway, expiresAt, true)).catch((): null => null);
  }, Math.max(0, expiresAt - Date.now()));
  timer.unref?.();
}

function buildGiveawayEditModal(giveaway: GiveawayDoc, expiresAt: number): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`gway:edit-modal:${giveaway.id}:${expiresAt}`)
    .setTitle('Edit Giveaway')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('prize')
          .setLabel('Prize')
          .setStyle(TextInputStyle.Short)
          .setValue(giveaway.prize.slice(0, 256))
          .setMaxLength(256)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('winners')
          .setLabel('Number of Winners')
          .setStyle(TextInputStyle.Short)
          .setValue(String(giveaway.winners))
          .setMaxLength(2)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('extra-time')
          .setLabel('Add Extra Time (e.g. 10m, 1h)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Leave blank to keep current end time')
          .setRequired(false),
      ),
    );
}

export function buildWinnerAnnouncement(
  giveaway: GiveawayDoc,
  winnerIds: string[],
  messageUrl?: string,
  rerolled = false,
): any {
  const announcement = container(
    winnerIds.length
      ? `${emojis.animatedConfetti} ${rerolled ? 'Rerolled: ' : ''}Congratulations ${winnerIds.map((id) => `<@${id}>`).join(', ')}! You won **${giveaway.prize}**. Hosted by <@${giveaway.host_id}>.`
      : `${emojis.penguinFacepalm} **${giveaway.prize}** has ended, but there were no valid entries.`,
  );

  if (messageUrl) {
    announcement.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('Giveaway Link').setStyle(ButtonStyle.Link).setURL(messageUrl),
      ),
    );
  }

  return {
    components: [announcement],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { users: winnerIds },
  };
}

export async function handleGiveawayInteraction(interaction: any, client: CassieClient): Promise<void> {
  const [, action, giveawayId, expiresAtRaw] = String(interaction.customId).split(':');
  if (!giveawayId || !client.db) {
    await interaction.reply({ content: 'This giveaway is unavailable right now.', flags: MessageFlags.Ephemeral }).catch((): null => null);
    return;
  }

  const giveaway = await client.db.getGiveaway(giveawayId).catch((): null => null);
  if (!giveaway || giveaway.guild_id !== interaction.guildId) {
    await interaction.reply({ content: 'This giveaway could not be found.', flags: MessageFlags.Ephemeral }).catch((): null => null);
    return;
  }

  if (action === 'participants' || action === 'entries' || action === 'participants-prev' || action === 'participants-next' || action === 'entries-prev' || action === 'entries-next') {
    const pageArg = Number(expiresAtRaw ?? '0');
    const direction = action.endsWith('prev') ? -1 : action.endsWith('next') ? 1 : 0;
    const targetPage = Number.isFinite(pageArg) ? pageArg + direction : 0;
    const giveaway = await client.db.getGiveaway(giveawayId).catch((): null => null);
    if (!giveaway) {
      await interaction.reply({ content: 'This giveaway could not be found.', flags: MessageFlags.Ephemeral }).catch((): null => null);
      return;
    }

    const entries = await client.db.listGiveawayEntries(giveaway.id).catch((): any[] => []);
    const payload = buildGiveawayParticipantsPayload(giveaway, entries.map((entry) => entry.user_id), Math.max(0, targetPage), 15);
    await interaction.update(payload).catch(async () => {
      await interaction.reply(payload).catch((): null => null);
    });
    return;
  }

  if (action === 'edit') {
    const expiresAt = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      await interaction.reply({ content: 'This edit prompt has expired. Run the giveaway edit command again.', flags: MessageFlags.Ephemeral }).catch((): null => null);
      return;
    }
    if (!interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: 'You need the **Manage Server** permission to edit giveaways.', flags: MessageFlags.Ephemeral }).catch((): null => null);
      return;
    }
    if (giveaway.status !== 'active' || giveaway.end_at <= Date.now()) {
      await interaction.reply({ content: 'Only an ongoing giveaway can be edited.', flags: MessageFlags.Ephemeral }).catch((): null => null);
      return;
    }
    await interaction.showModal(buildGiveawayEditModal(giveaway, expiresAt));
    return;
  }

  if (action === 'edit-modal') {
    const expiresAt = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      await interaction.reply({ content: 'This edit form has expired. Run the giveaway edit command again.', flags: MessageFlags.Ephemeral }).catch((): null => null);
      return;
    }
    if (!interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: 'You need the **Manage Server** permission to edit giveaways.', flags: MessageFlags.Ephemeral }).catch((): null => null);
      return;
    }
    if (giveaway.status !== 'active' || giveaway.end_at <= Date.now()) {
      await interaction.reply({ content: 'Only an ongoing giveaway can be edited.', flags: MessageFlags.Ephemeral }).catch((): null => null);
      return;
    }

    const prize = interaction.fields.getTextInputValue('prize').trim();
    const winnerCount = Number(interaction.fields.getTextInputValue('winners').trim());
    const extraTimeInput = interaction.fields.getTextInputValue('extra-time').trim();
    if (!prize || prize.length > 256) {
      await interaction.reply({ content: 'Prize must be between 1 and 256 characters.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > 20) {
      await interaction.reply({ content: 'Winner count must be a whole number from 1 to 20.', flags: MessageFlags.Ephemeral });
      return;
    }

    let endAt = giveaway.end_at;
    if (extraTimeInput) {
      const match = extraTimeInput.match(/^(\d+)(s|m|h|d)$/i);
      if (!match) {
        await interaction.reply({ content: 'Extra time must use a format such as `10m`, `1h`, or `2d`.', flags: MessageFlags.Ephemeral });
        return;
      }
      const multipliers: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
      const extraMs = Number(match[1]) * multipliers[match[2].toLowerCase()];
      if (!Number.isSafeInteger(extraMs) || extraMs <= 0 || extraMs > 365 * 24 * 60 * 60 * 1000) {
        await interaction.reply({ content: 'Extra time must be greater than zero and no more than 365 days.', flags: MessageFlags.Ephemeral });
        return;
      }
      endAt += extraMs;
    }

    const updated = { ...giveaway, prize, winners: winnerCount, end_at: endAt };
    await client.db.updateGiveaway(giveaway.id, { prize, winners: winnerCount, end_at: endAt });
    const channel: any = client.channels.cache.get(giveaway.channel_id)
      ?? await client.channels.fetch(giveaway.channel_id).catch((): null => null);
    const message = await channel?.messages?.fetch(giveaway.message_id).catch((): null => null);
    const entries = await client.db.listGiveawayEntries(giveaway.id).catch((): any[] => []);
    if (message) {
      const guild: any = interaction.guild;
      await message.edit(buildActiveGiveawayPayload(updated, entries.length, guild?.iconURL({ size: 256, extension: 'png' }) ?? null));
    }
    await interaction.reply({ content: 'Giveaway updated.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (action === 'enter') {
    if (giveaway.status !== 'active' || giveaway.end_at <= Date.now()) {
      await interaction.reply({ content: 'This giveaway has ended.', flags: MessageFlags.Ephemeral }).catch((): null => null);
      return;
    }

    try {
      await client.db.createGiveawayEntry({
        _id: `${giveaway.id}:${interaction.user.id}`,
        giveaway_id: giveaway.id,
        user_id: interaction.user.id,
        created_at: Date.now(),
      });
      await interaction.reply({ content: `You entered **${giveaway.prize}**. Good luck!`, flags: MessageFlags.Ephemeral });
    } catch {
      const entries = await client.db.listGiveawayEntries(giveaway.id).catch((): any[] => []);
      const alreadyEntered = entries.some((entry) => entry.user_id === interaction.user.id);
      await interaction.reply({
        content: alreadyEntered ? 'You have already entered this giveaway.' : 'Could not save your entry. Please try again.',
        flags: MessageFlags.Ephemeral,
      }).catch((): null => null);
    }
    return;
  }

  if (action === 'participants') {
    const entries = await client.db.listGiveawayEntries(giveaway.id).catch((): any[] => []);
    const shown = entries.slice(0, 40);
    const lines = shown.length
      ? shown.map((entry, index) => `**${index + 1}.** <@${entry.user_id}>`).join('\n')
      : 'No one has entered yet.';
    const more = entries.length > shown.length ? `\n…and ${entries.length - shown.length} more.` : '';
    const panel = container(`## Giveaway Participants (${entries.length})\n${lines}${more}`);
    await interaction.reply({
      components: [panel],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    }).catch((): null => null);
    return;
  }

  await interaction.reply({ content: 'Unknown giveaway action.', flags: MessageFlags.Ephemeral }).catch((): null => null);
}