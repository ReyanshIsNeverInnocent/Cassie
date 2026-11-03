// xoxo/components/voiceMaster.ts
//
// VoiceMaster's persistent Components V2 panel and its button/modal handlers.
// The panel keeps the explanatory details separate from the controls so the
// layout stays readable in Discord's Components V2 renderer.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
  UserSelectMenuBuilder,
} from "discord.js";
import config from "../../config.js";
import { descriptions } from "../../config/descriptions.js";
import { emojis } from "../../emojis.js";
import { parseSayText } from "../../helpers/emojiParser.js";
import { resolveEmoji } from "../../helpers/emojiResolver.js";
import type { CassieClient } from "../../structures/CassieClient.js";
import type {
  VoiceMasterChannelDoc,
  VoiceMasterSetupDoc,
} from "../../database/database.js";
import { refreshVoiceMasterPanel } from "../../helpers/voiceMaster.js";
import {
  getResourceAttachment,
  getResourceAttachmentUrl,
} from "../../helpers/resourceAttachments.js";

function panelButton(emoji: string, action: string): ButtonBuilder {
  return new ButtonBuilder()
    .setEmoji(emoji)
    .setStyle(ButtonStyle.Secondary)
    .setCustomId(`voicemaster:${action}`);
}

export function buildVoiceMasterPanelPayload(
  client: CassieClient,
  guild: any,
  state?: { locked?: boolean; hidden?: boolean },
): any {
  const avatarUrl =
    guild.members.me?.displayAvatarURL?.({ extension: "png", size: 128 }) ??
    client.user?.displayAvatarURL?.({ extension: "png", size: 128 });

  const isLocked = !!state?.locked;
  const isHidden = !!state?.hidden;
  const accentColor = parseInt(config.defaultAccentColor.replace("#", ""), 16);

  const voicemasterImage = config.voicemasterImage?.trim();
  const description = descriptions.voicemaster.description;

  const detailsSection = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# ${emojis.voiceMaster} Voicemaster\n${description}`,
    ),
  );
  if (avatarUrl)
    detailsSection.setThumbnailAccessory(
      new ThumbnailBuilder().setURL(avatarUrl),
    );

  const container = new ContainerBuilder()
    .setAccentColor(accentColor);

  if (voicemasterImage) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(getResourceAttachmentUrl(voicemasterImage)),
      ),
    );
  }

  container
    .addSectionComponents(detailsSection)
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        panelButton(isLocked ? emojis.voiceMasterUnlock : emojis.voiceMasterLock, isLocked ? "unlock" : "lock"),
        panelButton(isHidden ? emojis.voiceMasterUnghost : emojis.voiceMasterGhost, isHidden ? "unghost" : "ghost"),
        panelButton(emojis.voiceMasterLimit, "limit"),
        panelButton(emojis.voiceMasterBitrate, "bitrate"),
        panelButton(emojis.voiceMasterStatus, "status"),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        panelButton(emojis.voiceMasterActivity, "activity"),
        panelButton(emojis.voiceMasterPermit, "permit"),
        panelButton(emojis.voiceMasterInvite, "invite"),
        panelButton(emojis.voiceMasterKick, "kick"),
        panelButton(emojis.voiceMasterClaim, "claim"),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        panelButton(emojis.voiceMasterTransfer, "owner"),
        panelButton(emojis.voiceMasterInfo, "info"),
        panelButton(emojis.voiceMasterLogs, "logs"),
        panelButton(emojis.voiceMasterRename, "rename"),
        panelButton(emojis.voiceMasterDelete, "delete"),
      ),
    );

  return {
    components: [container],
    files: voicemasterImage ? [getResourceAttachment(voicemasterImage)] : [],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export function buildVoiceMasterRenameModal(channel: any): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("voicemaster:rename-modal")
    .setTitle("Rename your voice channel")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("name")
          .setLabel("Channel name")
          .setStyle(TextInputStyle.Short)
          .setValue(channel.name.slice(0, 100))
          .setMaxLength(100)
          .setRequired(true),
      ),
    );
}

export function buildVoiceMasterLimitModal(channel: any): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("voicemaster:limit-modal")
    .setTitle("Set member limit")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("limit")
          .setLabel("Limit (0 means unlimited)")
          .setStyle(TextInputStyle.Short)
          .setValue(String(channel.userLimit ?? 0))
          .setMaxLength(2)
          .setRequired(true),
      ),
    );
}

