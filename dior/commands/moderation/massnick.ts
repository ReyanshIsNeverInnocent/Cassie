// xoxo/commands/moderation/massnick.ts
//
// Change the server nickname of every member (or a targeted subset) at once.
//
// Modes:
//   massnick prepend <word>   — "word CurrentNick"
//   massnick prefix  <word>   — alias for prepend
//   massnick append  <word>   — "CurrentNick word"
//   massnick suffix  <word>   — alias for append
//   massnick remove  <word>   — remove all occurrences of <word> from each nick
//   massnick reset            — remove all server nicknames
//
// After providing the mode and word, an interactive panel lets the invoker
// choose who is affected:
//   Row 1 — All Members | Humans Only | Bots Only
//   Row 2 — Specific Role (role dropdown) | Members (type them) | Cancel
//
// prepend/append/remove work on the member's effective displayed name:
//   — their server nickname if one is set, otherwise globalName / username.
// Nicknames are capped at 32 characters (Discord limit).
//
// Requires ManageNicknames (+ ManageGuild recommended).

import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendLoading, sendSuccess } from '../../components/statusMessages.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import {
  buildActionConfirmPayload,
  buildActionTimedOutPayload,
  buildActionCancelledPayload,
} from '../../components/purgeConfirm.js';
import { resolveUser } from '../../helpers/userResolver.js';
import {
  buildMassNickTargetPanel,
  buildMassNickRoleSelectPage,
  buildMassNickMembersPromptPage,
  buildMassNickProgressPayload,
  buildMassNickResultPayload,
  buildMassNickCancelledPayload,
  targetDisplayLabel,
  type MassNickMode,
} from '../../components/moderation/massnick.js';

export const options = {
  name:        'massnick',
  aliases:     ['massnickname'] as string[],
  description: 'Change the nickname of every member at once (prepend, append, remove, or reset).',
  usage: `massnick prepend <word>
massnick append  <word>
massnick remove  <word>
massnick reset`,
  category: 'moderation',
  owner:    false,
  cooldown: 10,
};

const MAX_NICK = 32;

