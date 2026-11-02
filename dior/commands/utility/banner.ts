// xoxo/commands/utility/banner.ts
//
// View a user's, the bot's, or the server's banner.
//
// Prefix usage:
//   banner            — your own banner
//   banner @user      — another user
//   banner bot        — bot's banner
//   banner server     — server banner

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { resolveUser } from '../../helpers/userResolver.js';
import {
  buildChoicePayload,
  buildTimedOutChoicePayload,
  type MediaType,
} from '../../components/utility/avatarBanner.js';
import { sendImagePanel } from '../../helpers/imagePanel.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';

export const options = {
  name: 'banner',
  aliases: ['bn'] as string[],
  description: "View a user's, the bot's, or the server's banner.",
  usage: `banner
  banner @user
  banner <user ID>
  banner bot
  banner server`,
  category: 'utility',
  owner: false,
  cooldown: 3,
};

const TYPE: MediaType = 'banner';

function bannerTitle(displayName: string, variant: 'global' | 'server'): string {
  return `${displayName}'s ${variant === 'server' ? 'Server' : 'Global'} Banner`;
}

async function sendWithChoice(
  channel: any,
  sendChoiceMsg: ((payload: any) => Promise<any>) | null,
  displayName: string,
  requesterId: string,
  getUrl: (type: 'server' | 'global') => string | null,
): Promise<any> {
  const choicePayload = buildChoicePayload(displayName, TYPE);

  let promptMsg: any;
  if (sendChoiceMsg) {
    promptMsg = await sendChoiceMsg(choicePayload).catch((): null => null);
  } else {
    promptMsg = await channel.send(choicePayload).catch((): null => null);
  }
  if (!promptMsg) return;

  const collector = promptMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
      i, requesterId,
      (cid) => cid === `choice:server_${TYPE}` || cid === `choice:global_${TYPE}`,
    ),
    time: 60_000,
    max: 1,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    const chosen = i.customId === `choice:server_${TYPE}` ? 'server' : 'global';
    const url = getUrl(chosen);
    if (!url) return;
    const title = bannerTitle(displayName, chosen);
    await promptMsg.delete().catch((): null => null);
    await sendImagePanel({ channel, sendAsReply: null, title, imageUrl: url, requesterId, idPrefix: 'bn' });
  });

  collector.on('end', async (_: any, reason: string) => {
    if (reason === 'time') {
      await promptMsg.edit(buildTimedOutChoicePayload(displayName, TYPE)).catch((): null => null);
    }
  });
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  await interaction.deferReply();

  const guild = interaction.guild;
  const requesterId: string = interaction.user.id;
  const channel = interaction.channel;
  const sub: string = interaction.options.getSubcommand(true);

  const sendFirst = (payload: any) => interaction.editReply(payload);

  // ── /banner server ──────────────────────────────────────────────────────────
  if (sub === 'server') {
    if (!guild) return sendError({ interaction }, 'Server banner is not available outside a server the bot is in.');
    const bannerUrl = guild.bannerURL({ size: 4096 });
    if (!bannerUrl) return sendError({ interaction }, 'This server does not have a banner.');
    return sendImagePanel({ channel, sendAsReply: sendFirst, title: "Server's Banner", imageUrl: bannerUrl, requesterId, idPrefix: 'bn' });
  }

  // ── /banner bot ─────────────────────────────────────────────────────────────
  if (sub === 'bot') {
    const botUser = await client.users.fetch(client.user!.id, { force: true });
    const botMember = guild
      ? await guild.members.fetch({ user: client.user!.id, force: true }).catch((): null => null)
      : null;
    const globalBannerUrl: string | null = botUser.banner ? botUser.bannerURL({ size: 4096 }) : null;
    const serverBannerUrl: string | null = botMember?.banner ? botMember.bannerURL({ size: 4096 }) : null;

    if (!globalBannerUrl && !serverBannerUrl) return sendError({ interaction }, 'The bot does not have any banner.');
    if (globalBannerUrl && serverBannerUrl) {
      return sendWithChoice(channel, sendFirst, 'Bot', requesterId, (t) =>
        t === 'server' ? serverBannerUrl : globalBannerUrl,
      );
    }
    const url = serverBannerUrl ?? globalBannerUrl!;
    const title = serverBannerUrl ? bannerTitle('Bot', 'server') : bannerTitle('Bot', 'global');
    return sendImagePanel({ channel, sendAsReply: sendFirst, title, imageUrl: url, requesterId, idPrefix: 'bn' });
  }

  // ── /banner user [user] ─────────────────────────────────────────────────────
  const targetOption: any = interaction.options.getUser('user') ?? null;
  const rawUser = targetOption ?? interaction.user;
  const fullUser = await client.users.fetch(rawUser.id, { force: true });
  const member = guild
    ? await guild.members.fetch({ user: fullUser.id, force: true }).catch((): null => null)
    : null;
  const globalBannerUrl: string | null = fullUser.banner ? fullUser.bannerURL({ size: 4096 }) : null;
  const serverBannerUrl: string | null = member?.banner ? member.bannerURL({ size: 4096 }) : null;

  if (!globalBannerUrl && !serverBannerUrl) return sendError({ interaction }, `**${fullUser.username}** does not have any banner.`);
  if (globalBannerUrl && serverBannerUrl) {
    return sendWithChoice(channel, sendFirst, fullUser.username, requesterId, (t) =>
      t === 'server' ? serverBannerUrl : globalBannerUrl,
    );
  }
  const url = serverBannerUrl ?? globalBannerUrl!;
  const title = serverBannerUrl ? bannerTitle(fullUser.username, 'server') : bannerTitle(fullUser.username, 'global');
  return sendImagePanel({ channel, sendAsReply: sendFirst, title, imageUrl: url, requesterId, idPrefix: 'bn' });
}