export function buildVoiceMasterBitrateModal(channel: any): ModalBuilder {
  const current = channel.bitrate ? Math.round(channel.bitrate / 1000) : 64;
  return new ModalBuilder()
    .setCustomId("voicemaster:bitrate-modal")
    .setTitle("Set voice bitrate")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("bitrate")
          .setLabel("Bitrate in kbps (8-96)")
          .setStyle(TextInputStyle.Short)
          .setValue(String(current))
          .setMaxLength(2)
          .setRequired(true),
      ),
    );
}

export function buildVoiceMasterStatusModal(channel: any): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("voicemaster:status-modal")
    .setTitle("Set channel status")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("status")
          .setLabel("Status text (supports $emoji and custom emojis)")
          .setStyle(TextInputStyle.Short)
          .setValue(String(channel?.status ?? ""))
          .setMaxLength(80)
          .setRequired(false),
      ),
    );
}

function ephemeral(content: string): any {
  return { content, flags: MessageFlags.Ephemeral };
}

async function ownedChannel(
  client: CassieClient,
  guildId: string,
  userId: string,
): Promise<{ record: VoiceMasterChannelDoc; channel: any } | null> {
  const records = await (client as any).db?.getVoiceMasterChannels?.(guildId);
  for (const record of records ?? []) {
    if (record.owner_id !== userId) continue;
    const channel = client.channels.cache.get(record.channel_id);
    if (channel) return { record, channel };
    await (client as any).db?.deleteVoiceMasterChannel?.(record.channel_id);
  }
  return null;
}

function currentVoiceChannel(interaction: any): any | null {
  return interaction.member?.voice?.channel ?? null;
}

async function requireOwnerChannel(
  interaction: any,
  client: CassieClient,
): Promise<{ record: VoiceMasterChannelDoc; channel: any } | null> {
  const owned = await ownedChannel(
    client,
    interaction.guild.id,
    interaction.user.id,
  );
  if (!owned) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(
        ephemeral("You do not own a temporary voice channel."),
      );
    }
    return null;
  }
  return owned;
}

async function saveChannel(
  client: CassieClient,
  record: VoiceMasterChannelDoc,
): Promise<void> {
  await (client as any).db?.setVoiceMasterChannel?.(record);
}

async function closeTemporaryChannel(
  client: CassieClient,
  channel: any,
): Promise<void> {
  await (client as any).db?.deleteVoiceMasterChannel?.(channel.id);
  await channel.delete("VoiceMaster channel deleted").catch((): null => null);
}

