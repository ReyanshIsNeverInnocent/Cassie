// xoxo/commands/utility/vanityrole.ts
//
// $vanityrole — configure automatic roles based on status keywords or server tag.
//
// Usage:
//   $vanityrole [status|bio]   — opens the interactive status-trigger panel
//   $vanityrole tag            — opens the interactive server-tag panel
//                                (only available when the guild has the CLAN feature)
//
// All configuration is done through the interactive panel: buttons open modals
// for text input (keyword, message), and select menus handle role/channel selection.

import { PermissionFlagsBits } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError }           from '../../components/statusMessages.js';
import {
  buildStatusPayload,
  buildTagPayload,
  registerVrSession,
} from '../../components/utility/vanityrole.js';

export const options = {
  name:        'vanityrole',
  aliases:     ['vr', 'vanityroles'] as string[],
  description: 'Configure automatic roles for status keyword or server tag triggers.',
  usage:       'vanityrole\nvanityrole status\nvanityrole bio\nvanityrole tag',
  category:    'features',
  owner:       false,
  cooldown:    3,
};

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  if (!message.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild))
    return sendError(ctx, 'You need the **Manage Server** permission to use this command.');

  if (!client.db) return sendError(ctx, 'Database is unavailable.');

  const guild  = message.guild;
  const sub    = args[0]?.toLowerCase();
  const scopeId = message.id; // stable scope for all customIds; set before the panel is sent

  // ── $vanityrole tag ───────────────────────────────────────────────────────
  if (sub === 'tag') {
    // Only show the tag panel if the guild has the CLAN (server tag) feature.
    // If the feature flag is absent, the guildMemberUpdate event will never fire
    // the server-tag bit, so configuring the trigger would be pointless.
    if (!guild.features.includes('CLAN')) {
      return sendError(
        ctx,
        "This server doesn't have a server tag. The tag trigger is only available for servers with the CLAN feature enabled by Discord.",
      );
    }

    const settings = await client.db.getVanityRoleSettings(guild.id).catch((): null => null);
    const msg      = await message.channel.send(buildTagPayload(settings, scopeId, false));

    registerVrSession(scopeId, {
      page:      'tag',
      guildId:   guild.id,
      channelId: message.channel.id,
      botMsgId:  msg.id,
      client,
    });

    return;
  }

  // ── $vanityrole / $vanityrole status / $vanityrole bio ────────────────────
  if (!sub || sub === 'status' || sub === 'bio') {
    const settings = await client.db.getVanityRoleSettings(guild.id).catch((): null => null);
    const msg      = await message.channel.send(buildStatusPayload(settings, scopeId, false));

    registerVrSession(scopeId, {
      page:      'status',
      guildId:   guild.id,
      channelId: message.channel.id,
      botMsgId:  msg.id,
      client,
    });

    return;
  }

  return sendError(
    ctx,
    `Unknown subcommand \`${sub}\`.\nUsage: \`$vanityrole\` / \`$vanityrole status\` / \`$vanityrole bio\` / \`$vanityrole tag\``,
  );
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  await interaction.deferReply();

  if (!interaction.guild)
    return sendError({ interaction }, 'This command can only be used in a server.');

  if (!client.db)
    return sendError({ interaction }, 'Database is unavailable.');

  const guild   = interaction.guild;
  const sub     = interaction.options.getSubcommand(false)?.toLowerCase();
  const scopeId = interaction.id;

  if (sub === 'tag') {
    if (!guild.features.includes('CLAN')) {
      return sendError(
        { interaction },
        "This server doesn't have a server tag. The tag trigger is only available for servers with the CLAN feature enabled by Discord.",
      );
    }

    const settings = await client.db.getVanityRoleSettings(guild.id).catch((): null => null);
    const msg      = await interaction.editReply(buildTagPayload(settings, scopeId, false));

    registerVrSession(scopeId, {
      page:      'tag',
      guildId:   guild.id,
      channelId: interaction.channelId,
      botMsgId:  msg.id,
      client,
    });

    return;
  }

  const settings = await client.db.getVanityRoleSettings(guild.id).catch((): null => null);
  const msg      = await interaction.editReply(buildStatusPayload(settings, scopeId, false));

  registerVrSession(scopeId, {
    page:      'status',
    guildId:   guild.id,
    channelId: interaction.channelId,
    botMsgId:  msg.id,
    client,
  });
}