export async function prefixExecute(message: any, args: string[], client: CassieClient): Promise<any> {
  const guild = message.guild;
  const requesterId: string = message.author.id;
  const channel = message.channel;

  if (!guild) return sendError({ message }, 'This command can only be used in a server.');

  const firstArg = args[0]?.toLowerCase();

  if (firstArg === 'server' || firstArg === 'srv') {
    const bannerUrl = guild.bannerURL({ size: 4096 });
    if (!bannerUrl) return sendError({ message }, 'This server does not have a banner.');
    return sendImagePanel({ channel, sendAsReply: null, title: "Server's Banner", imageUrl: bannerUrl, requesterId, idPrefix: 'bn' });
  }

  if (firstArg === 'bot') {
    const botUser = await client.users.fetch(client.user!.id, { force: true });
    const botMember = await guild.members.fetch({ user: client.user!.id, force: true }).catch((): null => null);
    const globalBannerUrl: string | null = botUser.banner ? botUser.bannerURL({ size: 4096 }) : null;
    const serverBannerUrl: string | null = botMember?.banner ? botMember.bannerURL({ size: 4096 }) : null;

    if (!globalBannerUrl && !serverBannerUrl) {
      return sendError({ message }, 'The bot does not have any banner.');
    }
    if (globalBannerUrl && serverBannerUrl) {
      return sendWithChoice(channel, null, 'Bot', requesterId, (t) =>
        t === 'server' ? serverBannerUrl : globalBannerUrl,
      );
    }
    const url = serverBannerUrl ?? globalBannerUrl!;
    const title = serverBannerUrl ? bannerTitle('Bot', 'server') : bannerTitle('Bot', 'global');
    return sendImagePanel({ channel, sendAsReply: null, title, imageUrl: url, requesterId, idPrefix: 'bn' });
  }

  let targetUser: any;
  if (!args.length && message.reference?.messageId) {
    const repliedMessage = await message.channel.messages
      .fetch(message.reference.messageId)
      .catch((): null => null);
    if (!repliedMessage?.author) return sendError({ message }, 'Could not fetch the replied message.');
    targetUser = repliedMessage.author;
  } else if (!args.length) {
    targetUser = message.author;
  } else {
    targetUser = await resolveUser(client, guild, args[0]);
  }
  if (!targetUser) return sendError({ message }, 'User not found. Try: mention, user ID, or username.');

  const fullUser = await client.users.fetch(targetUser.id, { force: true });
  const member = await guild.members.fetch({ user: fullUser.id, force: true }).catch((): null => null);
  const globalBannerUrl: string | null = fullUser.banner ? fullUser.bannerURL({ size: 4096 }) : null;
  const serverBannerUrl: string | null = member?.banner ? member.bannerURL({ size: 4096 }) : null;

  if (!globalBannerUrl && !serverBannerUrl) {
    return sendError({ message }, `**${fullUser.username}** does not have any banner.`);
  }
  if (globalBannerUrl && serverBannerUrl) {
    return sendWithChoice(channel, null, fullUser.username, requesterId, (t) =>
      t === 'server' ? serverBannerUrl : globalBannerUrl,
    );
  }
  const url = serverBannerUrl ?? globalBannerUrl!;
  const title = serverBannerUrl
    ? bannerTitle(fullUser.username, 'server')
    : bannerTitle(fullUser.username, 'global');
  return sendImagePanel({ channel, sendAsReply: null, title, imageUrl: url, requesterId, idPrefix: 'bn' });
}