export async function handleVoiceMasterInteraction(
  interaction: any,
  client: CassieClient,
): Promise<void> {
  if (!interaction.guild) {
    await interaction
      .reply(ephemeral("This panel can only be used in a server."))
      .catch((): null => null);
    return;
  }

  const parts = String(interaction.customId ?? "").split(":");
  const action = parts[1] ?? "";

  function appendVoiceMasterLog(record: VoiceMasterChannelDoc, text: string): void {
    const stamp = new Date().toISOString();
    const next = [...(record.logs ?? []), `${stamp} — ${text}`].slice(-25);
    record.logs = next;
    record.updated_at = new Date();
  }

  if (interaction.isModalSubmit?.()) {
    const owned = await requireOwnerChannel(interaction, client);
    if (!owned) return;

    if (action === "rename-modal") {
      const name = interaction.fields.getTextInputValue("name").trim();
      if (!name)
        return interaction.reply(ephemeral("Channel name cannot be empty."));
      await owned.channel.setName(name).catch((): null => null);
      appendVoiceMasterLog(owned.record, `Renamed channel to "${name}".`);
      await saveChannel(client, owned.record);
      await interaction.reply(
        ephemeral(`Renamed your channel to **${name}**.`),
      );
      return;
    }

    if (action === "limit-modal") {
      const raw = interaction.fields.getTextInputValue("limit").trim();
      const limit = Number(raw);
      if (!Number.isInteger(limit) || limit < 0 || limit > 99) {
        await interaction.reply(
          ephemeral("Limit must be a whole number from **0** to **99**."),
        );
        return;
      }
      await owned.channel.setUserLimit(limit).catch((): null => null);
      owned.record.user_limit = limit;
      appendVoiceMasterLog(owned.record, `Updated member limit to ${limit === 0 ? "unlimited" : limit}.`);
      await saveChannel(client, owned.record);
      await interaction.reply(
        ephemeral(
          `Member limit set to **${limit === 0 ? "unlimited" : limit}**.`,
        ),
      );
      return;
    }

    if (action === "bitrate-modal") {
      const bitrate = Number(
        interaction.fields.getTextInputValue("bitrate").trim(),
      );
      if (!Number.isInteger(bitrate) || bitrate < 8 || bitrate > 96) {
        await interaction.reply(
          ephemeral(
            "Bitrate must be a whole number from **8** to **96** kbps.",
          ),
        );
        return;
      }
      await owned.channel.setBitrate(bitrate * 1000);
      appendVoiceMasterLog(owned.record, `Updated bitrate to ${bitrate} kbps.`);
      await saveChannel(client, owned.record);
      await interaction.reply(
        ephemeral(`Voice bitrate set to **${bitrate} kbps**.`),
      );
      return;
    }

    if (action === "status-modal") {
      const raw = interaction.fields.getTextInputValue("status").trim();
      const parsed = await parseSayText(raw, async (identifier: string) => {
        const emoji = await resolveEmoji(client, identifier, interaction.guild);
        return emoji ?? null;
      });
      const status = parsed.text.trim();
      const finalStatus = status.length > 80 ? status.slice(0, 80) : status;
      await owned.channel.setStatus(finalStatus || null).catch((): null => null);
      appendVoiceMasterLog(owned.record, `Updated channel status to ${finalStatus || "empty"}.`);
      await saveChannel(client, owned.record);
      await interaction.reply(
        ephemeral(finalStatus ? `Voice channel status set to **${finalStatus}**.` : "Voice channel status cleared."),
      );
      return;
    }
    return;
  }

  if (interaction.isUserSelectMenu?.()) {
    const owned = await requireOwnerChannel(interaction, client);
    if (!owned) return;
    const targetId = interaction.values?.[0];
    const target = owned.channel.guild.members.cache.get(targetId);
    if (!target) {
      await interaction.reply(
        ephemeral("That member could not be found in this server."),
      );
      return;
    }

    if (action === "permit-select") {
      await owned.channel.permissionOverwrites
        .edit(targetId, {
          ViewChannel: true,
          Connect: true,
          Speak: true,
        })
        .catch((): null => null);
      appendVoiceMasterLog(owned.record, `Permitted ${target.displayName} to join the channel.`);
      await saveChannel(client, owned.record);
      await interaction.reply(
        ephemeral(`Permitted **${target.displayName}** to join your channel.`),
      );
    } else if (action === "kick-select") {
      if (!owned.channel.members.has(targetId)) {
        await interaction.reply(
          ephemeral("That member is not in your voice channel."),
        );
        return;
      }
      await target.voice.setChannel(null).catch((): null => null);
      appendVoiceMasterLog(owned.record, `Removed ${target.displayName} from the channel.`);
      await saveChannel(client, owned.record);
      await interaction.reply(
        ephemeral(`Removed **${target.displayName}** from your channel.`),
      );
    } else if (action === "transfer-select") {
      if (!owned.channel.members.has(targetId)) {
        await interaction.reply(
          ephemeral("That member is not in your voice channel."),
        );
        return;
      }
      await owned.channel.permissionOverwrites
        .edit(interaction.user.id, {
          MoveMembers: false,
        })
        .catch((): null => null);
      await owned.channel.permissionOverwrites
        .edit(targetId, {
          ViewChannel: true,
          Connect: true,
          Speak: true,
          MoveMembers: true,
        })
        .catch((): null => null);
      owned.record.owner_id = targetId;
      appendVoiceMasterLog(owned.record, `Transferred ownership to ${target.displayName}.`);
      await saveChannel(client, owned.record);
      await interaction.reply(
        ephemeral(`Ownership transferred to **${target.displayName}**.`),
      );
    }
    return;
  }

  if (!interaction.isButton?.()) return;

  if (action === "rename") {
    const owned = await requireOwnerChannel(interaction, client);
    if (owned)
      await interaction.showModal(buildVoiceMasterRenameModal(owned.channel));
    return;
  }

  if (action === "limit") {
    const owned = await requireOwnerChannel(interaction, client);
    if (owned)
      await interaction.showModal(buildVoiceMasterLimitModal(owned.channel));
    return;
  }

  if (action === "bitrate") {
    const owned = await requireOwnerChannel(interaction, client);
    if (owned)
      await interaction.showModal(buildVoiceMasterBitrateModal(owned.channel));
    return;
  }

  if (action === "status") {
    const owned = await requireOwnerChannel(interaction, client);
    if (owned)
      await interaction.showModal(buildVoiceMasterStatusModal(owned.channel));
    return;
  }

  if (action === "lock" || action === "unlock" || action === "privacy") {
    const owned = await requireOwnerChannel(interaction, client);
    if (!owned) return;
    const locked = action === "privacy" ? !owned.record.locked : action === "lock";
    await owned.channel.permissionOverwrites.edit(
      interaction.guild.roles.everyone,
      { Connect: !locked },
    );
    owned.record.locked = locked;
    appendVoiceMasterLog(owned.record, `Channel ${locked ? "locked" : "unlocked"}.`);
    await saveChannel(client, owned.record);
    await refreshVoiceMasterPanel(client, interaction.guild);
    await interaction.reply(
      ephemeral(`Your channel is now **${locked ? "locked" : "unlocked"}**.`),
    );
    return;
  }

  if (action === "ghost" || action === "unghost") {
    const owned = await requireOwnerChannel(interaction, client);
    if (!owned) return;
    const hidden = action === "ghost";
    await owned.channel.permissionOverwrites.edit(
      interaction.guild.roles.everyone,
      {
        ViewChannel: hidden ? false : null,
      },
    );
    await owned.channel.permissionOverwrites.edit(interaction.user.id, {
      ViewChannel: true,
      Connect: true,
      Speak: true,
      MoveMembers: true,
    });
    owned.record.hidden = hidden;
    appendVoiceMasterLog(owned.record, `Channel ${hidden ? "hidden" : "made visible"}.`);
    await saveChannel(client, owned.record);
    await refreshVoiceMasterPanel(client, interaction.guild);
    await interaction.reply(
      ephemeral(`Your channel is now **${hidden ? "hidden" : "visible"}**.`),
    );
    return;
  }

  if (action === "activity") {
    const owned = await requireOwnerChannel(interaction, client);
    if (!owned) return;
    const members = [...owned.channel.members.values()];
    if (!members.length) {
      await interaction.reply(
        ephemeral("Nobody is currently in your voice channel."),
      );
      return;
    }
    const activity = members
      .map((member: any) => {
        const state = member.voice;
        const flags = [
          state.selfMute ? "muted" : null,
          state.selfDeaf ? "deafened" : null,
          state.streaming ? "streaming" : null,
          state.selfVideo ? "camera" : null,
        ].filter(Boolean);
        return `• **${member.displayName}**${flags.length ? ` — ${flags.join(", ")}` : " — active"}`;
      })
      .join("\n");
    await interaction.reply(
      ephemeral(`**Activity in ${owned.channel.name}**\n${activity}`),
    );
    return;
  }

  if (action === "permit") {
    const owned = await requireOwnerChannel(interaction, client);
    if (!owned) return;
    const menu = new UserSelectMenuBuilder()
      .setCustomId("voicemaster:permit-select")
      .setPlaceholder("Choose a member to permit")
      .setMinValues(1)
      .setMaxValues(1);
    await interaction.reply({
      content: `${emojis.voiceMasterPermit} Select a member to permit.`,
      components: [
        new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(menu),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === "invite") {
    const owned = await requireOwnerChannel(interaction, client);
    if (!owned) return;
    const invite = await owned.channel.createInvite({
      maxAge: 3600,
      maxUses: 0,
      unique: true,
      reason: "VoiceMaster owner created an invite",
    });
    await interaction.reply(
      ephemeral(
        `Here is a one-hour invite to **${owned.channel.name}**:\n${invite.url}`,
      ),
    );
    return;
  }

  if (action === "kick") {
    const owned = await requireOwnerChannel(interaction, client);
    if (!owned) return;
    const members = owned.channel.members.filter(
      (member: any) => member.id !== interaction.user.id,
    );
    if (!members.size) {
      await interaction.reply(
        ephemeral("There is nobody else in your channel."),
      );
      return;
    }
    const menu = new UserSelectMenuBuilder()
      .setCustomId("voicemaster:kick-select")
      .setPlaceholder("Choose a member to remove")
      .setMinValues(1)
      .setMaxValues(1);
    await interaction.reply({
      content: `${emojis.voiceMasterKick} Select a member to remove.`,
      components: [
        new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(menu),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === "claim") {
    const current = currentVoiceChannel(interaction);
    if (!current) {
      await interaction.reply(
        ephemeral("Join a temporary voice channel before claiming one."),
      );
      return;
    }
    const records =
      (await (client as any).db?.getVoiceMasterChannels?.(
        interaction.guild.id,
      )) ?? [];
    const record = records.find((entry: VoiceMasterChannelDoc) => {
      const channel = interaction.guild.channels.cache.get(entry.channel_id);
      const owner = interaction.guild.members.cache.get(entry.owner_id);
      return (
        channel &&
        channel.id === current.id &&
        !channel.members.has(entry.owner_id) &&
        !owner?.voice?.channelId
      );
    });
    if (!record) {
      await interaction.reply(
        ephemeral("This channel is not available to claim."),
      );
      return;
    }
    await current.permissionOverwrites
      .edit(interaction.user.id, {
        ViewChannel: true,
        Connect: true,
        Speak: true,
        MoveMembers: true,
      })
      .catch((): null => null);
    record.owner_id = interaction.user.id;
    appendVoiceMasterLog(record, `Ownership claimed by ${interaction.user.tag}.`);
    await saveChannel(client, record);
    await interaction.reply(
      ephemeral("You now own this temporary voice channel."),
    );
    return;
  }

  if (action === "owner" || action === "transfer") {
    const owned = await requireOwnerChannel(interaction, client);
    if (!owned) return;
    const members = owned.channel.members.filter(
      (member: any) => member.id !== interaction.user.id,
    );
    if (!members.size) {
      await interaction.reply(
        ephemeral("There is nobody else in your channel to transfer it to."),
      );
      return;
    }
    const menu = new UserSelectMenuBuilder()
      .setCustomId("voicemaster:transfer-select")
      .setPlaceholder("Choose the new owner")
      .setMinValues(1)
      .setMaxValues(1);
    await interaction.reply({
      content: `${emojis.voiceMasterTransfer} Select the new owner.`,
      components: [
        new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(menu),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === "info") {
    const owned = await requireOwnerChannel(interaction, client);
    if (!owned) return;
    const members =
      [...owned.channel.members.values()]
        .map((member: any) => `• ${member.displayName}`)
        .join("\n") || "*Nobody is connected*";
    const created =
      owned.record.created_at instanceof Date
        ? `<t:${Math.floor(owned.record.created_at.getTime() / 1000)}:R>`
        : "unknown";
    const details = [
      `**Channel:** ${owned.channel.name}`,
      `**Owner:** <@${owned.record.owner_id}>`,
      `**Created:** ${created}`,
      `**Members:**\n${members}`,
      `**Locked:** ${owned.record.locked ? "Yes" : "No"}`,
      `**Hidden:** ${owned.record.hidden ? "Yes" : "No"}`,
      `**Status:** ${owned.channel.status || "Not set"}`,
    ].join("\n");
    await interaction.reply(ephemeral(details));
    return;
  }

  if (action === "logs") {
    const owned = await requireOwnerChannel(interaction, client);
    if (!owned) return;
    const logLines = (owned.record.logs ?? []).length
      ? owned.record.logs.join("\n")
      : "*No channel activity recorded yet.*";
    await interaction.reply(ephemeral(`**Voice channel log**\n${logLines}`));
    return;
  }

  if (action === "delete") {
    const owned = await requireOwnerChannel(interaction, client);
    if (!owned) return;
    await interaction.reply(
      ephemeral("Your temporary voice channel has been deleted."),
    );
    await closeTemporaryChannel(client, owned.channel);
  }
}
