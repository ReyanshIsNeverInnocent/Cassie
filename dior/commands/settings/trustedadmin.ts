import { config } from '../../config.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendInfo } from '../../components/statusMessages.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { MAX_GUILD_TRUSTED_ADMINISTRATORS } from '../../database/database.js';
import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { emojis } from '../../emojis.js';
import { checkGuildCommandAccess } from '../../helpers/trustedAdministrators.js';

export const options = {
  name:        'trustedadmin',
  aliases:     ['trustadmin'] as string[],
  description: "Manage this server's trusted administrators. Only the server owner can do so.",
  usage:       'trustedadmin add <user>\ntrustedadmin remove <user>\ntrustedadmin list',
  category:    'settings',
  owner:       false,
  serverOwnerOnly: true,
  cooldown:    3,
};

type TrustedAdminAction = 'add' | 'remove' | 'list';

function buildTrustedAdminPayload(title: string, details: string, footer: string, icon: string) {
  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${icon} ${title}`))
    .addSeparatorComponents(new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(details))
    .addSeparatorComponents(new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer}`));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] as ('users' | 'roles' | 'everyone')[] },
  };
}

async function sendTrustedAdminPayload(
  context: { message?: any; interaction?: any },
  payload: ReturnType<typeof buildTrustedAdminPayload>,
): Promise<any> {
  if (context.interaction) return context.interaction.editReply(payload);
  return context.message.reply(payload);
}

async function runTrustedAdmin(
  context: { message?: any; interaction?: any },
  client: CassieClient,
  action: TrustedAdminAction,
  targetUser?: any,
): Promise<any> {
  const message = context.message;
  const interaction = context.interaction;
  const guild = message?.guild ?? interaction?.guild;
  const actor = message?.author ?? interaction?.user;
  const ctx = message ? { message } : { interaction };

  if (!guild) return sendError(ctx, 'This command can only be used in a server.');
  const access = await checkGuildCommandAccess(options, guild, actor?.id, client);
  if ('error' in access) return sendError(ctx, access.error);
  if (!client.db) return sendError(ctx, 'The database is unavailable right now.');

  if (action === 'list') {
    try {
      const userIds = await client.db.getGuildTrustedAdministrators(guild.id);
      const details = userIds.length
        ? userIds.map((id, index) => {
            const member = guild.members.cache.get(id);
            const label = member?.displayName ?? member?.user?.username ?? `<@${id}>`;
            return `**${index + 1}. ${label}**\n-# <@${id}> · \`${id}\``;
          }).join('\n\n')
        : 'No trusted administrators have been added to this server yet.';
      return sendTrustedAdminPayload(
        context,
        buildTrustedAdminPayload(
          `Trusted Administrators · ${userIds.length}/${MAX_GUILD_TRUSTED_ADMINISTRATORS}`,
          details,
          'Only the server owner can add or remove trusted administrators.',
          emojis.info,
        ),
      );
    } catch (err: any) {
      console.error(`[trustedadmin] failed to list administrators in ${guild.id}: ${err?.message ?? err}`);
      return sendError(ctx, "I could not load this server's trusted administrators.");
    }
  }

  if (!targetUser) return sendError(ctx, `Provide a user. Usage: \`${options.usage}\``);
  if (targetUser.id === guild.ownerId) {
    return sendError(ctx, 'The actual server owner cannot be added or removed as a trusted administrator.');
  }

  if (action === 'add') {
    if (targetUser.bot) return sendError(ctx, 'Bots cannot be trusted administrators.');
    const targetMember = await guild.members.fetch(targetUser.id).catch((): null => null);
    if (!targetMember) return sendError(ctx, 'The user must be a member of this server to become a trusted administrator.');

    try {
      const result = await client.db.addGuildTrustedAdministrator(guild.id, targetUser.id);
      if (result === 'already') {
        return sendInfo(ctx, `**${targetUser.username}** is already a trusted administrator.`);
      }
      if (result === 'limit') {
        return sendError(ctx, `This server already has the maximum of **${MAX_GUILD_TRUSTED_ADMINISTRATORS}** trusted administrators.`);
      }
      return sendTrustedAdminPayload(
        context,
        buildTrustedAdminPayload(
          'Trusted Administrator Added',
          `**${targetUser.username}** (<@${targetUser.id}>) can now use commands configured for trusted administrators.`,
          'They cannot add, remove, or manage trusted administrators.',
          emojis.blacktick,
        ),
      );
    } catch (err: any) {
      console.error(`[trustedadmin] failed to add ${targetUser.id} in ${guild.id}: ${err?.message ?? err}`);
      return sendError(ctx, 'I could not add that trusted administrator because the database request failed.');
    }
  }

  try {
    const removed = await client.db.removeGuildTrustedAdministrator(guild.id, targetUser.id);
    if (!removed) return sendInfo(ctx, `**${targetUser.username}** is not a trusted administrator.`);
    return sendTrustedAdminPayload(
      context,
      buildTrustedAdminPayload(
        'Trusted Administrator Removed',
        `**${targetUser.username}** (<@${targetUser.id}>) no longer has trusted administrator access.`,
        'They can no longer use commands configured for trusted administrators.',
        emojis.blacktick,
      ),
    );
  } catch (err: any) {
    console.error(`[trustedadmin] failed to remove ${targetUser.id} in ${guild.id}: ${err?.message ?? err}`);
    return sendError(ctx, 'I could not remove that trusted administrator because the database request failed.');
  }
}

export async function prefixExecute(
  message: any,
  args: string[],
  client: CassieClient,
): Promise<any> {
  if (!message.guild) return sendError({ message }, 'This command can only be used in a server.');
  const access = await checkGuildCommandAccess(options, message.guild, message.author.id, client);
  if ('error' in access) return sendError({ message }, access.error);

  const action = args[0]?.toLowerCase() as TrustedAdminAction | undefined;
  if (!action || !['add', 'remove', 'list'].includes(action)) {
    return sendError(
      { message },
      `Usage:\n\`\`\`\n${options.usage}\n\`\`\``,
    );
  }
  if (action === 'list') return runTrustedAdmin({ message }, client, action);
  if (!args[1]) return sendError({ message }, `Provide a user. Usage: \`${options.usage}\``);

  const targetUser = await resolveUser(client, message.guild, args[1]);
  if (!targetUser) return sendError({ message }, `Could not find a user matching \`${args[1]}\`.`);
  return runTrustedAdmin({ message }, client, action, targetUser);
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  await interaction.deferReply({ ephemeral: true });
  const action = interaction.options.getSubcommand(true) as TrustedAdminAction;
  const targetUser = action === 'list' ? undefined : interaction.options.getUser('user', true);
  return runTrustedAdmin({ interaction }, client, action, targetUser);
}
