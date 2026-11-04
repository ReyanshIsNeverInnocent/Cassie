// xoxo/commands/settings/noprefix.ts
//
// Lets users (and developers) toggle their own noprefix access on or off.
// Regular users: gated to those with a valid, non-expired noprefix DB entry.
// Developers: permanent access by default; self-disable stored separately so
//             they don't appear in the $globalnoprefix list.
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';
import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ThumbnailBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { config } from '../../config.js';
import { emojis } from '../../emojis.js';

export const options = {
  name: 'noprefix',
  aliases: ['nop', 'mynop', 'mynoprefix'] as string[],
  description: 'Toggle your own noprefix access on or off.',
  usage: `noprefix
  noprefix on
  noprefix off
  noprefix status
  noprefix server enable
  noprefix server disable`,
  category: 'settings',
  owner: false,
  cooldown: 3,
};

function formatExpiry(expiresAt: Date | null): string {
  if (!expiresAt) return '**permanent**';
  const s = Math.floor(expiresAt.getTime() / 1000);
  return `<t:${s}:R> (on <t:${s}:f>)`;
}

export async function sendNoprefixStatus(
  message: any,
  client: CassieClient,
  isDeveloper: boolean,
  targetUserId = message.author.id,
  targetUser = message.author,
): Promise<any> {
  const guild = message.guild;
  const globalEnabled = await client.db!.getNoprefixGlobalEnabled().catch((): boolean => false);
  const serverDisabled = await client.db!.isGuildNoPrefixDisabled(guild.id).catch((): boolean => false);
  const entry = isDeveloper
    ? null
    : await client.db!.getNoPrefixUserEntry(targetUserId).catch((): null => null);
  const developerDisabled = isDeveloper
    ? await client.db!.isDevNoprefixSelfDisabled(targetUserId, guild.id).catch((): boolean => false)
    : false;
  const personalDisabled = isDeveloper
    ? developerDisabled
    : Boolean(entry?.selfDisabled || entry?.selfDisabledGuildIds?.includes(guild.id));
  const expired = Boolean(entry?.expiresAt && entry.expiresAt.getTime() <= Date.now());
  const hasGrant = isDeveloper || Boolean(entry && !expired);
  const effective = globalEnabled && !serverDisabled && hasGrant && !personalDisabled;
  const subject = targetUserId === message.author.id
    ? 'Your'
    : `${targetUser?.username ?? `<@${targetUserId}>`}'s`;
  const grant = isDeveloper
    ? 'Developer access (permanent)'
    : entry && !expired
      ? `Granted, expires ${formatExpiry(entry.expiresAt)}`
      : expired
        ? 'Grant expired'
        : 'No noprefix grant';

  const details = [
    `- **Server:** ${guild.name}`,
    `- **Global noprefix:** ${globalEnabled ? 'enabled' : 'disabled'}`,
    `- **Server noprefix:** ${serverDisabled ? 'disabled by the server' : 'enabled'}`,
    `- **${subject} access:** ${grant}`,
    `- **${subject} server toggle:** ${personalDisabled ? 'disabled' : 'enabled'}`,
    `- **Effective status:** ${effective ? 'enabled' : 'disabled'}`,
  ].join('\n');
  const avatarUrl = targetUser?.displayAvatarURL?.({ extension: 'png', size: 128 })
    ?? message.author?.displayAvatarURL?.({ extension: 'png', size: 128 });
  const detailsSection = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(details));
  if (avatarUrl) detailsSection.setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${emojis.pinkFlowers} ${subject} Noprefix Status`))
    .addSeparatorComponents(new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }))
    .addSectionComponents(detailsSection)
    .addSeparatorComponents(new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Use ${client.config.prefix}help noprefix for help.`));

  return message.channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  if (!message.guild) return sendError({ message }, 'This command can only be used in a server.');
  if (!client.db) return sendError({ message }, 'Database is not available right now.');

  const isDeveloper = client.config.developers.some(([, id]: [string, string]) => id === message.author.id);
  const action = args[0]?.toLowerCase();
  const toggleAction = action === 'server' ? args[1]?.toLowerCase() : action;

  if (action === 'status') return sendNoprefixStatus(message, client, isDeveloper);

  // ── Developer path ───────────────────────────────────────────────────────────
  // Devs have permanent noprefix by default; self-disable stored in a separate
  // settings doc so they don't pollute the $globalnoprefix list.
  if (isDeveloper) {
    const devDisabled = await client.db.isDevNoprefixSelfDisabled(message.author.id, message.guild.id).catch((): boolean => false);

    if (!action) {
      return sendInfo(
        { message },
        [
          `**Your noprefix:** ${devDisabled ? 'disabled' : 'enabled'} (developer — permanent)`,
          `Use \`${client.config.prefix}noprefix on\` / \`${client.config.prefix}noprefix off\` to toggle.`,
        ].join('\n'),
      );
    }

    if (toggleAction === 'on' || toggleAction === 'enable') {
      if (!devDisabled) return sendInfo({ message }, 'Noprefix is already enabled for you.');
      await client.db.setDevNoprefixSelfDisabled(message.author.id, message.guild.id, false);
      return sendSuccess({ message }, 'Noprefix **enabled**. (Developer — permanent access)');
    }

    if (toggleAction === 'off' || toggleAction === 'disable') {
      if (devDisabled) return sendInfo({ message }, 'Noprefix is already disabled for you.');
      await client.db.setDevNoprefixSelfDisabled(message.author.id, message.guild.id, true);
      return sendSuccess({ message }, `Noprefix **disabled**. Use \`${client.config.prefix}noprefix on\` to re-enable.`);
    }

    return sendError({ message }, `Unknown action \`${toggleAction ?? action}\`. Use \`noprefix server enable\` or \`noprefix server disable\`.`);
  }

  // ── Regular user path ────────────────────────────────────────────────────────
  // Fetch the raw DB entry — bypass isNoPrefixUser so a self-disabled user
  // can still run $nop on to re-enable (they still have the regular prefix).
  const entry = await client.db.getNoPrefixUserEntry(message.author.id).catch((): null => null);

  // Entry must exist and must not be expired.
  const now = Date.now();
  const isExpiredOrMissing = !entry || (entry.expiresAt !== null && entry.expiresAt.getTime() <= now);
  if (isExpiredOrMissing) {
    return sendError({ message }, "You don't have noprefix access, so there's nothing to toggle.");
  }

  // ── No args → status ────────────────────────────────────────────────────────
  if (!action) {
    const isOn = !entry.selfDisabled && !entry.selfDisabledGuildIds?.includes(message.guild.id);
    return sendInfo(
      { message },
      [
        `**Your noprefix:** ${isOn ? 'enabled' : 'disabled'}`,
        `**Expires:** ${formatExpiry(entry.expiresAt)}`,
        `Use \`${client.config.prefix}noprefix on\` / \`${client.config.prefix}noprefix off\` to toggle.`,
      ].join('\n'),
    );
  }

  // ── on / enable ─────────────────────────────────────────────────────────────
  if (toggleAction === 'on' || toggleAction === 'enable') {
    if (!entry.selfDisabled && !entry.selfDisabledGuildIds?.includes(message.guild.id)) {
      return sendInfo({ message }, 'Noprefix is already enabled for you.');
    }
    await client.db.setNoPrefixUserDisabled(message.author.id, false);
    await client.db.setSelfNoPrefixDisabled(message.author.id, message.guild.id, false);
    return sendSuccess({ message }, `Noprefix **enabled**. Expires: ${formatExpiry(entry.expiresAt)}`);
  }

  // ── off / disable ────────────────────────────────────────────────────────────
  if (toggleAction === 'off' || toggleAction === 'disable') {
    if (entry.selfDisabled || entry.selfDisabledGuildIds?.includes(message.guild.id)) {
      return sendInfo({ message }, 'Noprefix is already disabled for you.');
    }
    await client.db.setSelfNoPrefixDisabled(message.author.id, message.guild.id, true);
    return sendSuccess(
      { message },
      `Noprefix **disabled**. Use \`${client.config.prefix}noprefix on\` to re-enable anytime (while your access is still valid).`,
    );
  }

  return sendError({ message }, `Unknown action \`${toggleAction ?? action}\`. Use \`noprefix server enable\` or \`noprefix server disable\`.`);
}