const MODES = ['prepend', 'prefix', 'append', 'suffix', 'remove', 'reset'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Get the effective base name — server nickname, globalName, or username. */
function effectiveName(member: any): string {
  return member.nickname ?? member.user.globalName ?? member.user.username;
}

/**
 * Parse a space-separated member list from a raw string.
 * Accepts: @mentions, raw user IDs, usernames.
 * Returns deduplicated array of user IDs (up to 10).
 */
async function parseMembers(
  input:  string,
  guild:  any,
  client: CassieClient,
): Promise<string[]> {
  const tokens = input.trim().split(/\s+/).slice(0, 10);
  const ids    = new Set<string>();

  for (const token of tokens) {
    // Mention: <@123> or <@!123>
    const mentionMatch = token.match(/^<@!?(\d{17,20})>$/);
    if (mentionMatch) { ids.add(mentionMatch[1]); continue; }

    // Raw numeric ID
    if (/^\d{17,20}$/.test(token)) { ids.add(token); continue; }

    // Username / display name — try to resolve from guild cache
    const resolved = await resolveUser(client, guild, token).catch((): null => null);
    if (resolved) ids.add(resolved.id);
  }

  return [...ids];
}

// ─────────────────────────────────────────────────────────────────────────────
// Core mass-nickname logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply the mass-nick operation to the guild.
 *
 * targetType  — 'all' | 'humans' | 'bots' | `role:<roleId>` | 'members'
 * specificIds — required when targetType === 'members'
 */
async function runMassNick(
  panel:       any,
  guild:       any,
  mode:        MassNickMode,
  word:        string | null,
  targetType:  string,
  displayLabel: string,
  invoker:     string,
  client:      CassieClient,
  specificIds: string[] = [],
): Promise<void> {
  await panel.edit(buildMassNickProgressPayload(mode, word, displayLabel)).catch((): null => null);

  let members: Map<string, any>;
  try {
    members = await guild.members.fetch();
  } catch {
    members = guild.members.cache;
  }

  // If targeting specific members, only fetch/use those
  if (targetType === 'members' && specificIds.length > 0) {
    const subset = new Map<string, any>();
    for (const id of specificIds) {
      const m =
        members.get(id) ??
        (await guild.members.fetch(id).catch((): null => null));
      if (m) subset.set(id, m);
    }
    members = subset;
  }

  let changed = 0;
  let failed  = 0;
  let skipped = 0;

  const auditReason = `massnick ${mode}${word ? ` "${word}"` : ''} (${displayLabel}) by ${invoker}`;
  const selfId      = client.user?.id;

  // Build remove regex once (case-insensitive)
  const removeRegex = (mode === 'remove' && word)
    ? new RegExp(escapeRegex(word), 'gi')
    : null;

  // Role-based target: extract role ID
  const roleId = targetType.startsWith('role:') ? targetType.slice(5) : null;

  for (const [, member] of members) {
    // ── Target type filter ──────────────────────────────────────────────────
    if (targetType === 'humans' && member.user.bot)  continue;
    if (targetType === 'bots'   && !member.user.bot) continue;
    if (roleId && !member.roles.cache.has(roleId))   continue;

    // ── Manageability check ─────────────────────────────────────────────────
    const isSelf = selfId && member.user.id === selfId;
    if (!isSelf && !member.manageable) { failed++; continue; }

    // ── Compute new nickname ────────────────────────────────────────────────
    let newNick: string | null;

    if (mode === 'reset') {
      if (member.nickname === null) { skipped++; continue; }
      newNick = null;
    } else if (mode === 'remove') {
      const base     = effectiveName(member);
      const stripped = base.replace(removeRegex!, '').replace(/\s+/g, ' ').trim();
      if (stripped === base) { skipped++; continue; }
      const globalBase = member.user.globalName ?? member.user.username;
      newNick = stripped === globalBase ? null : stripped.slice(0, MAX_NICK) || null;
    } else if (mode === 'prepend' || mode === 'prefix') {
      const base = effectiveName(member);
      newNick = `${word} ${base}`.slice(0, MAX_NICK);
    } else {
      // append / suffix
      const base = effectiveName(member);
      newNick = `${base} ${word}`.slice(0, MAX_NICK);
    }

    if (newNick !== null && newNick === member.nickname) { skipped++; continue; }

    const ok = await member
      .setNickname(newNick, auditReason)
      .then(() => true)
      .catch(() => false);

    if (ok) changed++;
    else    failed++;
  }

  await panel
    .edit(buildMassNickResultPayload(mode, word, displayLabel, changed, skipped, failed))
    .catch((): null => null);
}

async function askMassNickConfirmation(
  panel: any,
  authorId: string,
  guild: any,
  mode: MassNickMode,
  word: string | null,
  targetType: string,
  displayLabel: string,
  invoker: string,
  token: string,
  client: CassieClient,
  specificIds: string[] = [],
): Promise<void> {
  const confirmId = `massnick:confirm:${token}`;
  const cancelId = `massnick:cancel:${token}`;
  const operation = `${mode}${word ? ` \`${word}\`` : ''}`;
  const description =
    `**Warning:** This bulk action may change many server nicknames and cannot be undone automatically.\n\n` +
    `Apply **${operation}** to **${displayLabel}**?`;

  await panel.edit(buildActionConfirmPayload(confirmId, cancelId, 'Confirm Mass Nickname', description));
  const collector = panel.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
      i,
      authorId,
      (id) => id === confirmId || id === cancelId,
    ),
    max: 1,
    time: 30_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    if (i.customId === confirmId) {
      await runMassNick(panel, guild, mode, word, targetType, displayLabel, invoker, client, specificIds);
      return;
    }
    await panel.edit(buildActionCancelledPayload(confirmId, cancelId, 'Confirm Mass Nickname', description))
      .catch((): null => null);
  });

  collector.on('end', (_: any, reason: string) => {
    if (reason !== 'time') return;
    panel.edit(buildActionTimedOutPayload(confirmId, cancelId, 'Confirm Mass Nickname', description))
      .catch((): null => null);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared collector logic (used by both prefix and slash flows)
// ─────────────────────────────────────────────────────────────────────────────

function attachCollector(
  panel:      any,
  channel:    any,
  authorId:   string,
  guild:      any,
  mode:       MassNickMode,
  word:       string | null,
  token:      string,
  invoker:    string,
  client:     CassieClient,
): void {
  // Track which page is currently rendered so we know what to disable on timeout.
  let currentPage: 'buttons' | 'role_select' = 'buttons';

  // No max — we stop manually so role/members multi-step works.
  // 5-minute timeout: on expiry, disable the active page's controls instead
  // of replacing the panel with a plain-text "timed out" message.
  const collector = panel.createMessageComponentCollector({
    filter: (i: any) => {
      if (!i.customId.startsWith('massnick:') || !i.customId.endsWith(`:${token}`)) return false;
      if (i.user.id !== authorId) {
        i.reply({ content: 'Only the person who ran this command can use this.', flags: MessageFlags.Ephemeral })
          .catch((): null => null);
        return false;
      }
      return true;
    },
    time: 300_000, // 5 minutes
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    const parts  = i.customId.split(':');
    const action = parts[1] as string;

    // ── Simple targets: run immediately ──────────────────────────────────
    if (action === 'all' || action === 'humans' || action === 'bots') {
      const label = targetDisplayLabel(action);
      collector.stop('confirm');
      await askMassNickConfirmation(panel, authorId, guild, mode, word, action, label, invoker, token, client);
      return;
    }

    if (action === 'cancel') {
      await panel.edit(buildMassNickCancelledPayload()).catch((): null => null);
      collector.stop('done');
      return;
    }

    // ── Specific Role: switch to role dropdown page ───────────────────────
    if (action === 'role') {
      currentPage = 'role_select';
      await panel.edit(buildMassNickRoleSelectPage(mode, word, token)).catch((): null => null);
      // Collector continues — next interaction will be role_select
      return;
    }

    // ── Role select menu interaction ──────────────────────────────────────
    if (action === 'role_select') {
      const roleId     = i.values[0] as string;
      const roleName   = guild.roles.cache.get(roleId)?.name ?? roleId;
      const targetType = `role:${roleId}`;
      const label      = `members with role **${roleName}**`;
      collector.stop('confirm');
      await askMassNickConfirmation(panel, authorId, guild, mode, word, targetType, label, invoker, token, client);
      return;
    }

    // ── Members: prompt for a message, then collect it ────────────────────
    if (action === 'members') {
      await panel.edit(buildMassNickMembersPromptPage(mode, word)).catch((): null => null);
      collector.stop('members'); // stop button collector; take over with a message collector

      const msgCollector = channel.createMessageCollector({
        filter: (m: any) => m.author.id === authorId,
        max:    1,
        time:   60_000,
      });

      msgCollector.on('collect', async (msg: any) => {
        await msg.delete().catch((): null => null);
        const ids = await parseMembers(msg.content, guild, client);

        if (!ids.length) {
          await panel.edit(buildMassNickCancelledPayload()).catch((): null => null);
          return;
        }

        const label = `**${ids.length}** specific member${ids.length !== 1 ? 's' : ''}`;
        await askMassNickConfirmation(panel, authorId, guild, mode, word, 'members', label, invoker, token, client, ids);
      });

      // Members prompt has no buttons — nothing to disable on timeout; just leave it.
      msgCollector.on('end', (_collected: any, _reason: string) => { /* no-op */ });
    }
  });

  collector.on('end', async (_: any, reason: string) => {
    if (reason !== 'time') return; // 'done' / 'members' handled inline

    // Disable whichever page is currently visible
    if (currentPage === 'role_select') {
      await panel.edit(buildMassNickRoleSelectPage(mode, word, token, true)).catch((): null => null);
    } else {
      await panel.edit(buildMassNickTargetPanel(mode, word, guild.memberCount, token, true)).catch((): null => null);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Prefix execute
// ─────────────────────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx   = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.ManageNicknames)) {
    return sendError(ctx, 'You need the **Manage Nicknames** permission to use this command.');
  }
  if (!guild.members.me?.permissions?.has?.(PermissionFlagsBits.ManageNicknames)) {
    return sendError(ctx, 'I need the **Manage Nicknames** permission to change nicknames.');
  }

  const mode = args[0]?.toLowerCase() as MassNickMode | undefined;
  if (!mode || !(MODES as readonly string[]).includes(mode)) {
    return sendError(ctx, `Usage:\n\`\`\`\n${options.usage}\n\`\`\``);
  }

  const isReset = mode === 'reset';
  let word: string | null = null;
  if (!isReset) {
    word = args[1] ?? null;
    if (!word) {
      const verb = mode === 'remove' ? 'remove' : (mode === 'prepend' || mode === 'prefix') ? 'prepend' : 'append';
      return sendError(ctx, `Provide a single word to ${verb}. Example: \`massnick ${mode} HLW\``);
    }
    if (/\s/.test(word)) {
      return sendError(ctx, 'The word must contain no spaces. Use a single token.');
    }
  }

  const token = `${message.id}-${Date.now()}`;
  const panel = await message.channel
    .send(buildMassNickTargetPanel(mode, word, guild.memberCount, token))
    .catch((): null => null);
  if (!panel) return;

  attachCollector(
    panel,
    message.channel,
    message.author.id,
    guild,
    mode,
    word,
    token,
    message.author.username,
    client,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Slash execute
// ─────────────────────────────────────────────────────────────────────────────

export async function slashExecute(
  interaction: any,
  client:      CassieClient,
): Promise<any> {
  const ctx   = { interaction };
  const guild = interaction.guild;
  if (!guild) {
    await interaction.deferReply();
    return sendError(ctx, 'This command can only be used in a server.');
  }

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.ManageNicknames)) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return sendError(ctx, 'You need the **Manage Nicknames** permission to use this command.');
  }
  if (!guild.members.me?.permissions?.has?.(PermissionFlagsBits.ManageNicknames)) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return sendError(ctx, 'I need the **Manage Nicknames** permission to change nicknames.');
  }

  const sub  = interaction.options.getSubcommand() as string;
  const word: string | null = interaction.options.getString('word') ?? null;
  const mode = sub as MassNickMode;

  if (mode !== 'reset' && word && /\s/.test(word)) {
    await interaction.deferReply();
    return sendError(ctx, 'The word must contain no spaces. Use a single token.');
  }

  const token = `${interaction.id}-${Date.now()}`;
  await interaction.reply(buildMassNickTargetPanel(mode, word, guild.memberCount, token));
  const panel = await interaction.fetchReply().catch((): null => null);
  if (!panel) return;

  attachCollector(
    panel,
    interaction.channel,
    interaction.user.id,
    guild,
    mode,
    word,
    token,
    interaction.user.username,
    client,
  );
}
