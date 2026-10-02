// xoxo/events/discord/messageCreate.ts
//
// Handles prefix commands. Ignores bots and DMs.
// Also handles no-prefix access (developers always; others via DB).
// Enforces user and server blacklists via DB.
// Client is injected as the last argument by eventLoader.

import type { CassieClient } from '../../structures/CassieClient.js';
import webhookLogger from '../../utils/webhookLogger.js';
import {
  blacklistedUser,
  blacklistedServer,
  sendInfo,
  sendError,
  sendWarning,
  reservedForDeveloper,
} from '../../components/statusMessages.js';
import { updateSticky } from '../../helpers/stickyHelper.js';
import { buildAfkNoticePayload, buildAfkRemovedPayload, formatHumanDuration } from '../../components/utility/afk.js';
import { dispatchAutoresponders } from '../../helpers/autoresponderDispatch.js';
import { dispatchCustomRole }     from '../../helpers/customRoleDispatch.js';
import { withDeveloperPermissionBypass } from '../../helpers/developerPermissionBypass.js';
import { enforceImageRestriction } from '../../helpers/memberRestrictions.js';
import { enforceMediaChannel } from '../../helpers/mediaChannel.js';
import { enforceHoneypot } from '../../helpers/honeypot.js';
import { emojiUploadSessions } from '../../commands/developer/emoji-upload.js';
import { AmbiguousUserError } from '../../helpers/userResolver.js';
import { consumeCommandCooldown, getCommandCooldown, getPrefixSubcommand } from '../../helpers/commandCooldown.js';

export const name = 'messageCreate';
export const once = false;

export async function execute(message: any, client: CassieClient): Promise<void> {
  // Sticky must run for ALL messages (including bot-authored ones) so the sticky
  // re-posts at the bottom even when the bot itself sends a message.
  if (message.guild) {
    updateSticky(client, message).catch((): void => undefined);
  }

  if (!message.guild) return;

  // External bots can trigger autoresponders, but ignore this bot's own
  // responses so an autoresponder cannot loop against itself.
  if (message.author?.bot) {
    if (message.author.id !== client.user?.id) {
      dispatchAutoresponders(client, message).catch((): void => undefined);
    }
    return;
  }

  if (await enforceHoneypot(message, client)) return;

  // Replies collected by emoji-upload are names or server numbers, not commands.
  if (emojiUploadSessions.has(`${message.author.id}:${message.channel.id}`)) return;

  // Enforce member-targeted image mutes before commands, autoresponders, and
  // other message side effects can process prohibited content.
  if (await enforceMediaChannel(message, client)) return;
  if (await enforceImageRestriction(message, client)) return;

  // ── Autoresponders: trigger words → message/reaction responses ─────────────
  dispatchAutoresponders(client, message).catch((): void => undefined);

  // ── AFK: removal + notice ──────────────────────────────────────────────────
  if (client.db) {
    // Remove the sender's AFK if they have one active in this scope.
    if (client.db.isUserAFK(message.author.id)) {
      const removedAfks = await client.db
        .removeActiveAFKForMessage(message.author.id, message.guild.id)
        .catch((): any[] => []);
      if (removedAfks.length) {
        const earliest = removedAfks.reduce((oldest: any, cur: any) =>
          new Date(cur.since_at).getTime() < new Date(oldest.since_at).getTime() ? cur : oldest,
        );
        await message
          .reply(buildAfkRemovedPayload(
            formatHumanDuration(Date.now() - new Date(earliest.since_at).getTime()),
            new Date(),
          ))
          .catch((): null => null);
      }
    }

    // Notify if a mentioned user (or replied-to user) is AFK.
    const afkTargets = new Map<string, any>();
    for (const [id, user] of message.mentions.users) {
      if (id !== message.author.id) afkTargets.set(id, user);
    }
    if (message.reference?.messageId) {
      const replied = await message.channel.messages
        .fetch(message.reference.messageId)
        .catch((): null => null);
      if (replied?.author && !replied.author.bot && replied.author.id !== message.author.id) {
        afkTargets.set(replied.author.id, replied.author);
      }
    }
    for (const [userId, user] of afkTargets) {
      if (!client.db.isUserAFK(userId)) continue;
      const afk = await client.db.getAFK(userId, message.guild.id).catch((): null => null);
      if (afk) {
        const member = await message.guild.members.fetch(userId).catch((): null => null);
        await message
          .reply(buildAfkNoticePayload({
            displayName: member?.displayName ?? user.username,
            sinceAt:     new Date(afk.since_at),
            tillAt:      afk.till_at ? new Date(afk.till_at) : null,
            reason:      afk.reason,
            imageUrl:    afk.image_url,
            mentionedBy: message.author.username,
            mentionedAt: new Date(),
          }))
          .catch((): null => null);
      }
    }
  }

  // Resolve effective guild prefix for this guild (DB override → global fallback)
  let prefix: string = client.config.prefix;
  if (client.db && message.guild?.id) {
    const guildPrefix = await client.db.getGuildPrefix(message.guild.id).catch((): null => null);
    if (guildPrefix) prefix = guildPrefix;
  }

  // Resolve the user's personal self-prefix (from in-memory cache)
  const userSelfPrefix: string | undefined = client.userPrefixes.get(message.author.id);

  const developers: [string, string][] = client.config.developers;
  const isDeveloper = developers.some(([, id]: [string, string]) => id === message.author.id);

  // ── Blacklist checks (skip if DB not wired) ────────────────────────────────
  if (client.db) {
    try {
      // User blacklist
      const blEnabled = await client.db.getBlacklistGlobalEnabled().catch((): boolean => false);
      if (blEnabled) {
        const isBlacklisted = await client.db.isUserBlacklisted(message.author.id).catch((): boolean => false);
        if (isBlacklisted) {
          await blacklistedUser({ message }).catch((): null => null);
          return;
        }
      }

      // Server blacklist
      const srvBlEnabled = await client.db.getBlacklistServerGlobalEnabled().catch((): boolean => false);
      if (srvBlEnabled) {
        const srvBlacklisted = await client.db.isServerBlacklisted(message.guild.id).catch((): boolean => false);
        if (srvBlacklisted) {
          await blacklistedServer({ message }, message.guild, client).catch((): null => null);
          return;
        }
      }
    } catch {
      // DB not ready — silently continue
    }
  }

  // ── Bot-mention prefix ────────────────────────────────────────────────────
  // If the very first token is a mention of the bot (@bot), treat it like a
  // prefix. No arguments → tell the user the prefix. Arguments → run as a
  // command. Unknown command via mention → send an error (matches reference).
  const botId = client.user?.id;
  if (botId) {
    const mentionRe = new RegExp(`^<@!?${botId}>`);
    const mentionMatch = message.content.match(mentionRe);
    if (mentionMatch) {
      const rest = message.content.slice(mentionMatch[0].length).trim();

      if (!rest) {
        await sendInfo(
          { message },
          `Prefix in this server is \`${prefix}\`. Use \`${prefix}help\` to see all commands.`,
        ).catch((): null => null);
        return;
      }

      const mentionParts = rest.split(/\s+/);
      const mentionCmdName = mentionParts.shift()?.toLowerCase();
      const mentionArgs = mentionParts;

      if (mentionCmdName) {
        let mentionCmd =
          client.commands.get(mentionCmdName) ??
          client.commands.get(client.aliases.get(mentionCmdName) ?? '');
        let mentionUserAlias = false;

        if (!mentionCmd) {
          const userAliased = client.userAliases.get(message.author.id)?.get(mentionCmdName);
          if (userAliased) {
            mentionCmd =
              client.commands.get(userAliased) ??
              client.commands.get(client.aliases.get(userAliased) ?? '');
            mentionUserAlias = !!mentionCmd;
          }
        }

        if (!mentionCmd) {
          await sendError(
            { message },
            `Command not found. Use \`${prefix}help\` to see all commands.`,
          ).catch((): null => null);
          return;
        }

        const devOnly =
          mentionCmd.options?.owner === true ||
          mentionCmd.options?.isDeveloper === true;
        if (devOnly && !isDeveloper) {
          await reservedForDeveloper({ message }).catch((): null => null);
          return;
        }
        if (mentionUserAlias && !(await enforceUserAliasPermissions(message, mentionCmd))) return;

        if (client.db && !['disable-command', 'enable-command'].includes(mentionCmd.options?.name?.toLowerCase())) {
          const disabled = await client.db.getDisabledCommand(mentionCmd.options?.name ?? mentionCmdName).catch((): null => null);
          if (disabled) {
            await sendWarning({ message }, `${mentionCmd.options?.name ?? mentionCmdName} has been disabled by the developer. Reason: ${disabled.reason}`).catch((): null => null);
            return;
          }
        }

        message.commandRawArgs = rest.slice(mentionCmdName.length).trimStart();

        webhookLogger.logCommand(
          mentionCmdName,
          message.author,
          message.guild,
          mentionArgs,
          { prefix: `<@${botId}>`, type: 'Native' },
          message.url,
          message.channelId,
        );

        try {
          if (!mentionCmd.options?.noTyping) await message.channel.sendTyping().catch((): null => null);
          await mentionCmd.prefixExecute(
            withDeveloperPermissionBypass(message, isDeveloper),
            mentionArgs,
            client,
          );
          client.db?.incrementGlobalCommandsExecuted?.().catch((): null => null);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[messageCreate] Error in "${mentionCmdName}" (mention): ${msg}`);
        }
      }
      return;
    }
  }

  // ── Resolve command name ───────────────────────────────────────────────────
  // Prefix priority: longest matching prefix wins, preventing a short guild
  // prefix (e.g. "$") from shadowing a longer self-prefix (e.g. "$") or
  // vice-versa. Both the guild prefix and the user self-prefix always work.
  let commandName: string | undefined;
  let args: string[];
  let usedPrefix: string;

  const selfMatchLen  = (userSelfPrefix && message.content.startsWith(userSelfPrefix)) ? userSelfPrefix.length : 0;
  const guildMatchLen = message.content.startsWith(prefix) ? prefix.length : 0;
  const matchLen      = Math.max(selfMatchLen, guildMatchLen);

  if (matchLen > 0) {
    // Use whichever matched prefix is longer (greedy — prevents false matches)
    const chosenPrefix = (selfMatchLen >= guildMatchLen && selfMatchLen > 0)
      ? userSelfPrefix!
      : prefix;
    const sliced = message.content.slice(chosenPrefix.length).trim();
    const parts  = sliced.split(/\s+/);
    commandName  = parts.shift()?.toLowerCase();
    args         = parts;
    usedPrefix   = chosenPrefix;
  } else if (await hasNoPrefixAccess(message, client, isDeveloper)) {
    // No-prefix path — whole message is the command + args
    const parts = message.content.trim().split(/\s+/);
    commandName = parts.shift()?.toLowerCase();
    args = parts;
    usedPrefix = '';
  } else {
    return;
  }

  if (!commandName) return;

  let command =
    client.commands.get(commandName) ??
    client.commands.get(client.aliases.get(commandName) ?? '');
  let userAlias = false;

  if (!command) {
    // Per-user alias — private to the author, checked only after global
    // commands/aliases have failed to resolve (global names always win).
    const userAliased = client.userAliases.get(message.author.id)?.get(commandName);
    if (userAliased) {
      command =
        client.commands.get(userAliased) ??
        client.commands.get(client.aliases.get(userAliased) ?? '');
      userAlias = !!command;
    }
  }

  if (!command) {
    // ── Custom role dispatch ─────────────────────────────────────────────────
    // Only fires when a real prefix was used (never on noprefix — usedPrefix
    // is '' for noprefix, which is the enforced restriction by design).
    if (usedPrefix !== '' && client.db) {
      await dispatchCustomRole(message, commandName, args, client).catch((): null => null);
    }
    return;
  }

  // ── Developer-only gate ────────────────────────────────────────────────────
  // Commands use `owner: true` (xoxo convention). We also accept
  // `isDeveloper: true` for compatibility.
  const devOnly = command.options?.owner === true || command.options?.isDeveloper === true;
  if (devOnly && !isDeveloper) {
    await reservedForDeveloper({ message }).catch((): null => null);
    return;
  }
  if (client.db && !['disable-command', 'enable-command'].includes(command.options?.name?.toLowerCase())) {
    const disabled = await client.db.getDisabledCommand(command.options?.name ?? commandName).catch((): null => null);
    if (disabled) {
      await sendWarning({ message }, `${command.options?.name ?? commandName} has been disabled by the developer. Reason: ${disabled.reason}`).catch((): null => null);
      return;
    }
  }
  if (userAlias && !(await enforceUserAliasPermissions(message, command))) return;

  const subcommand = getPrefixSubcommand(args);
  const remainingCooldown = consumeCommandCooldown(client, command, message.author.id, subcommand);
  if (remainingCooldown > 0) {
    const configuredCooldown = getCommandCooldown(command, subcommand);
    await sendWarning(
      { message },
      `Please wait **${remainingCooldown}s** before using this command again. Cooldown: **${configuredCooldown}s**.`,
    ).catch((): null => null);
    return;
  }

  // ── Attach raw args to message for commands that need real newlines ────────
  // Strips the prefix + commandName token, preserving actual whitespace/newlines.
  const prefixAndCmd = message.content.startsWith(usedPrefix)
    ? message.content.slice(usedPrefix.length).trim().slice(commandName.length)
    : message.content.trim().slice(commandName.length);
  message.commandRawArgs = prefixAndCmd.trimStart();
  message.commandName = commandName;

  webhookLogger.logCommand(commandName, message.author, message.guild, args, {
    prefix: usedPrefix || '(noprefix)',
    type:   'Native',
  }, message.url, message.channelId);

  try {
    if (!command.options?.noTyping) await message.channel.sendTyping().catch((): null => null);
    await command.prefixExecute(
      withDeveloperPermissionBypass(message, isDeveloper),
      args,
      client,
    );
    client.db?.incrementGlobalCommandsExecuted?.().catch((): null => null);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof AmbiguousUserError) {
      await sendError({ message }, err.message).catch((): null => null);
    } else {
      console.error(`[messageCreate] Error in "${commandName}": ${msg}`);
    }
  }
}

/**
 * Personal aliases may target any loaded command, but they must not grant
 * access to a command the invoker could not use directly. The target command
 * still owns its own detailed checks; this gate enforces its declared
 * userPerms metadata for alias invocations.
 */
async function enforceUserAliasPermissions(message: any, command: any): Promise<boolean> {
  const required: string[] = Array.isArray(command?.options?.userPerms)
    ? command.options.userPerms
    : [];
  if (!required.length) return true;

  const missing = required.filter((permission) =>
    !message.member?.permissions?.has?.(permission),
  );
  if (!missing.length) return true;

  const readable = missing.map((permission) =>
    permission.replace(/([a-z])([A-Z])/g, '$1 $2'),
  ).join(', ');
  await sendError(
    { message },
    `You need **${readable}** permission to use this command.`,
  ).catch((): null => null);
  return false;
}

// ── No-prefix access resolver ──────────────────────────────────────────────

async function hasNoPrefixAccess(
  message: any,
  client: CassieClient,
  isDeveloper: boolean,
): Promise<boolean> {
  // A global disable applies to every user, including developers.
  if (!client.db) return false;

  try {
    const globalEnabled = await client.db.getNoprefixGlobalEnabled().catch((): boolean => false);
    if (!globalEnabled) return false;

    if (message.guild?.id) {
      const guildDisabled = await client.db.isGuildNoPrefixDisabled(message.guild.id).catch((): boolean => false);
      if (guildDisabled) return false;
    }

    // Developers have no-prefix access unless they've self-disabled it via $nop off.
    if (isDeveloper) {
      const selfDisabled = await client.db.isDevNoprefixSelfDisabled(message.author.id, message.guild.id).catch((): boolean => false);
      return !selfDisabled;
    }

    return await client.db.isNoPrefixUser(message.author.id, message.guild?.id).catch((): boolean => false);
  } catch {
    return false;
  }
}
